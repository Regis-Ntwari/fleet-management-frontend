import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { inDateRange, matchesText, paginate } from '../core'
import { diff, expectedL100, toFuel } from '../mappers'
import { auditFuel, findFuel, normaliseFuel, validateFuel } from './fuelRules'

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
    const row = { id: nextId('fuel'), ...normaliseFuel(body, user), createdAt: now, updatedAt: now }
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
    Object.assign(row, normaliseFuel(body, user), { enteredById: row.enteredById, updatedAt: new Date().toISOString() })
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
