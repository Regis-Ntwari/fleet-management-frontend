import { get, post, put, patch, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, inDateRange, matchesText, notFound, paginate } from '../core'
import {
  computeAlerts,
  currentAssignmentOf,
  diff,
  driverNameOf,
  recordAudit,
  toAssignment,
  toDocument,
  toFuel,
  toIncident,
  toMaintenance,
  toSchedule,
  toTrip,
  toVehicle,
  toVehicleSummary,
} from '../mappers'
import { REFERENCE } from './reference'

const audit = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'VEHICLE',
    entityId: row.id,
    entityLabel: row.plateNumber,
    changes,
  })

const findVehicle = (id) => {
  const v = getDb().vehicles.find((x) => x.id === Number(id) && !x.archived)
  if (!v) throw notFound('Vehicle')
  return v
}

function validateVehicle(input, existingId = null) {
  const errors = []
  const d = getDb()
  if (!input.plateNumber?.trim()) errors.push({ field: 'plateNumber', message: 'Plate number is required.' })
  else if (
    d.vehicles.some(
      (v) => v.id !== existingId && v.plateNumber.replace(/\s/g, '').toLowerCase() === input.plateNumber.replace(/\s/g, '').toLowerCase(),
    )
  )
    throw conflict(`Vehicle plate number ${input.plateNumber.trim().toUpperCase()} already exists.`)
  if (!input.fleetNumber?.trim()) errors.push({ field: 'fleetNumber', message: 'Fleet number is required.' })
  else if (d.vehicles.some((v) => v.id !== existingId && v.fleetNumber.toLowerCase() === input.fleetNumber.trim().toLowerCase()))
    errors.push({ field: 'fleetNumber', message: 'This fleet number is already in use.' })
  if (!input.make?.trim()) errors.push({ field: 'make', message: 'Make is required.' })
  if (!input.model?.trim()) errors.push({ field: 'model', message: 'Model is required.' })
  const year = Number(input.year)
  if (!Number.isInteger(year) || year < 1990 || year > new Date().getFullYear() + 1)
    errors.push({ field: 'year', message: 'Enter a valid year.' })
  if (!d.categories.some((c) => c.id === Number(input.categoryId)))
    errors.push({ field: 'categoryId', message: 'Choose a vehicle category.' })
  if (!REFERENCE.fuelTypes.some((f) => f.value === input.fuelType)) errors.push({ field: 'fuelType', message: 'Choose a fuel type.' })
  if (!REFERENCE.transmissions.some((t) => t.value === input.transmission))
    errors.push({ field: 'transmission', message: 'Choose a transmission.' })
  if (!REFERENCE.vehicleStatuses.some((s) => s.value === input.status)) errors.push({ field: 'status', message: 'Choose a status.' })
  const odo = Number(input.odometerKm)
  if (!Number.isFinite(odo) || odo < 0 || odo > 3_000_000)
    errors.push({ field: 'odometerKm', message: 'Enter a realistic odometer value.' })
  const seats = Number(input.seatingCapacity)
  if (!Number.isInteger(seats) || seats < 1 || seats > 80)
    errors.push({ field: 'seatingCapacity', message: 'Seating must be between 1 and 80.' })
  if (input.acquisitionCost != null && input.acquisitionCost !== '' && Number(input.acquisitionCost) < 0)
    errors.push({ field: 'acquisitionCost', message: 'Cost cannot be negative.' })
  if (input.vin && String(input.vin).length !== 17) errors.push({ field: 'vin', message: 'A VIN has exactly 17 characters.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

const normalise = (input) => ({
  plateNumber: input.plateNumber.trim().toUpperCase(),
  fleetNumber: input.fleetNumber.trim().toUpperCase(),
  make: input.make.trim(),
  model: input.model.trim(),
  year: Number(input.year),
  categoryId: Number(input.categoryId),
  bodyType: input.bodyType?.trim() || null,
  fuelType: input.fuelType,
  transmission: input.transmission,
  engineNumber: input.engineNumber?.trim() || null,
  vin: input.vin?.trim().toUpperCase() || null,
  color: input.color?.trim() || 'Unspecified',
  odometerKm: Math.round(Number(input.odometerKm)),
  seatingCapacity: Number(input.seatingCapacity),
  purchaseDate: input.purchaseDate || null,
  acquisitionCost: input.acquisitionCost === '' || input.acquisitionCost == null ? null : Number(input.acquisitionCost),
  insurer: input.insurer?.trim() || null,
  insurancePolicyNumber: input.insurancePolicyNumber?.trim() || null,
  insuranceExpiry: input.insuranceExpiry || null,
  department: input.department?.trim() || null,
  status: input.status,
  notes: input.notes?.trim() || null,
})

get(
  '/vehicles',
  ({ query }) => {
    const d = getDb()
    const list = d.vehicles
      .filter((v) => !v.archived)
      .filter((v) => matchesText([v.plateNumber, v.fleetNumber, v.make, v.model, v.vin], query.q))
      .filter((v) => !query.status || query.status.split(',').includes(v.status))
      .filter((v) => !query.categoryId || v.categoryId === Number(query.categoryId))
      .filter((v) => !query.department || v.department === query.department)
      .filter((v) => !query.fuelType || v.fuelType === query.fuelType)
      .map(toVehicle)
      .filter((v) => !query.maintenanceStatus || v.maintenanceStatus === query.maintenanceStatus)
      .filter((v) => !query.gpsStatus || v.telematics.status === query.gpsStatus)
    return paginate(list, query, 'plateNumber,asc')
  },
  { permission: 'VEHICLE_READ' },
)

/** Light-weight list for pickers (no paging). */
get(
  '/vehicles/options',
  ({ query }) => {
    const list = getDb()
      .vehicles.filter((v) => !v.archived && v.status !== 'INACTIVE')
      .filter((v) => !query.status || query.status.split(',').includes(v.status))
      .filter((v) => !query.categoryId || v.categoryId === Number(query.categoryId))
      .map(toVehicleSummary)
    return list.sort((a, b) => a.plateNumber.localeCompare(b.plateNumber))
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/departments',
  () =>
    Array.from(
      new Set(
        getDb()
          .vehicles.map((v) => v.department)
          .filter(Boolean),
      ),
    ).sort(),
  { permission: 'VEHICLE_READ' },
)

get('/vehicles/:id', ({ params }) => toVehicle(findVehicle(params.id)), { permission: 'VEHICLE_READ' })

post(
  '/vehicles',
  ({ body, user }) => {
    validateVehicle(body)
    const now = new Date().toISOString()
    const row = { id: nextId('vehicle'), ...normalise(body), archived: false, createdAt: now, updatedAt: now }
    getDb().vehicles.push(row)
    audit(user, 'CREATE', row)
    persist()
    return toVehicle(row)
  },
  { permission: 'VEHICLE_CREATE' },
)

put(
  '/vehicles/:id',
  ({ params, body, user }) => {
    const row = findVehicle(params.id)
    validateVehicle(body, row.id)
    const next = normalise(body)
    if (next.odometerKm < row.odometerKm && !body.odometerCorrectionReason) {
      throw businessRule(
        `Odometer cannot decrease (current ${row.odometerKm.toLocaleString()} km). Provide a correction reason to override.`,
      )
    }
    if (next.status !== row.status) {
      if (row.status === 'ON_TRIP') throw businessRule('This vehicle is on a trip. Complete or cancel the trip before changing its status.')
      if (
        ['AVAILABLE', 'ASSIGNED', 'ON_TRIP', 'RESERVED'].includes(next.status) &&
        getDb().maintenance.some(
          (m) => m.vehicleId === row.id && ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'APPROVED', 'INSPECTION'].includes(m.status),
        )
      )
        throw businessRule('This vehicle has open maintenance work. Complete or cancel it before returning the vehicle to service.')
      if (next.status === 'AVAILABLE' && currentAssignmentOf(row.id)) next.status = 'ASSIGNED'
    }
    const before = { ...row }
    Object.assign(row, next, { updatedAt: new Date().toISOString() })
    const changes = diff(before, row)
    if (body.odometerCorrectionReason) changes.push({ field: 'odometerCorrectionReason', from: null, to: body.odometerCorrectionReason })
    audit(user, 'UPDATE', row, changes)
    persist()
    return toVehicle(row)
  },
  { permission: 'VEHICLE_UPDATE' },
)

patch(
  '/vehicles/:id/status',
  ({ params, body, user }) => {
    const row = findVehicle(params.id)
    const { status, reason } = body ?? {}
    if (!REFERENCE.vehicleStatuses.some((s) => s.value === status)) throw badRequest('Choose a valid status.')
    if (row.status === 'ON_TRIP' && status !== 'ON_TRIP')
      throw businessRule('This vehicle is on a trip. Complete or cancel the trip first.')
    if (status === 'AVAILABLE' && currentAssignmentOf(row.id))
      throw businessRule('End the active driver assignment before marking the vehicle available.')
    if (
      ['AVAILABLE', 'ASSIGNED', 'RESERVED'].includes(status) &&
      getDb().maintenance.some(
        (m) => m.vehicleId === row.id && ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'APPROVED', 'INSPECTION'].includes(m.status),
      )
    )
      throw businessRule('Open maintenance work exists for this vehicle. Complete or cancel it first.')
    const from = row.status
    row.status = status
    row.updatedAt = new Date().toISOString()
    audit(user, 'STATUS_CHANGE', row, [
      { field: 'status', from, to: status },
      ...(reason ? [{ field: 'reason', from: null, to: reason }] : []),
    ])
    persist()
    return toVehicle(row)
  },
  { permission: 'VEHICLE_UPDATE' },
)

del(
  '/vehicles/:id',
  ({ params, user }) => {
    const row = findVehicle(params.id)
    if (row.status === 'ON_TRIP') throw businessRule('A vehicle on a trip cannot be archived.')
    if (currentAssignmentOf(row.id)) throw businessRule('End the active driver assignment before archiving this vehicle.')
    row.archived = true
    row.status = 'INACTIVE'
    row.updatedAt = new Date().toISOString()
    audit(user, 'DELETE', row)
    persist()
    return null
  },
  { permission: 'VEHICLE_DELETE' },
)

// ----- vehicle sub-resources -----

get(
  '/vehicles/:id/trips',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const list = getDb()
      .trips.filter((t) => t.vehicleId === v.id)
      .filter((t) => !query.status || t.status === query.status)
      .map(toTrip)
    return paginate(list, query, 'scheduledStartAt,desc')
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/fuel',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const rows = getDb()
      .fuel.filter((f) => f.vehicleId === v.id)
      .sort((a, b) => a.transactedAt.localeCompare(b.transactedAt))
    const list = rows.map((f, i) => toFuel(f, i > 0 ? rows[i - 1] : null))
    return paginate(list, query, 'transactedAt,desc')
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/maintenance',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const list = getDb()
      .maintenance.filter((m) => m.vehicleId === v.id)
      .map(toMaintenance)
    return paginate(list, query, 'reportedAt,desc')
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/schedules',
  ({ params }) => {
    const v = findVehicle(params.id)
    return getDb()
      .schedules.filter((s) => s.vehicleId === v.id)
      .map(toSchedule)
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/assignments',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const list = getDb()
      .assignments.filter((a) => a.vehicleId === v.id)
      .map(toAssignment)
    return paginate(list, query, 'startAt,desc')
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/documents',
  ({ params }) => {
    const v = findVehicle(params.id)
    return getDb()
      .documents.filter((x) => x.ownerType === 'VEHICLE' && x.ownerId === v.id)
      .map(toDocument)
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate))
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/incidents',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    return paginate(
      getDb()
        .incidents.filter((i) => i.vehicleId === v.id)
        .map(toIncident),
      query,
      'occurredAt,desc',
    )
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/alerts',
  ({ params }) => {
    const v = findVehicle(params.id)
    const docIds = new Set(
      getDb()
        .documents.filter((x) => x.ownerType === 'VEHICLE' && x.ownerId === v.id)
        .map((x) => x.id),
    )
    return computeAlerts().filter(
      (a) => (a.entityType === 'VEHICLE' && a.entityId === v.id) || (a.entityType === 'DOCUMENT' && docIds.has(a.entityId)),
    )
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/costs',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const d = getDb()
    const fuel = d.fuel.filter((f) => f.vehicleId === v.id && inDateRange(f.transactedAt, query.from, query.to))
    const maint = d.maintenance
      .filter((m) => m.vehicleId === v.id && m.status === 'COMPLETED' && inDateRange(m.completedAt ?? m.reportedAt, query.from, query.to))
      .map(toMaintenance)
    const incidents = d.incidents.filter((i) => i.vehicleId === v.id && i.estimatedCost && inDateRange(i.occurredAt, query.from, query.to))
    const trips = d.trips.filter((t) => t.vehicleId === v.id && t.status === 'COMPLETED' && inDateRange(t.endedAt, query.from, query.to))
    const distance = trips.reduce((s, t) => s + ((t.endOdometer ?? 0) - (t.startOdometer ?? 0)), 0)
    const fuelCost = fuel.reduce((s, f) => s + Math.round(f.litres * f.pricePerLitre), 0)
    const maintenanceCost = maint.reduce((s, m) => s + m.totalCost, 0)
    const incidentCost = incidents.reduce((s, i) => s + (i.estimatedCost ?? 0), 0)
    const byMonth = {}
    for (const f of fuel) {
      const k = f.transactedAt.slice(0, 7)
      byMonth[k] = byMonth[k] ?? { month: k, fuel: 0, maintenance: 0, incidents: 0 }
      byMonth[k].fuel += Math.round(f.litres * f.pricePerLitre)
    }
    for (const m of maint) {
      const k = (m.completedAt ?? m.reportedAt).slice(0, 7)
      byMonth[k] = byMonth[k] ?? { month: k, fuel: 0, maintenance: 0, incidents: 0 }
      byMonth[k].maintenance += m.totalCost
    }
    for (const i of incidents) {
      const k = i.occurredAt.slice(0, 7)
      byMonth[k] = byMonth[k] ?? { month: k, fuel: 0, maintenance: 0, incidents: 0 }
      byMonth[k].incidents += i.estimatedCost ?? 0
    }
    const total = fuelCost + maintenanceCost + incidentCost
    return {
      fuelCost,
      maintenanceCost,
      incidentCost,
      total,
      distanceKm: distance,
      costPerKm: distance > 0 ? Math.round((total / distance) * 100) / 100 : null,
      fuelLitres: Math.round(fuel.reduce((s, f) => s + f.litres, 0) * 10) / 10,
      byMonth: Object.values(byMonth).sort((a, b) => a.month.localeCompare(b.month)),
    }
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/movements',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const d = getDb()
    const settings = d.settings
    return d.movements
      .filter((m) => m.vehicleId === v.id && inDateRange(m.date, query.from, query.to))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, Number(query.limit ?? 30))
      .map((m) => ({
        ...m,
        flags: [
          ...(m.drivingMinutes > settings.excessiveDailyDrivingHours * 60 ? ['EXCESSIVE_HOURS'] : []),
          ...(m.distanceKm > settings.highDailyDistanceKm ? ['HIGH_DISTANCE'] : []),
          ...(m.nightDriving ? ['NIGHT_DRIVING'] : []),
        ],
      }))
  },
  { permission: 'VEHICLE_READ' },
)

get(
  '/vehicles/:id/activity',
  ({ params, query }) => {
    const v = findVehicle(params.id)
    const d = getDb()
    const events = []
    for (const a of d.assignments.filter((x) => x.vehicleId === v.id)) {
      events.push({
        id: `as-${a.id}-s`,
        at: a.startAt,
        kind: 'ASSIGNMENT',
        title: `Driver assigned: ${driverNameOf(a.driverId)}`,
        description: a.purpose,
        link: `/assignments?vehicleId=${v.id}`,
      })
      if (a.endAt)
        events.push({
          id: `as-${a.id}-e`,
          at: a.endAt,
          kind: 'ASSIGNMENT',
          title: `Assignment ended: ${driverNameOf(a.driverId)}`,
          description: a.odometerAtEnd ? `${(a.odometerAtEnd - a.odometerAtStart).toLocaleString()} km driven` : null,
          link: `/assignments?vehicleId=${v.id}`,
        })
    }
    for (const t of d.trips.filter((x) => x.vehicleId === v.id)) {
      if (t.startedAt)
        events.push({
          id: `tr-${t.id}-s`,
          at: t.startedAt,
          kind: 'TRIP',
          title: `Trip started · ${t.tripNumber}`,
          description: `${t.startLocation} → ${t.destination}`,
          link: `/trips/${t.id}`,
        })
      if (t.endedAt)
        events.push({
          id: `tr-${t.id}-e`,
          at: t.endedAt,
          kind: 'TRIP',
          title: `Trip completed · ${t.tripNumber}`,
          description: t.endOdometer && t.startOdometer ? `${t.endOdometer - t.startOdometer} km, ${driverNameOf(t.driverId)}` : null,
          link: `/trips/${t.id}`,
        })
      if (t.status === 'CANCELLED')
        events.push({
          id: `tr-${t.id}-c`,
          at: t.updatedAt,
          kind: 'TRIP',
          title: `Trip cancelled · ${t.tripNumber}`,
          description: t.notes,
          link: `/trips/${t.id}`,
        })
    }
    for (const f of d.fuel.filter((x) => x.vehicleId === v.id))
      events.push({
        id: `fu-${f.id}`,
        at: f.transactedAt,
        kind: 'FUEL',
        title: `Refuelled ${f.litres} L at ${f.station}`,
        description: `${Math.round(f.litres * f.pricePerLitre).toLocaleString()} RWF · odometer ${f.odometerKm.toLocaleString()} km`,
        link: `/fuel?vehicleId=${v.id}`,
      })
    for (const m of d.maintenance.filter((x) => x.vehicleId === v.id)) {
      events.push({
        id: `mt-${m.id}-r`,
        at: m.reportedAt,
        kind: 'MAINTENANCE',
        title: `Maintenance reported · ${m.maintenanceNumber}`,
        description: m.complaint,
        link: `/maintenance/${m.id}`,
      })
      if (m.completedAt)
        events.push({
          id: `mt-${m.id}-c`,
          at: m.completedAt,
          kind: 'MAINTENANCE',
          title: `Maintenance completed · ${m.maintenanceNumber}`,
          description: m.servicePerformed,
          link: `/maintenance/${m.id}`,
        })
    }
    for (const i of d.incidents.filter((x) => x.vehicleId === v.id))
      events.push({
        id: `in-${i.id}`,
        at: i.occurredAt,
        kind: 'INCIDENT',
        title: `Incident · ${i.incidentNumber}`,
        description: i.description,
        link: `/incidents/${i.id}`,
      })
    for (const b of d.bookings.filter((x) => x.vehicleId === v.id && x.status === 'ASSIGNED'))
      events.push({
        id: `bk-${b.id}`,
        at: b.updatedAt,
        kind: 'BOOKING',
        title: `Assigned to booking ${b.bookingNumber}`,
        description: `${b.company ?? b.customerName} · pickup ${b.pickupLocation}`,
        link: `/bookings/${b.id}`,
      })
    events.sort((a, b) => b.at.localeCompare(a.at))
    return paginate(
      events.filter((e) => inDateRange(e.at, query.from, query.to)),
      query,
    )
  },
  { permission: 'VEHICLE_READ' },
)
