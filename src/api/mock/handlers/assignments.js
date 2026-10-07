import { get, post, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, inDateRange, matchesText, notFound, paginate } from '../core'
import { currentAssignmentOf, currentAssignmentOfDriver, documentStatus, recordAudit, toAssignment } from '../mappers'

const findAssignment = (id) => {
  const a = getDb().assignments.find((x) => x.id === Number(id))
  if (!a) throw notFound('Assignment')
  return a
}

/** Shared dispatch validation, used by assignments, bookings and trips. */
export function assertVehicleDispatchable(vehicle, { allowAssigned = false } = {}) {
  if (!vehicle || vehicle.archived) throw notFound('Vehicle')
  if (vehicle.status === 'IN_MAINTENANCE') throw businessRule(`${vehicle.plateNumber} is in maintenance and cannot be dispatched.`)
  if (vehicle.status === 'OUT_OF_SERVICE') throw businessRule(`${vehicle.plateNumber} is out of service.`)
  if (vehicle.status === 'INACTIVE') throw businessRule(`${vehicle.plateNumber} is inactive.`)
  if (vehicle.status === 'ON_TRIP') throw businessRule(`${vehicle.plateNumber} is currently on a trip.`)
  if (!allowAssigned && currentAssignmentOf(vehicle.id))
    throw businessRule(`${vehicle.plateNumber} is already assigned to a driver. End that assignment first.`)
  const d = getDb()
  const expired = d.documents.filter(
    (x) =>
      x.ownerType === 'VEHICLE' &&
      x.ownerId === vehicle.id &&
      ['INSURANCE', 'INSPECTION', 'ROAD_LICENCE'].includes(x.type) &&
      documentStatus(x.expiryDate).status === 'EXPIRED',
  )
  if (expired.length)
    throw businessRule(
      `${vehicle.plateNumber} has expired ${expired.map((x) => x.type.replace(/_/g, ' ').toLowerCase()).join(', ')}. Renew the document before dispatching.`,
    )
}

export function assertDriverDispatchable(driver, { allowAssigned = false, vehicleId = null } = {}) {
  if (!driver || driver.archived) throw notFound('Driver')
  if (['ON_LEAVE', 'SUSPENDED', 'INACTIVE', 'OFF_DUTY'].includes(driver.status))
    throw businessRule(`${driver.fullName} is ${driver.status.replace(/_/g, ' ').toLowerCase()} and cannot be assigned.`)
  if (driver.status === 'ON_TRIP') throw businessRule(`${driver.fullName} is currently on a trip.`)
  if (documentStatus(driver.licenseExpiry).status === 'EXPIRED')
    throw businessRule(`${driver.fullName}'s driving licence expired on ${driver.licenseExpiry}.`)
  const active = currentAssignmentOfDriver(driver.id)
  if (active && !(allowAssigned && active.vehicleId === vehicleId))
    throw businessRule(`${driver.fullName} is already assigned to another vehicle. End that assignment first.`)
}

get(
  '/assignments',
  ({ query }) => {
    const list = getDb()
      .assignments.map(toAssignment)
      .filter((a) => matchesText([a.vehiclePlate, a.driverName, a.purpose], query.q))
      .filter((a) => !query.status || a.status === query.status)
      .filter((a) => !query.vehicleId || a.vehicleId === Number(query.vehicleId))
      .filter((a) => !query.driverId || a.driverId === Number(query.driverId))
      .filter((a) => inDateRange(a.startAt, query.from, query.to))
    return paginate(list, query, 'startAt,desc')
  },
  { permission: 'VEHICLE_READ' },
)

get('/assignments/:id', ({ params }) => toAssignment(findAssignment(params.id)), { permission: 'VEHICLE_READ' })

post(
  '/assignments',
  ({ body, user }) => {
    const input = body ?? {}
    const errors = []
    if (!input.vehicleId) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
    if (!input.driverId) errors.push({ field: 'driverId', message: 'Choose a driver.' })
    if (!input.purpose?.trim()) errors.push({ field: 'purpose', message: 'Purpose is required.' })
    if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(input.vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(input.driverId))
    assertVehicleDispatchable(vehicle)
    assertDriverDispatchable(driver)
    const now = new Date().toISOString()
    const row = {
      id: nextId('assignment'),
      vehicleId: vehicle.id,
      driverId: driver.id,
      startAt: input.startAt || now,
      endAt: null,
      assignedById: user.id,
      purpose: input.purpose.trim(),
      odometerAtStart: vehicle.odometerKm,
      odometerAtEnd: null,
      status: 'ACTIVE',
      comments: input.comments?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }
    d.assignments.push(row)
    if (vehicle.status === 'AVAILABLE' || vehicle.status === 'RESERVED') vehicle.status = 'ASSIGNED'
    if (driver.status === 'AVAILABLE') driver.status = 'ASSIGNED'
    vehicle.updatedAt = driver.updatedAt = now
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'ASSIGN',
      entityType: 'VEHICLE',
      entityId: vehicle.id,
      entityLabel: vehicle.plateNumber,
      changes: [{ field: 'driver', from: null, to: driver.fullName }],
    })
    persist()
    return toAssignment(row)
  },
  { permission: 'ASSIGNMENT_MANAGE' },
)

patch(
  '/assignments/:id/end',
  ({ params, body, user }) => {
    const row = findAssignment(params.id)
    if (row.status !== 'ACTIVE') throw businessRule('This assignment has already ended.')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const driver = d.drivers.find((x) => x.id === row.driverId)
    if (vehicle?.status === 'ON_TRIP') throw businessRule('The vehicle is on a trip. Complete the trip before ending the assignment.')
    const odo =
      body?.odometerAtEnd != null && body.odometerAtEnd !== '' ? Number(body.odometerAtEnd) : (vehicle?.odometerKm ?? row.odometerAtStart)
    if (!Number.isFinite(odo) || odo < row.odometerAtStart)
      throw badRequest(`Odometer at return cannot be below ${row.odometerAtStart.toLocaleString()} km.`, [
        { field: 'odometerAtEnd', message: `Must be at least ${row.odometerAtStart.toLocaleString()} km.` },
      ])
    const now = new Date().toISOString()
    Object.assign(row, {
      status: 'ENDED',
      endAt: now,
      odometerAtEnd: odo,
      comments: body?.comments?.trim() || row.comments,
      updatedAt: now,
    })
    if (vehicle) {
      vehicle.odometerKm = Math.max(vehicle.odometerKm, odo)
      if (vehicle.status === 'ASSIGNED') vehicle.status = 'AVAILABLE'
      vehicle.updatedAt = now
    }
    if (driver && driver.status === 'ASSIGNED') {
      driver.status = 'AVAILABLE'
      driver.updatedAt = now
    }
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'ASSIGNMENT',
      entityId: row.id,
      entityLabel: `${vehicle?.plateNumber} / ${driver?.fullName}`,
      changes: [{ field: 'status', from: 'ACTIVE', to: 'ENDED' }],
    })
    persist()
    return toAssignment(row)
  },
  { permission: 'ASSIGNMENT_MANAGE' },
)

patch(
  '/assignments/:id/cancel',
  ({ params, body, user }) => {
    const row = findAssignment(params.id)
    if (row.status !== 'ACTIVE') throw businessRule('Only active assignments can be cancelled.')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const driver = d.drivers.find((x) => x.id === row.driverId)
    if (vehicle?.status === 'ON_TRIP') throw businessRule('The vehicle is on a trip and the assignment cannot be cancelled now.')
    const now = new Date().toISOString()
    Object.assign(row, { status: 'CANCELLED', endAt: now, comments: body?.reason?.trim() || row.comments, updatedAt: now })
    if (vehicle && vehicle.status === 'ASSIGNED') {
      vehicle.status = 'AVAILABLE'
      vehicle.updatedAt = now
    }
    if (driver && driver.status === 'ASSIGNED') {
      driver.status = 'AVAILABLE'
      driver.updatedAt = now
    }
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'ASSIGNMENT',
      entityId: row.id,
      entityLabel: `${vehicle?.plateNumber} / ${driver?.fullName}`,
      changes: [{ field: 'status', from: 'ACTIVE', to: 'CANCELLED' }],
    })
    persist()
    return toAssignment(row)
  },
  { permission: 'ASSIGNMENT_MANAGE' },
)
