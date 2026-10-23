import { addDays, format, parseISO, startOfDay } from 'date-fns'
import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, forbidden, inDateRange, matchesText, notFound, paginate } from '../core'
import {
  companyById,
  currentAssignmentOf,
  currentAssignmentOfDriver,
  deploymentAmountOf,
  diff,
  documentStatus,
  expectedEndOf,
  isLookupValue,
  purchaseOrderById,
  purchaseOrderStatus,
  recordAudit,
  tariffById,
  toAssignment,
  toBooking,
  toDeployment,
  toDriverSummary,
  toPurchaseOrder,
  toVehicleSummary,
  userCan,
} from '../mappers'
import { missionAmount } from '../seed'
import { assertDriverDispatchable, assertVehicleDispatchable } from './assignments'

/**
 * Deployments: a vehicle and driver sent out for an institution against a registered purchase
 * order (LPO). Numbered per issuing company and series — `GSL1/00001/2026` for Gorilland's own
 * vehicles, `GSL2/…` for subcontracted ones, `LIMOZ1/…` and `LIMOZ2/…` likewise. The gate records
 * the departure and return odometer readings; the driver can do the same from the phone.
 */

const auditDeployment = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'DEPLOYMENT',
    entityId: row.id,
    entityLabel: row.deploymentNumber,
    changes,
  })

const findDeployment = (id) => {
  const t = getDb().deployments.find((x) => x.id === Number(id))
  if (!t) throw notFound('Deployment')
  return t
}

const recordedBy = (user) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`, at: new Date().toISOString() })

/** `GSL1/00042/2026`: prefix of the issuing company, series 1 (own fleet) or 2 (subcontractor), yearly sequence. */
export function nextDeploymentNumber(company, series, date = new Date()) {
  const year = date.getFullYear()
  const n = nextId(`deployment:${company.numberPrefix}${series}:${year}`)
  return `${company.numberPrefix}${series}/${String(n).padStart(5, '0')}/${year}`
}

function validateDeployment(input) {
  const errors = []
  const d = getDb()
  if (!input.companyId || !d.companies.some((c) => c.id === Number(input.companyId) && c.active))
    errors.push({ field: 'companyId', message: 'Choose the company issuing the deployment.' })
  if (!input.vehicleId) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (!input.driverId) errors.push({ field: 'driverId', message: 'Choose a driver.' })
  if (!input.institution?.trim()) errors.push({ field: 'institution', message: 'Choose the institution.' })
  if (!input.purchaseOrderId)
    errors.push({ field: 'purchaseOrderId', message: 'Link the purchase order (LPO) this deployment is made against.' })
  if (!input.startLocation?.trim()) errors.push({ field: 'startLocation', message: 'Start location is required.' })
  if (!input.destination?.trim()) errors.push({ field: 'destination', message: 'Destination is required.' })
  if (!input.scheduledStartAt) errors.push({ field: 'scheduledStartAt', message: 'Scheduled start is required.' })
  if (!input.purpose?.trim()) errors.push({ field: 'purpose', message: 'Purpose is required.' })
  const days = Number(input.effectiveDays)
  if (!Number.isInteger(days) || days < 1 || days > 365)
    errors.push({ field: 'effectiveDays', message: 'Enter the number of days (1–365).' })
  if (!input.tariffId || !d.tariffs.some((t) => t.id === Number(input.tariffId) && t.active))
    errors.push({ field: 'tariffId', message: 'Choose the vehicle category (CAT1–CAT3).' })
  if (!isLookupValue('vehicleOwners', input.owner)) errors.push({ field: 'owner', message: 'Choose the vehicle owner.' })
  if (input.owner === 'SUBCONTRACTOR') {
    if (input.ownerAmount == null || input.ownerAmount === '' || !(Number(input.ownerAmount) >= 0))
      errors.push({ field: 'ownerAmount', message: 'Enter the amount due to the subcontractor.' })
  } else if (input.driverMission != null && input.driverMission !== '' && !(Number(input.driverMission) >= 0))
    errors.push({ field: 'driverMission', message: 'The driver mission cannot be negative.' })
  const pax = Number(input.passengers)
  if (!Number.isInteger(pax) || pax < 0) errors.push({ field: 'passengers', message: 'Enter a whole number.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

/** The LPO must exist, belong to the institution and still be usable. */
function assertPurchaseOrder(input) {
  const lpo = purchaseOrderById(Number(input.purchaseOrderId))
  if (!lpo) throw notFound('Purchase order')
  if (lpo.institution !== input.institution.trim())
    throw badRequest(`LPO ${lpo.lpoNumber} belongs to ${lpo.institution}, not ${input.institution.trim()}.`, [
      { field: 'purchaseOrderId', message: 'Choose an LPO of the selected institution.' },
    ])
  if (lpo.closedAt) throw businessRule(`LPO ${lpo.lpoNumber} is closed. Ask the account manager to reopen it or register a new one.`)
  return lpo
}

/** Vehicle must be usable and the driver must be its current driver or free. */
function assertDeploymentResources(vehicle, driver, { existing = null } = {}) {
  if (!vehicle || vehicle.archived) throw notFound('Vehicle')
  if (!driver || driver.archived) throw notFound('Driver')
  if (['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE'].includes(vehicle.status))
    throw businessRule(`${vehicle.plateNumber} is ${vehicle.status.replace(/_/g, ' ').toLowerCase()} and cannot be deployed.`)
  const seats = vehicle.seatingCapacity
  if (existing && existing.passengers > seats)
    throw businessRule(`${vehicle.plateNumber} seats ${seats}; the deployment has ${existing.passengers} passengers.`)
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

/**
 * No vehicle or driver can hold two active deployments at once. Single-day deployments clash
 * within an hour of each other; multi-day ones clash when their day ranges overlap.
 */
function assertNoOverlap(vehicleId, driverId, scheduledStartAt, effectiveDays, excludeId = null) {
  const d = getDb()
  const start = new Date(scheduledStartAt).getTime()
  const days = Math.max(1, Number(effectiveDays) || 1)
  const hour = 60 * 60 * 1000
  const end = days > 1 ? start + days * 86_400_000 : start + hour
  const clash = d.deployments.find((t) => {
    if (t.id === excludeId || !['PLANNED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status)) return false
    if (t.vehicleId !== vehicleId && t.driverId !== driverId) return false
    const ts = new Date(t.scheduledStartAt).getTime()
    const tdays = Math.max(1, Number(t.effectiveDays) || 1)
    const te = tdays > 1 ? ts + tdays * 86_400_000 : ts + hour
    if (days === 1 && tdays === 1) return Math.abs(ts - start) < hour
    return ts < end && start < te
  })
  if (clash)
    throw businessRule(
      `${clash.vehicleId === vehicleId ? 'The vehicle' : 'The driver'} already has deployment ${clash.deploymentNumber} over this period.`,
    )
}

/** Office staff see the whole fleet; a driver account only sees deployments where it is the driver. */
const scopedDriverId = (user) => (userCan(user, 'DEPLOYMENT_READ') ? null : (user.driverId ?? -1))

const READ = ['DEPLOYMENT_READ', 'DEPLOYMENT_START']

function fieldsFrom(body, { vehicle, lpo, tariff }) {
  const d = getDb()
  const owner = body.owner
  const days = Number(body.effectiveDays)
  const mission =
    owner === 'SUBCONTRACTOR'
      ? null
      : body.driverMission == null || body.driverMission === ''
        ? missionAmount(d.settings, days)
        : Number(body.driverMission)
  return {
    vehicleId: vehicle.id,
    institution: body.institution.trim(),
    purchaseOrderId: lpo.id,
    effectiveDays: days,
    tariffId: tariff.id,
    tariffRate: tariff.dailyRate,
    owner,
    ownerName: owner === 'SUBCONTRACTOR' ? body.ownerName?.trim() || vehicle.ownerName || 'Subcontractor' : null,
    ownerAmount: owner === 'SUBCONTRACTOR' ? Number(body.ownerAmount) : null,
    driverMission: mission,
    startLocation: body.startLocation.trim(),
    destination: body.destination.trim(),
    scheduledStartAt: new Date(body.scheduledStartAt).toISOString(),
    purpose: body.purpose.trim(),
    passengers: Number(body.passengers),
    notes: body.notes?.trim() || null,
  }
}

get(
  '/deployments',
  ({ query, user }) => {
    const scope = scopedDriverId(user)
    const list = getDb()
      .deployments.filter((t) => scope == null || t.driverId === scope)
      .map(toDeployment)
      .filter((t) =>
        matchesText(
          [t.deploymentNumber, t.vehiclePlate, t.driverName, t.institution, t.lpoNumber, t.destination, t.startLocation, t.bookingNumber],
          query.q,
        ),
      )
      .filter((t) => !query.status || query.status.split(',').includes(t.status))
      .filter((t) => !query.vehicleId || t.vehicleId === Number(query.vehicleId))
      .filter((t) => !query.driverId || t.driverId === Number(query.driverId))
      .filter((t) => !query.companyId || t.companyId === Number(query.companyId))
      .filter((t) => !query.purchaseOrderId || t.purchaseOrderId === Number(query.purchaseOrderId))
      .filter((t) => !query.owner || t.owner === query.owner)
      .filter((t) => inDateRange(t.scheduledStartAt, query.from, query.to))
    return paginate(list, query, 'scheduledStartAt,desc')
  },
  { permission: READ },
)

get(
  '/deployments/:id',
  ({ params, user }) => {
    const row = findDeployment(params.id)
    const scope = scopedDriverId(user)
    if (scope != null && row.driverId !== scope) throw forbidden('This deployment is assigned to another driver.')
    return toDeployment(row)
  },
  { permission: READ },
)

post(
  '/deployments',
  ({ body, user }) => {
    validateDeployment(body)
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(body.vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(body.driverId))
    const company = companyById(Number(body.companyId))
    const tariff = tariffById(Number(body.tariffId))
    const lpo = assertPurchaseOrder(body)
    assertDeploymentResources(vehicle, driver, { existing: { passengers: Number(body.passengers) } })
    assertNoOverlap(vehicle.id, driver.id, body.scheduledStartAt, body.effectiveDays)
    const now = new Date().toISOString()
    const id = nextId('trip')
    const start = new Date(body.scheduledStartAt)
    let booking = null
    if (body.bookingId) {
      booking = d.bookings.find((b) => b.id === Number(body.bookingId))
      if (!booking) throw notFound('Booking')
      if (['COMPLETED', 'CANCELLED'].includes(booking.status)) throw businessRule('This booking is closed.')
    }
    const series = body.owner === 'SUBCONTRACTOR' ? 2 : 1
    const row = {
      id,
      deploymentNumber: nextDeploymentNumber(company, series, start),
      companyId: company.id,
      driverId: driver.id,
      ...fieldsFrom(body, { vehicle, lpo, tariff }),
      bookingId: booking?.id ?? null,
      startedAt: null,
      endedAt: null,
      startOdometer: null,
      endOdometer: null,
      fuelUsedLitres: null,
      maxSpeedKph: null,
      replacedById: null,
      replacesId: null,
      replaceReason: null,
      departureRecordedBy: null,
      returnRecordedBy: null,
      status: 'PLANNED',
      createdAt: now,
      updatedAt: now,
    }
    d.deployments.push(row)
    if (booking) {
      booking.vehicleId = vehicle.id
      booking.driverId = driver.id
      if (['REQUESTED', 'CONFIRMED'].includes(booking.status)) booking.status = 'ASSIGNED'
      booking.updatedAt = now
    }
    auditDeployment(user, 'CREATE', row)
    persist()
    return toDeployment(row)
  },
  { permission: 'DEPLOYMENT_MANAGE' },
)

put(
  '/deployments/:id',
  ({ params, body, user }) => {
    const row = findDeployment(params.id)
    if (['COMPLETED', 'CANCELLED', 'REPLACED'].includes(row.status))
      throw businessRule('Returned, cancelled or replaced deployments cannot be edited.')
    if (row.status === 'IN_PROGRESS') throw businessRule('A deployment that is out cannot be edited. Record the return first.')
    validateDeployment(body)
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(body.vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(body.driverId))
    const tariff = tariffById(Number(body.tariffId))
    const lpo = assertPurchaseOrder(body)
    assertDeploymentResources(vehicle, driver, { existing: { passengers: Number(body.passengers) } })
    assertNoOverlap(vehicle.id, driver.id, body.scheduledStartAt, body.effectiveDays, row.id)
    const before = { ...row }
    const company = companyById(Number(body.companyId))
    const series = body.owner === 'SUBCONTRACTOR' ? 2 : 1
    const wasSeries = row.owner === 'SUBCONTRACTOR' ? 2 : 1
    // The number encodes company and series; it is reissued only when either changes.
    const renumber = company.id !== row.companyId || series !== wasSeries
    Object.assign(row, {
      companyId: company.id,
      driverId: driver.id,
      ...fieldsFrom(body, { vehicle, lpo, tariff }),
      deploymentNumber: renumber ? nextDeploymentNumber(company, series, new Date(body.scheduledStartAt)) : row.deploymentNumber,
      updatedAt: new Date().toISOString(),
    })
    auditDeployment(user, 'UPDATE', row, diff(before, row))
    persist()
    return toDeployment(row)
  },
  { permission: 'DEPLOYMENT_MANAGE' },
)

const transitions = {
  PLANNED: ['DISPATCHED', 'CANCELLED'],
  DISPATCHED: ['IN_PROGRESS', 'PLANNED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
  REPLACED: [],
}

const freeResources = (d, vehicle, driver) => {
  vehicle.status = currentAssignmentOf(vehicle.id) ? 'ASSIGNED' : 'AVAILABLE'
  driver.status = currentAssignmentOfDriver(driver.id) ? 'ASSIGNED' : 'AVAILABLE'
}

/** Departure: validates and applies the start odometer, puts vehicle and driver on the road. */
function recordDeparture(d, row, vehicle, driver, startOdometer, user, now) {
  assertDeploymentResources(vehicle, driver, { existing: row })
  if (vehicle.status === 'ON_TRIP') throw businessRule(`${vehicle.plateNumber} is already out on another deployment.`)
  if (driver.status === 'ON_TRIP') throw businessRule(`${driver.fullName} is already out on another deployment.`)
  const odo = startOdometer == null || startOdometer === '' ? vehicle.odometerKm : Number(startOdometer)
  if (!Number.isFinite(odo) || odo < vehicle.odometerKm)
    throw badRequest(`Start odometer cannot be below the vehicle's current reading of ${vehicle.odometerKm.toLocaleString()} km.`, [
      { field: 'startOdometer', message: `At least ${vehicle.odometerKm.toLocaleString()} km.` },
    ])
  row.startOdometer = odo
  row.startedAt = now
  row.departureRecordedBy = recordedBy(user)
  vehicle.status = 'ON_TRIP'
  driver.status = 'ON_TRIP'
  vehicle.odometerKm = odo
  const booking = row.bookingId ? d.bookings.find((b) => b.id === row.bookingId) : null
  if (booking) {
    booking.status = 'IN_PROGRESS'
    booking.updatedAt = now
  }
}

/** Return: validates the end odometer, computes distance, frees the resources and feeds daily movements. */
function recordReturn(d, row, vehicle, driver, { endOdometer, fuelUsedLitres, maxSpeedKph }, user, now) {
  const odo = Number(endOdometer)
  if (!Number.isFinite(odo)) throw badRequest('Enter the odometer reading at return.', [{ field: 'endOdometer', message: 'Required.' }])
  if (odo < row.startOdometer)
    throw badRequest(
      `End odometer cannot be below the departure reading of ${row.startOdometer.toLocaleString()} km. Check the reading with the driver before recording it.`,
      [{ field: 'endOdometer', message: `At least ${row.startOdometer.toLocaleString()} km.` }],
    )
  if (odo - row.startOdometer > 2000 * Math.max(1, Number(row.effectiveDays) || 1))
    throw badRequest('That distance looks like a typo for this deployment. Check the reading.', [
      { field: 'endOdometer', message: 'Unrealistic distance.' },
    ])
  row.endOdometer = odo
  row.endedAt = now
  row.returnRecordedBy = recordedBy(user)
  row.fuelUsedLitres = fuelUsedLitres != null && fuelUsedLitres !== '' ? Number(fuelUsedLitres) : null
  row.maxSpeedKph = maxSpeedKph != null && maxSpeedKph !== '' ? Number(maxSpeedKph) : null
  vehicle.odometerKm = Math.max(vehicle.odometerKm, odo)
  freeResources(d, vehicle, driver)
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

patch(
  '/deployments/:id/status',
  ({ params, body, user }) => {
    const row = findDeployment(params.id)
    const { status, startOdometer, endOdometer, reason, fuelUsedLitres, maxSpeedKph } = body ?? {}
    // Drivers only depart and return on their own deployments; the gate records departures and
    // returns for any vehicle; dispatching and cancelling stay with the office.
    if (!userCan(user, 'DEPLOYMENT_MANAGE')) {
      if (!['IN_PROGRESS', 'COMPLETED'].includes(status))
        throw forbidden(
          userCan(user, 'GATE_RECORD')
            ? 'The gate only records departures and returns.'
            : 'Drivers can only depart and return on their own deployments.',
        )
      if (!userCan(user, 'GATE_RECORD') && (!user.driverId || row.driverId !== user.driverId))
        throw forbidden('This deployment is assigned to another driver.')
    }
    if (!transitions[row.status]?.includes(status))
      throw businessRule(
        `A ${row.status.toLowerCase().replace(/_/g, ' ')} deployment cannot move to ${String(status).toLowerCase().replace(/_/g, ' ')}.`,
      )
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const driver = d.drivers.find((x) => x.id === row.driverId)
    const now = new Date().toISOString()
    const from = row.status
    if (status === 'DISPATCHED') assertDeploymentResources(vehicle, driver, { existing: row })
    if (status === 'IN_PROGRESS') recordDeparture(d, row, vehicle, driver, startOdometer, user, now)
    if (status === 'COMPLETED') recordReturn(d, row, vehicle, driver, { endOdometer, fuelUsedLitres, maxSpeedKph }, user, now)
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
    auditDeployment(user, 'STATUS_CHANGE', row, [{ field: 'status', from, to: status }])
    persist()
    return toDeployment(row)
  },
  { permission: ['DEPLOYMENT_MANAGE', 'DEPLOYMENT_START', 'GATE_RECORD'] },
)

/**
 * Replace: a dispatched or out vehicle is swapped for another one. The original keeps its history
 * and is marked REPLACED (with the return reading if it was out); a new deployment is issued for
 * the remaining days under the same LPO, institution and tariff, and dispatched immediately.
 */
post(
  '/deployments/:id/replace',
  ({ params, body, user }) => {
    const row = findDeployment(params.id)
    if (!['DISPATCHED', 'IN_PROGRESS'].includes(row.status))
      throw businessRule('Only a dispatched deployment or one that is out can be replaced.')
    const { vehicleId, driverId, endOdometer, reason, remainingDays } = body ?? {}
    if (!reason?.trim()) throw badRequest('Give the reason for the replacement.', [{ field: 'reason', message: 'Required.' }])
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === Number(vehicleId))
    const driver = d.drivers.find((x) => x.id === Number(driverId)) ?? d.drivers.find((x) => x.id === row.driverId)
    if (!vehicle || vehicle.archived) throw badRequest('Choose the replacement vehicle.', [{ field: 'vehicleId', message: 'Required.' }])
    if (vehicle.id === row.vehicleId) throw badRequest('Choose a different vehicle.', [{ field: 'vehicleId', message: 'Same vehicle.' }])
    const oldVehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const oldDriver = d.drivers.find((x) => x.id === row.driverId)
    const now = new Date().toISOString()
    const elapsedDays =
      row.status === 'IN_PROGRESS' ? Math.max(1, Math.ceil((Date.now() - new Date(row.startedAt).getTime()) / 86_400_000)) : 0
    const days = Math.max(1, Number(remainingDays) || Math.max(1, Number(row.effectiveDays) - elapsedDays))
    assertDeploymentResources(vehicle, driver, { existing: row })
    // Close the original first so the replacement does not clash with it.
    if (row.status === 'IN_PROGRESS') recordReturn(d, row, oldVehicle, oldDriver, { endOdometer }, user, now)
    assertNoOverlap(vehicle.id, driver.id, now, days, row.id)
    const company = companyById(row.companyId) ?? d.companies[0]
    const owner = vehicle.owner ?? 'LIMOZ'
    const series = owner === 'SUBCONTRACTOR' ? 2 : 1
    const tariff = tariffById(row.tariffId)
    const id = nextId('trip')
    const replacement = {
      id,
      deploymentNumber: nextDeploymentNumber(company, series, new Date()),
      companyId: company.id,
      vehicleId: vehicle.id,
      driverId: driver.id,
      institution: row.institution,
      purchaseOrderId: row.purchaseOrderId,
      effectiveDays: days,
      tariffId: row.tariffId,
      tariffRate: row.tariffRate ?? tariff?.dailyRate ?? 0,
      owner,
      ownerName: owner === 'SUBCONTRACTOR' ? vehicle.ownerName : null,
      ownerAmount:
        owner === 'SUBCONTRACTOR'
          ? row.ownerAmount != null
            ? Math.round((row.ownerAmount / Math.max(1, row.effectiveDays)) * days)
            : 0
          : null,
      driverMission: owner === 'SUBCONTRACTOR' ? null : missionAmount(d.settings, days),
      startLocation: row.destination,
      destination: row.destination,
      scheduledStartAt: now,
      purpose: row.purpose,
      passengers: row.passengers,
      notes: `Replaces ${row.deploymentNumber}: ${reason.trim()}`,
      bookingId: row.bookingId,
      startedAt: null,
      endedAt: null,
      startOdometer: null,
      endOdometer: null,
      fuelUsedLitres: null,
      maxSpeedKph: null,
      replacedById: null,
      replacesId: row.id,
      replaceReason: null,
      departureRecordedBy: null,
      returnRecordedBy: null,
      status: 'DISPATCHED',
      createdAt: now,
      updatedAt: now,
    }
    d.deployments.push(replacement)
    const from = row.status
    row.status = 'REPLACED'
    row.replacedById = replacement.id
    row.replaceReason = reason.trim()
    row.updatedAt = now
    if (from === 'DISPATCHED') freeResources(d, oldVehicle, oldDriver)
    auditDeployment(user, 'STATUS_CHANGE', row, [
      { field: 'status', from, to: 'REPLACED' },
      { field: 'replacedBy', from: null, to: replacement.deploymentNumber },
    ])
    auditDeployment(user, 'CREATE', replacement, [{ field: 'replaces', from: null, to: row.deploymentNumber }])
    persist()
    return { original: toDeployment(row), replacement: toDeployment(replacement) }
  },
  { permission: 'DEPLOYMENT_MANAGE' },
)

// ---------- Road map ----------

/** Everything the printable road map needs: the deployment, the issuing company's template and the generation history. */
function roadMapPayload(row) {
  const d = getDb()
  const t = toDeployment(row)
  const company = companyById(row.companyId) ?? d.companies[0]
  const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
  const driver = d.drivers.find((x) => x.id === row.driverId)
  const lpo = purchaseOrderById(row.purchaseOrderId)
  const days = Math.max(1, Number(row.effectiveDays) || 1)
  const start = parseISO(row.scheduledStartAt)
  return {
    deployment: t,
    company: {
      id: company.id,
      code: company.code,
      name: company.name,
      legalName: company.legalName,
      numberPrefix: company.numberPrefix,
      tin: company.tin,
      address: company.address,
      phone: company.phone,
      email: company.email,
      roadMapTitle: company.roadMapTitle,
      logoDataUrl: company.logoDataUrl ?? null,
    },
    vehicle: vehicle ? { plateNumber: vehicle.plateNumber, make: vehicle.make, model: vehicle.model, color: vehicle.color } : null,
    driver: driver ? { fullName: driver.fullName, phone: driver.phone, employeeNumber: driver.employeeNumber } : null,
    purchaseOrder: lpo ? toPurchaseOrder(lpo) : null,
    rows: Array.from({ length: Math.max(days, 10) }, (_, i) => ({
      n: i + 1,
      date: i < days ? format(addDays(start, i), 'yyyy-MM-dd') : null,
    })),
    history: d.roadMaps
      .filter((r) => r.deploymentId === row.id)
      .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
      .map((r) => ({ ...r })),
  }
}

get(
  '/deployments/:id/road-map',
  ({ params, user }) => {
    const row = findDeployment(params.id)
    const scope = scopedDriverId(user)
    if (scope != null && row.driverId !== scope) throw forbidden('This deployment is assigned to another driver.')
    return roadMapPayload(row)
  },
  { permission: READ },
)

/** Generating a road map is recorded so the office knows which copy is in the vehicle. */
post(
  '/deployments/:id/road-map',
  ({ params, user }) => {
    const row = findDeployment(params.id)
    if (['PLANNED', 'CANCELLED'].includes(row.status)) throw businessRule('Dispatch the deployment before generating its road map.')
    const d = getDb()
    const id = nextId('roadMap')
    const count = d.roadMaps.filter((r) => r.deploymentId === row.id).length + 1
    const entry = {
      id,
      deploymentId: row.id,
      number: `${row.deploymentNumber}-RM${count}`,
      revision: count,
      generatedAt: new Date().toISOString(),
      generatedById: user.id,
      generatedByName: `${user.firstName} ${user.lastName}`,
    }
    d.roadMaps.push(entry)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'EXPORT',
      entityType: 'DEPLOYMENT',
      entityId: row.id,
      entityLabel: `${row.deploymentNumber} road map (rev ${count})`,
      changes: null,
    })
    persist()
    return entry
  },
  { permission: ['DEPLOYMENT_MANAGE', 'DEPLOYMENT_READ'] },
)

// ---------- Gate ----------

/**
 * What the gatekeeper sees: deployments due to leave (dispatched) and vehicles currently out
 * (not returned), each with the identifiers needed to pick the right one.
 */
get(
  '/gate/board',
  () => {
    const d = getDb()
    const all = d.deployments.map(toDeployment)
    const byTime = (k) => (a, b) => (a[k] ?? '').localeCompare(b[k] ?? '')
    const todayKey = format(new Date(), 'yyyy-MM-dd')
    return {
      departures: all.filter((t) => t.status === 'DISPATCHED').sort(byTime('scheduledStartAt')),
      out: all.filter((t) => t.status === 'IN_PROGRESS').sort(byTime('startedAt')),
      returnedToday: all
        .filter((t) => t.status === 'COMPLETED' && (t.endedAt ?? '').startsWith(todayKey))
        .sort(byTime('endedAt'))
        .reverse(),
      departedToday: all.filter((t) => t.startedAt && t.startedAt.startsWith(todayKey)).length,
    }
  },
  { permission: ['GATE_RECORD', 'DEPLOYMENT_MANAGE'] },
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
    const deployments = d.deployments.map(toDeployment)
    const sortByTime = (k) => (a, b) => (a[k] ?? '').localeCompare(b[k] ?? '')
    return {
      date,
      departures: deployments.filter((t) => inDay(t.scheduledStartAt) && t.status !== 'CANCELLED').sort(sortByTime('scheduledStartAt')),
      expectedReturns: deployments
        .filter((t) => ['IN_PROGRESS', 'DISPATCHED'].includes(t.status) && inDay(t.scheduledStartAt))
        .sort(sortByTime('scheduledStartAt')),
      currentTrips: deployments.filter((t) => t.status === 'IN_PROGRESS').sort(sortByTime('startedAt')),
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

export { assertDriverDispatchable, assertVehicleDispatchable, deploymentAmountOf, expectedEndOf, purchaseOrderStatus }
