import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, inDateRange, matchesText, notFound, paginate } from '../core'
import { diff, expectedL100, recordAudit, toFuel } from '../mappers'
import { REFERENCE } from './reference'

const auditFuel = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'FUEL_TRANSACTION',
    entityId: row.id,
    entityLabel: `Fuel #${row.id}`,
    changes,
  })

const findFuel = (id) => {
  const f = getDb().fuel.find((x) => x.id === Number(id))
  if (!f) throw notFound('Fuel transaction')
  return f
}

function validateFuel(input, existingId = null) {
  const errors = []
  const d = getDb()
  const vehicle = d.vehicles.find((v) => v.id === Number(input.vehicleId) && !v.archived)
  if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (!input.station?.trim()) errors.push({ field: 'station', message: 'Fuel station is required.' })
  if (!input.transactedAt) errors.push({ field: 'transactedAt', message: 'Date and time are required.' })
  else if (new Date(input.transactedAt) > new Date(Date.now() + 5 * 60000))
    errors.push({ field: 'transactedAt', message: 'Cannot be in the future.' })
  if (!REFERENCE.fuelTypes.some((f) => f.value === input.fuelType)) errors.push({ field: 'fuelType', message: 'Choose a fuel type.' })
  const litres = Number(input.litres)
  if (!Number.isFinite(litres) || litres <= 0) errors.push({ field: 'litres', message: 'Litres must be greater than zero.' })
  else if (litres > 1000) errors.push({ field: 'litres', message: 'More than 1,000 L in one fill is not plausible.' })
  const price = Number(input.pricePerLitre)
  if (!Number.isFinite(price) || price <= 0) errors.push({ field: 'pricePerLitre', message: 'Price must be greater than zero.' })
  const odo = Number(input.odometerKm)
  if (!Number.isFinite(odo) || odo < 0) errors.push({ field: 'odometerKm', message: 'Enter the odometer reading.' })
  if (input.driverId && !d.drivers.some((x) => x.id === Number(input.driverId)))
    errors.push({ field: 'driverId', message: 'Unknown driver.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  if (vehicle && input.fuelType !== vehicle.fuelType && vehicle.fuelType !== 'HYBRID')
    throw businessRule(`${vehicle.plateNumber} runs on ${vehicle.fuelType.toLowerCase()}, not ${input.fuelType.toLowerCase()}.`)
  if (
    input.receiptNumber?.trim() &&
    d.fuel.some(
      (f) =>
        f.id !== existingId &&
        f.receiptNumber &&
        f.receiptNumber.toLowerCase() === input.receiptNumber.trim().toLowerCase() &&
        f.station === input.station.trim(),
    )
  )
    throw conflict(`Receipt ${input.receiptNumber.trim()} from ${input.station.trim()} has already been recorded.`)
  // Odometer must not go backwards relative to earlier fills, nor exceed later fills.
  const at = new Date(input.transactedAt).toISOString()
  const earlier = d.fuel
    .filter((f) => f.id !== existingId && f.vehicleId === vehicle.id && f.transactedAt < at)
    .sort((a, b) => b.transactedAt.localeCompare(a.transactedAt))[0]
  const later = d.fuel
    .filter((f) => f.id !== existingId && f.vehicleId === vehicle.id && f.transactedAt > at)
    .sort((a, b) => a.transactedAt.localeCompare(b.transactedAt))[0]
  if (earlier && odo < earlier.odometerKm)
    throw businessRule(
      `Odometer ${odo.toLocaleString()} km is lower than the previous fill (${earlier.odometerKm.toLocaleString()} km on ${earlier.transactedAt.slice(0, 10)}).`,
    )
  if (later && odo > later.odometerKm)
    throw businessRule(
      `Odometer ${odo.toLocaleString()} km is higher than the next fill (${later.odometerKm.toLocaleString()} km on ${later.transactedAt.slice(0, 10)}).`,
    )
  if (odo > vehicle.odometerKm + 50 && !later)
    throw businessRule(
      `Odometer ${odo.toLocaleString()} km is above the vehicle's current reading (${vehicle.odometerKm.toLocaleString()} km). Update the vehicle odometer first if this is correct.`,
    )
  return vehicle
}

const normalise = (input, user) => ({
  vehicleId: Number(input.vehicleId),
  driverId: input.driverId ? Number(input.driverId) : null,
  station: input.station.trim(),
  transactedAt: new Date(input.transactedAt).toISOString(),
  fuelType: input.fuelType,
  litres: Math.round(Number(input.litres) * 100) / 100,
  pricePerLitre: Math.round(Number(input.pricePerLitre)),
  odometerKm: Math.round(Number(input.odometerKm)),
  receiptNumber: input.receiptNumber?.trim() || null,
  enteredById: user.id,
  notes: input.notes?.trim() || null,
})

get(
  '/fuel',
  ({ query }) => {
    const list = getDb()
      .fuel.map((f) => toFuel(f))
      .filter((f) => matchesText([f.vehiclePlate, f.driverName, f.station, f.receiptNumber], query.q))
      .filter((f) => !query.vehicleId || f.vehicleId === Number(query.vehicleId))
      .filter((f) => !query.driverId || f.driverId === Number(query.driverId))
      .filter((f) => !query.station || f.station === query.station)
      .filter((f) => !query.fuelType || f.fuelType === query.fuelType)
      .filter((f) => query.anomaly !== 'true' || f.anomaly)
      .filter((f) => inDateRange(f.transactedAt, query.from, query.to))
    return paginate(list, query, 'transactedAt,desc')
  },
  { permission: 'FUEL_READ' },
)

get('/fuel/stations', () => Array.from(new Set(getDb().fuel.map((f) => f.station))).sort(), { permission: 'FUEL_READ' })

get(
  '/fuel/summary',
  ({ query }) => {
    const d = getDb()
    const rows = d.fuel
      .filter((f) => inDateRange(f.transactedAt, query.from, query.to))
      .filter((f) => !query.vehicleId || f.vehicleId === Number(query.vehicleId))
    const litres = rows.reduce((s, f) => s + f.litres, 0)
    const cost = rows.reduce((s, f) => s + Math.round(f.litres * f.pricePerLitre), 0)
    const dtos = rows.map((f) => toFuel(f))
    const withConsumption = dtos.filter((f) => f.litresPer100Km != null && f.distanceSinceLastKm > 0)
    const distance = withConsumption.reduce((s, f) => s + f.distanceSinceLastKm, 0)
    const litresWithDistance = withConsumption.reduce((s, f) => s + f.litres, 0)
    const byStation = {}
    for (const f of rows) {
      byStation[f.station] = byStation[f.station] ?? { station: f.station, litres: 0, cost: 0, fills: 0 }
      byStation[f.station].litres += f.litres
      byStation[f.station].cost += Math.round(f.litres * f.pricePerLitre)
      byStation[f.station].fills += 1
    }
    const byVehicle = {}
    for (const f of dtos) {
      const v = byVehicle[f.vehicleId] ?? {
        vehicleId: f.vehicleId,
        plateNumber: f.vehiclePlate,
        litres: 0,
        cost: 0,
        distanceKm: 0,
        fills: 0,
      }
      v.litres += f.litres
      v.cost += f.totalAmount
      v.fills += 1
      v.distanceKm += f.distanceSinceLastKm && f.distanceSinceLastKm > 0 ? f.distanceSinceLastKm : 0
      byVehicle[f.vehicleId] = v
    }
    return {
      fills: rows.length,
      litres: Math.round(litres * 10) / 10,
      cost,
      averagePricePerLitre: litres > 0 ? Math.round(cost / litres) : null,
      averageL100: distance > 0 ? Math.round((litresWithDistance / distance) * 100 * 10) / 10 : null,
      anomalies: dtos.filter((f) => f.anomaly).length,
      byStation: Object.values(byStation).sort((a, b) => b.cost - a.cost),
      byVehicle: Object.values(byVehicle)
        .map((v) => ({
          ...v,
          litres: Math.round(v.litres * 10) / 10,
          l100: v.distanceKm > 0 ? Math.round((v.litres / v.distanceKm) * 1000) / 10 : null,
        }))
        .sort((a, b) => b.cost - a.cost),
    }
  },
  { permission: 'FUEL_READ' },
)

get('/fuel/:id', ({ params }) => toFuel(findFuel(params.id)), { permission: 'FUEL_READ' })

post(
  '/fuel',
  ({ body, user }) => {
    validateFuel(body)
    const now = new Date().toISOString()
    const row = { id: nextId('fuel'), ...normalise(body, user), createdAt: now, updatedAt: now }
    const d = getDb()
    d.fuel.push(row)
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    if (vehicle && row.odometerKm > vehicle.odometerKm) {
      vehicle.odometerKm = row.odometerKm
      vehicle.updatedAt = now
    }
    auditFuel(user, 'CREATE', row)
    persist()
    return toFuel(row)
  },
  { permission: 'FUEL_MANAGE' },
)

put(
  '/fuel/:id',
  ({ params, body, user }) => {
    const row = findFuel(params.id)
    validateFuel(body, row.id)
    const before = { ...row }
    Object.assign(row, normalise(body, user), { enteredById: row.enteredById, updatedAt: new Date().toISOString() })
    auditFuel(user, 'UPDATE', row, diff(before, row))
    persist()
    return toFuel(row)
  },
  { permission: 'FUEL_MANAGE' },
)

del(
  '/fuel/:id',
  ({ params, user }) => {
    const row = findFuel(params.id)
    const d = getDb()
    d.fuel = d.fuel.filter((f) => f.id !== row.id)
    auditFuel(user, 'DELETE', row, [
      { field: 'litres', from: row.litres, to: null },
      { field: 'totalAmount', from: Math.round(row.litres * row.pricePerLitre), to: null },
    ])
    persist()
    return null
  },
  { permission: 'FUEL_MANAGE' },
)

export { expectedL100 }
