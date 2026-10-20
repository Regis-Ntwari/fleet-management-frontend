import { getDb } from '../db'
import { badRequest, businessRule, conflict, notFound } from '../core'
import { isLookupValue, recordAudit } from '../mappers'

/**
 * Validation shared by direct fuel entry (officer records a fill) and the allocation workflow
 * (driver submits a receipt, officer verifies it into the same transaction table).
 */

export const auditFuel = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'FUEL_TRANSACTION',
    entityId: row.id,
    entityLabel: `Fuel #${row.id}`,
    changes,
  })

export const findFuel = (id) => {
  const f = getDb().fuel.find((x) => x.id === Number(id))
  if (!f) throw notFound('Fuel transaction')
  return f
}

export function validateFuel(input, existingId = null) {
  const errors = []
  const d = getDb()
  const vehicle = d.vehicles.find((v) => v.id === Number(input.vehicleId) && !v.archived)
  if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (!input.station?.trim()) errors.push({ field: 'station', message: 'Fuel station is required.' })
  if (!input.transactedAt) errors.push({ field: 'transactedAt', message: 'Date and time are required.' })
  else if (new Date(input.transactedAt) > new Date(Date.now() + 5 * 60000))
    errors.push({ field: 'transactedAt', message: 'Cannot be in the future.' })
  if (!isLookupValue('fuelTypes', input.fuelType)) errors.push({ field: 'fuelType', message: 'Choose a fuel type.' })
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

export const normaliseFuel = (input, user) => ({
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
