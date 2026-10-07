import { addDays, format, startOfDay } from 'date-fns'
import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, inDateRange, matchesText, notFound, paginate } from '../core'
import {
  currentAssignmentOf,
  currentAssignmentOfDriver,
  diff,
  documentStatus,
  recordAudit,
  toAssignment,
  toBooking,
  toDriverSummary,
  toTrip,
  toVehicleSummary,
} from '../mappers'
import { assertDriverDispatchable, assertVehicleDispatchable } from './assignments'

const auditTrip = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'TRIP',
    entityId: row.id,
    entityLabel: row.tripNumber,
    changes,
  })

const findTrip = (id) => {
  const t = getDb().trips.find((x) => x.id === Number(id))
  if (!t) throw notFound('Trip')
  return t
}

function validateTrip(input) {
  const errors = []
  if (!input.vehicleId) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (!input.driverId) errors.push({ field: 'driverId', message: 'Choose a driver.' })
  if (!input.startLocation?.trim()) errors.push({ field: 'startLocation', message: 'Start location is required.' })
  if (!input.destination?.trim()) errors.push({ field: 'destination', message: 'Destination is required.' })
  if (!input.scheduledStartAt) errors.push({ field: 'scheduledStartAt', message: 'Scheduled start is required.' })
  if (!input.purpose?.trim()) errors.push({ field: 'purpose', message: 'Purpose is required.' })
  const pax = Number(input.passengers)
  if (!Number.isInteger(pax) || pax < 0) errors.push({ field: 'passengers', message: 'Enter a whole number.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

/** Vehicle must be usable and the driver must be its current driver or free. */
function assertTripResources(vehicle, driver, { existingTrip = null } = {}) {
  if (!vehicle || vehicle.archived) throw notFound('Vehicle')
  if (!driver || driver.archived) throw notFound('Driver')
  if (['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE'].includes(vehicle.status))
    throw businessRule(`${vehicle.plateNumber} is ${vehicle.status.replace(/_/g, ' ').toLowerCase()} and cannot be dispatched.`)
  const seats = vehicle.seatingCapacity
  if (existingTrip && existingTrip.passengers > seats)
    throw businessRule(`${vehicle.plateNumber} seats ${seats}; the trip has ${existingTrip.passengers} passengers.`)
  const expired = getDb().documents.filter(
    (x) =>
      x.ownerType === 'VEHICLE' &&
      x.ownerId === vehicle.id &&
      ['INSURANCE', 'INSPECTION', 'ROAD_LICENCE'].includes(x.type) &&
      documentStatus(x.expiryDate).status === 'EXPIRED',
  )
  if (expired.length)
    throw businessRule(`${vehicle.plateNumber} has expired ${expired.map((x) => x.type.replace(/_/g, ' ').toLowerCase()).join(', ')}.`)
  if (['ON_LEAVE', 'SUSPENDED', 'INACTIVE'].includes(driver.status))
    throw businessRule(`${driver.fullName} is ${driver.status.replace(/_/g, ' ').toLowerCase()}.`)
  if (documentStatus(driver.licenseExpiry).status === 'EXPIRED') throw businessRule(`${driver.fullName}'s driving licence has expired.`)
  const assignment = currentAssignmentOf(vehicle.id)
  if (assignment && assignment.driverId !== driver.id) {
    const other = currentAssignmentOfDriver(driver.id)
    if (other) throw businessRule(`${driver.fullName} is assigned to another vehicle, and ${vehicle.plateNumber} already has a driver.`)
  }
}

function assertNoOverlap(vehicleId, driverId, scheduledStartAt, excludeTripId = null) {
  const d = getDb()
  const start = new Date(scheduledStartAt).getTime()
  const window = 60 * 60 * 1000
  const clash = d.trips.find(
    (t) =>
      t.id !== excludeTripId &&
      ['PLANNED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status) &&
      (t.vehicleId === vehicleId || t.driverId === driverId) &&
      Math.abs(new Date(t.scheduledStartAt).getTime() - start) < window,
  )
  if (clash)
    throw businessRule(
      `${clash.vehicleId === vehicleId ? 'The vehicle' : 'The driver'} already has trip ${clash.tripNumber} scheduled within an hour of this time.`,
    )
}

get(
  '/trips',
  ({ query }) => {
    const list = getDb()
      .trips.map(toTrip)
      .filter((t) =>
        matchesText([t.tripNumber, t.vehiclePlate, t.driverName, t.customerName, t.destination, t.startLocation, t.bookingNumber], query.q),
      )
      .filter((t) => !query.status || query.status.split(',').includes(t.status))
      .filter((t) => !query.vehicleId || t.vehicleId === Number(query.vehicleId))
      .filter((t) => !query.driverId || t.driverId === Number(query.driverId))
      .filter((t) => inDateRange(t.scheduledStartAt, query.from, query.to))
    return paginate(list, query, 'scheduledStartAt,desc')
  },
  { permission: 'TRIP_READ' },
)

get('/trips/:id', ({ params }) => toTrip(findTrip(params.id)), { permission: 'TRIP_READ' })

post(
  '/trips',
  ({ body, user }) => {
    validateTrip(body)
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(body.vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(body.driverId))
    assertTripResources(vehicle, driver, { existingTrip: { passengers: Number(body.passengers) } })
    assertNoOverlap(vehicle.id, driver.id, body.scheduledStartAt)
    const now = new Date().toISOString()
    const id = nextId('trip')
    const start = new Date(body.scheduledStartAt)
    let booking = null
    if (body.bookingId) {
      booking = d.bookings.find((b) => b.id === Number(body.bookingId))
      if (!booking) throw notFound('Booking')
      if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw businessRule('This booking is closed.')
    }
    const row = {
      id,
      tripNumber: `TR-${format(start, 'yyMMdd')}-${String(id).padStart(4, '0')}`,
      vehicleId: vehicle.id,
      driverId: driver.id,
      customerName: body.customerName?.trim() || booking?.company || booking?.customerName || null,
      bookingId: booking?.id ?? null,
      startLocation: body.startLocation.trim(),
      destination: body.destination.trim(),
      scheduledStartAt: start.toISOString(),
      startedAt: null,
      endedAt: null,
      startOdometer: null,
      endOdometer: null,
      fuelUsedLitres: null,
      maxSpeedKph: null,
      purpose: body.purpose.trim(),
      passengers: Number(body.passengers),
      status: 'PLANNED',
      notes: body.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }
    d.trips.push(row)
    if (booking) {
      booking.vehicleId = vehicle.id
      booking.driverId = driver.id
      if (['REQUESTED', 'CONFIRMED'].includes(booking.status)) booking.status = 'ASSIGNED'
      booking.updatedAt = now
    }
    auditTrip(user, 'CREATE', row)
    persist()
    return toTrip(row)
  },
  { permission: 'TRIP_MANAGE' },
)

put(
  '/trips/:id',
  ({ params, body, user }) => {
    const row = findTrip(params.id)
    if (['COMPLETED', 'CANCELLED'].includes(row.status)) throw businessRule('Completed or cancelled trips cannot be edited.')
    if (row.status === 'IN_PROGRESS') throw businessRule('A trip in progress cannot be edited. Complete it to record the final odometer.')
    validateTrip(body)
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(body.vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(body.driverId))
    assertTripResources(vehicle, driver, { existingTrip: { passengers: Number(body.passengers) } })
    assertNoOverlap(vehicle.id, driver.id, body.scheduledStartAt, row.id)
    const before = { ...row }
    Object.assign(row, {
      vehicleId: vehicle.id,
      driverId: driver.id,
      customerName: body.customerName?.trim() || null,
      startLocation: body.startLocation.trim(),
      destination: body.destination.trim(),
      scheduledStartAt: new Date(body.scheduledStartAt).toISOString(),
      purpose: body.purpose.trim(),
      passengers: Number(body.passengers),
      notes: body.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    auditTrip(user, 'UPDATE', row, diff(before, row))
    persist()
    return toTrip(row)
  },
  { permission: 'TRIP_MANAGE' },
)

const transitions = {
  PLANNED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
}

patch(
  '/trips/:id/status',
  ({ params, body, user }) => {
    const row = findTrip(params.id)
    const { status, startOdometer, endOdometer, reason, fuelUsedLitres, maxSpeedKph } = body ?? {}
    if (!transitions[row.status]?.includes(status))
      throw businessRule(
        `A ${row.status.toLowerCase().replace(/_/g, ' ')} trip cannot move to ${String(status).toLowerCase().replace(/_/g, ' ')}.`,
      )
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const driver = d.drivers.find((x) => x.id === row.driverId)
    const now = new Date().toISOString()
    const from = row.status
    if (status === 'DISPATCHED') {
      assertTripResources(vehicle, driver, { existingTrip: row })
    }
    if (status === 'IN_PROGRESS') {
      assertTripResources(vehicle, driver, { existingTrip: row })
      if (vehicle.status === 'ON_TRIP') throw businessRule(`${vehicle.plateNumber} is already on another trip.`)
      if (driver.status === 'ON_TRIP') throw businessRule(`${driver.fullName} is already on another trip.`)
      const odo = startOdometer == null || startOdometer === '' ? vehicle.odometerKm : Number(startOdometer)
      if (!Number.isFinite(odo) || odo < vehicle.odometerKm)
        throw badRequest(`Start odometer cannot be below the vehicle's current reading of ${vehicle.odometerKm.toLocaleString()} km.`, [
          { field: 'startOdometer', message: `At least ${vehicle.odometerKm.toLocaleString()} km.` },
        ])
      row.startOdometer = odo
      row.startedAt = now
      vehicle.status = 'ON_TRIP'
      driver.status = 'ON_TRIP'
      vehicle.odometerKm = odo
      const booking = row.bookingId ? d.bookings.find((b) => b.id === row.bookingId) : null
      if (booking) {
        booking.status = 'IN_PROGRESS'
        booking.updatedAt = now
      }
    }
    if (status === 'COMPLETED') {
      const odo = Number(endOdometer)
      if (!Number.isFinite(odo))
        throw badRequest('Enter the odometer reading at the end of the trip.', [{ field: 'endOdometer', message: 'Required.' }])
      if (odo < row.startOdometer)
        throw badRequest(`End odometer cannot be below the start reading of ${row.startOdometer.toLocaleString()} km.`, [
          { field: 'endOdometer', message: `At least ${row.startOdometer.toLocaleString()} km.` },
        ])
      if (odo - row.startOdometer > 2000)
        throw badRequest('A single trip over 2,000 km looks like a typo. Check the reading.', [
          { field: 'endOdometer', message: 'Unrealistic distance.' },
        ])
      row.endOdometer = odo
      row.endedAt = now
      row.fuelUsedLitres = fuelUsedLitres != null && fuelUsedLitres !== '' ? Number(fuelUsedLitres) : null
      row.maxSpeedKph = maxSpeedKph != null && maxSpeedKph !== '' ? Number(maxSpeedKph) : null
      vehicle.odometerKm = Math.max(vehicle.odometerKm, odo)
      vehicle.status = currentAssignmentOf(vehicle.id) ? 'ASSIGNED' : 'AVAILABLE'
      driver.status = currentAssignmentOfDriver(driver.id) ? 'ASSIGNED' : 'AVAILABLE'
      const booking = row.bookingId ? d.bookings.find((b) => b.id === row.bookingId) : null
      if (booking) {
        booking.status = 'COMPLETED'
        booking.updatedAt = now
      }
      const key = row.startedAt.slice(0, 10)
      const existing = d.movements.find((m) => m.vehicleId === vehicle.id && m.date === key)
      const minutes = Math.round((new Date(now) - new Date(row.startedAt)) / 60000)
      if (existing) {
        existing.distanceKm += odo - row.startOdometer
        existing.tripCount += 1
        existing.drivingMinutes += minutes
        existing.lastMovementAt = now
        existing.maxSpeedKph = Math.max(existing.maxSpeedKph, row.maxSpeedKph ?? 0)
      } else
        d.movements.push({
          vehicleId: vehicle.id,
          date: key,
          distanceKm: odo - row.startOdometer,
          firstMovementAt: row.startedAt,
          lastMovementAt: now,
          drivingMinutes: minutes,
          idleMinutes: 0,
          maxSpeedKph: row.maxSpeedKph ?? 0,
          tripCount: 1,
          nightDriving: false,
        })
    }
    if (status === 'CANCELLED') {
      row.notes = reason?.trim() ? `${row.notes ? row.notes + ' · ' : ''}Cancelled: ${reason.trim()}` : row.notes
      const booking = row.bookingId ? d.bookings.find((b) => b.id === row.bookingId) : null
      if (booking && booking.status === 'ASSIGNED') {
        booking.status = 'CONFIRMED'
        booking.vehicleId = null
        booking.driverId = null
        booking.updatedAt = now
      }
    }
    row.status = status
    row.updatedAt = now
    vehicle.updatedAt = driver.updatedAt = now
    auditTrip(user, 'STATUS_CHANGE', row, [{ field: 'status', from, to: status }])
    persist()
    return toTrip(row)
  },
  { permission: 'TRIP_MANAGE' },
)

// ---------- Dispatch board ----------

get(
  '/dispatch/board',
  ({ query }) => {
    const d = getDb()
    const date = query.date ?? format(new Date(), 'yyyy-MM-dd')
    const dayStart = startOfDay(new Date(date))
    const dayEnd = addDays(dayStart, 1)
    const inDay = (iso) => iso && new Date(iso) >= dayStart && new Date(iso) < dayEnd
    const trips = d.trips.map(toTrip)
    const sortByTime = (k) => (a, b) => (a[k] ?? '').localeCompare(b[k] ?? '')
    return {
      date,
      departures: trips.filter((t) => inDay(t.scheduledStartAt) && t.status !== 'CANCELLED').sort(sortByTime('scheduledStartAt')),
      expectedReturns: trips
        .filter((t) => ['IN_PROGRESS', 'DISPATCHED'].includes(t.status) && inDay(t.scheduledStartAt))
        .sort(sortByTime('scheduledStartAt')),
      currentTrips: trips.filter((t) => t.status === 'IN_PROGRESS').sort(sortByTime('startedAt')),
      upcomingBookings: d.bookings
        .filter(
          (b) =>
            ['REQUESTED', 'CONFIRMED', 'ASSIGNED'].includes(b.status) &&
            new Date(b.pickupAt) >= dayStart &&
            new Date(b.pickupAt) < addDays(dayStart, 3),
        )
        .map(toBooking)
        .sort(sortByTime('pickupAt')),
      availableVehicles: d.vehicles
        .filter((v) => !v.archived && ['AVAILABLE', 'ASSIGNED', 'RESERVED'].includes(v.status))
        .map(toVehicleSummary),
      availableDrivers: d.drivers.filter((x) => !x.archived && ['AVAILABLE', 'ASSIGNED'].includes(x.status)).map(toDriverSummary),
      assignedVehicles: d.assignments.filter((a) => a.status === 'ACTIVE').map(toAssignment),
      counts: {
        vehiclesOnTrip: d.vehicles.filter((v) => v.status === 'ON_TRIP').length,
        vehiclesInWorkshop: d.vehicles.filter((v) => v.status === 'IN_MAINTENANCE').length,
        unassignedBookings: d.bookings.filter((b) => ['REQUESTED', 'CONFIRMED'].includes(b.status) && new Date(b.pickupAt) >= dayStart)
          .length,
      },
    }
  },
  { permission: 'DISPATCH_VIEW' },
)

export { assertDriverDispatchable, assertVehicleDispatchable }
