import { format } from 'date-fns'
import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, forbidden, inDateRange, matchesText, notFound, paginate } from '../core'
import {
  currentAssignmentOf,
  pushNotification,
  recordAudit,
  toFuelRequest,
  userCan,
  userIdsForDriver,
  userIdsWithPermission,
} from '../mappers'
import { auditFuel, normaliseFuel, validateFuel } from './fuelRules'

/**
 * Fuel allocations: the fleet officer decides how much fuel a driver may put in a vehicle, the
 * driver fills up and submits the receipt as proof, and the officer verifies it. Verification is
 * what creates the fuel transaction, so consumption figures only ever come from checked receipts.
 *
 *   PENDING ──submit──▶ SUBMITTED ──verify──▶ VERIFIED
 *      ▲                    │
 *      └──── RETURNED ◀─────┘ (officer sends it back with a note; the driver resubmits)
 *   PENDING / RETURNED / SUBMITTED ──cancel──▶ CANCELLED
 */

const OPEN = ['PENDING', 'SUBMITTED', 'RETURNED']
const SUBMITTABLE = ['PENDING', 'RETURNED']
/** A driver may exceed the allocation by this much before the receipt is refused outright. */
const OVERFILL_TOLERANCE = 0.1
const MAX_PROOF_BYTES = 2 * 1024 * 1024

const auditA = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'FUEL_ALLOCATION',
    entityId: row.id,
    entityLabel: row.requestNumber,
    changes,
  })

const findAllocation = (id) => {
  const r = getDb().fuelRequests.find((x) => x.id === Number(id))
  if (!r) throw notFound('Fuel allocation')
  return r
}

const addHistory = (row, byId, action, note = null, at = new Date().toISOString()) => {
  row.history.push({ at, byId, action, note })
  row.updatedAt = at
}

/** Office staff see every allocation; a driver account only the allocations for its own driver profile. */
const assertOwn = (row, user) => {
  if (userCan(user, 'FUEL_READ')) return
  if (!user.driverId || row.driverId !== user.driverId) throw forbidden('This fuel allocation belongs to another driver.')
}

const notifyDriver = (row, title, body, actorId) =>
  pushNotification(userIdsForDriver(row.driverId), { title, body, link: '/my-day', kind: 'WORKFLOW' }, actorId)

const notifyOfficers = (row, title, body, actorId) => {
  const d = getDb()
  const creator = d.users.find((u) => u.id === row.createdById && u.active)
  const ids = creator ? [creator.id] : userIdsWithPermission('FUEL_MANAGE')
  pushNotification(ids, { title, body, link: `/fuel/allocations/${row.id}`, kind: 'WORKFLOW' }, actorId)
}

function validateAllocation(input, { existing = null } = {}) {
  const errors = []
  const d = getDb()
  const vehicle = d.vehicles.find((v) => v.id === Number(existing?.vehicleId ?? input.vehicleId) && !v.archived)
  if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  const driverId = existing
    ? existing.driverId
    : input.driverId
      ? Number(input.driverId)
      : (currentAssignmentOf(vehicle?.id)?.driverId ?? null)
  const driver = driverId ? d.drivers.find((x) => x.id === driverId && !x.archived) : null
  if (!driver) errors.push({ field: 'driverId', message: vehicle ? 'Choose the driver who will fill up.' : 'Choose a driver.' })
  const litres = Number(input.litres)
  if (!Number.isFinite(litres) || litres <= 0) errors.push({ field: 'litres', message: 'Litres must be greater than zero.' })
  else if (litres > 1000) errors.push({ field: 'litres', message: 'More than 1,000 L in one allocation is not plausible.' })
  const dueAt = input.dueAt ? new Date(input.dueAt) : null
  if (dueAt && Number.isNaN(dueAt.getTime())) errors.push({ field: 'dueAt', message: 'Enter a valid date.' })
  else if (dueAt && !existing && dueAt < new Date(Date.now() - 60_000))
    errors.push({ field: 'dueAt', message: 'The deadline is in the past.' })
  if (input.purpose && input.purpose.length > 120) errors.push({ field: 'purpose', message: 'Keep the purpose under 120 characters.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  if (['INACTIVE', 'OUT_OF_SERVICE'].includes(vehicle.status))
    throw businessRule(`${vehicle.plateNumber} is ${vehicle.status.replace(/_/g, ' ').toLowerCase()} and cannot be fuelled.`)
  if (vehicle.fuelType === 'ELECTRIC') throw businessRule(`${vehicle.plateNumber} is electric and does not take fuel.`)
  if (['INACTIVE', 'SUSPENDED'].includes(driver.status)) throw businessRule(`${driver.fullName} is ${driver.status.toLowerCase()}.`)
  const open = d.fuelRequests.find(
    (r) => r.id !== existing?.id && r.vehicleId === vehicle.id && r.driverId === driver.id && OPEN.includes(r.status),
  )
  if (open) throw conflict(`${driver.fullName} already has an open allocation (${open.requestNumber}) for ${vehicle.plateNumber}.`)
  return {
    vehicle,
    driver,
    values: {
      litresAllocated: Math.round(litres * 10) / 10,
      station: input.station?.trim() || null,
      dueAt: dueAt ? dueAt.toISOString() : null,
      purpose: input.purpose?.trim() || null,
      notes: input.notes?.trim() || null,
    },
  }
}

get(
  '/fuel/allocations',
  ({ query, user }) => {
    const scopedDriverId = userCan(user, 'FUEL_READ') ? null : (user.driverId ?? -1)
    const list = getDb()
      .fuelRequests.map(toFuelRequest)
      .filter((r) => scopedDriverId == null || r.driverId === scopedDriverId)
      .filter((r) => matchesText([r.requestNumber, r.vehiclePlate, r.driverName, r.station, r.purpose], query.q))
      .filter((r) => !query.status || query.status.split(',').includes(r.status))
      .filter((r) => query.open !== 'true' || OPEN.includes(r.status))
      .filter((r) => !query.vehicleId || r.vehicleId === Number(query.vehicleId))
      .filter((r) => !query.driverId || r.driverId === Number(query.driverId))
      .filter((r) => inDateRange(r.createdAt, query.from, query.to))
    return paginate(list, query, 'createdAt,desc')
  },
  { permission: ['FUEL_READ', 'FUEL_SUBMIT'] },
)

get(
  '/fuel/allocations/summary',
  () => {
    const list = getDb().fuelRequests.map(toFuelRequest)
    const month = new Date().toISOString().slice(0, 7)
    const open = list.filter((r) => OPEN.includes(r.status))
    return {
      pending: list.filter((r) => r.status === 'PENDING').length,
      submitted: list.filter((r) => r.status === 'SUBMITTED').length,
      returned: list.filter((r) => r.status === 'RETURNED').length,
      overdue: open.filter((r) => r.overdue).length,
      litresOpen: Math.round(open.reduce((s, r) => s + r.litresAllocated, 0) * 10) / 10,
      verifiedThisMonth: list.filter((r) => r.status === 'VERIFIED' && (r.reviewedAt ?? '').startsWith(month)).length,
    }
  },
  { permission: 'FUEL_READ' },
)

get(
  '/fuel/allocations/:id',
  ({ params, user }) => {
    const row = findAllocation(params.id)
    assertOwn(row, user)
    return toFuelRequest(row)
  },
  { permission: ['FUEL_READ', 'FUEL_SUBMIT'] },
)

post(
  '/fuel/allocations',
  ({ body, user }) => {
    const { vehicle, driver, values } = validateAllocation(body ?? {})
    const d = getDb()
    const now = new Date()
    const id = nextId('fuelRequest')
    const row = {
      id,
      requestNumber: `FA-${format(now, 'yyMM')}-${String(id).padStart(4, '0')}`,
      vehicleId: vehicle.id,
      driverId: driver.id,
      ...values,
      status: 'PENDING',
      createdById: user.id,
      submission: null,
      reviewNote: null,
      reviewedById: null,
      reviewedAt: null,
      fuelTransactionId: null,
      history: [],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    addHistory(row, user.id, 'Allocated', `${values.litresAllocated} L${values.station ? ` at ${values.station}` : ''}`, now.toISOString())
    d.fuelRequests.push(row)
    auditA(user, 'CREATE', row)
    notifyDriver(
      row,
      `Fuel allocated: ${values.litresAllocated} L for ${vehicle.plateNumber}`,
      `${values.station ? `Fill up at ${values.station}` : 'Fill up at any station'}${values.dueAt ? ` by ${values.dueAt.slice(0, 10)}` : ''} and submit the receipt.`,
      user.id,
    )
    persist()
    return toFuelRequest(row)
  },
  { permission: 'FUEL_MANAGE' },
)

put(
  '/fuel/allocations/:id',
  ({ params, body, user }) => {
    const row = findAllocation(params.id)
    if (row.status !== 'PENDING') throw businessRule('Only allocations still awaiting a fill-up can be edited.')
    const { values } = validateAllocation(body ?? {}, { existing: row })
    const before = { ...row }
    Object.assign(row, values)
    const changes = diffFields(before, row, ['litresAllocated', 'station', 'dueAt', 'purpose', 'notes'])
    if (changes.length) {
      addHistory(row, user.id, 'Allocation changed', changes.map((c) => c.field).join(', '))
      auditA(user, 'UPDATE', row, changes)
      notifyDriver(
        row,
        `Fuel allocation ${row.requestNumber} changed`,
        `Now ${row.litresAllocated} L${row.station ? ` at ${row.station}` : ''}.`,
        user.id,
      )
    }
    persist()
    return toFuelRequest(row)
  },
  { permission: 'FUEL_MANAGE' },
)

const diffFields = (before, after, fields) =>
  fields.filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).map((k) => ({ field: k, from: before[k], to: after[k] }))

patch(
  '/fuel/allocations/:id/submit',
  ({ params, body, user }) => {
    const row = findAllocation(params.id)
    if (!userCan(user, 'FUEL_MANAGE') && (!user.driverId || row.driverId !== user.driverId))
      throw forbidden('You can only submit receipts for your own fuel allocations.')
    if (!SUBMITTABLE.includes(row.status))
      throw businessRule(
        row.status === 'SUBMITTED'
          ? 'This receipt has already been submitted and is waiting for verification.'
          : `A ${row.status.toLowerCase()} allocation cannot be submitted.`,
      )
    const input = body ?? {}
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const errors = []
    const litres = Number(input.litres)
    if (!Number.isFinite(litres) || litres <= 0) errors.push({ field: 'litres', message: 'Enter the litres on the receipt.' })
    const price = Number(input.pricePerLitre)
    if (!Number.isFinite(price) || price <= 0) errors.push({ field: 'pricePerLitre', message: 'Enter the price per litre.' })
    const odo = Number(input.odometerKm)
    if (!Number.isFinite(odo) || odo < 0) errors.push({ field: 'odometerKm', message: 'Enter the odometer reading.' })
    if (!input.receiptNumber?.trim()) errors.push({ field: 'receiptNumber', message: 'Enter the receipt number.' })
    const station = input.station?.trim() || row.station
    if (!station) errors.push({ field: 'station', message: 'Which station did you fill up at?' })
    const transactedAt = input.transactedAt ? new Date(input.transactedAt) : new Date()
    if (Number.isNaN(transactedAt.getTime())) errors.push({ field: 'transactedAt', message: 'Enter a valid date and time.' })
    else if (transactedAt > new Date(Date.now() + 5 * 60000)) errors.push({ field: 'transactedAt', message: 'Cannot be in the future.' })
    const proof = input.proof
    if (!proof || typeof proof.dataUrl !== 'string' || !/^data:(image\/|application\/pdf)/.test(proof.dataUrl))
      errors.push({ field: 'proof', message: 'Attach a photo or PDF of the receipt.' })
    else if ((proof.sizeBytes ?? proof.dataUrl.length) > MAX_PROOF_BYTES)
      errors.push({ field: 'proof', message: 'The receipt file must be under 2 MB.' })
    if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
    const ceiling = Math.round(row.litresAllocated * (1 + OVERFILL_TOLERANCE) * 10) / 10
    if (litres > ceiling)
      throw businessRule(
        `${litres} L is more than the ${row.litresAllocated} L allocated (up to ${ceiling} L is accepted). Ask the fleet officer to raise the allocation.`,
      )
    // Dry-run the fuel transaction rules now so the driver hears about an odometer or receipt problem immediately.
    validateFuel({
      vehicleId: vehicle.id,
      driverId: row.driverId,
      station,
      transactedAt: transactedAt.toISOString(),
      fuelType: vehicle.fuelType === 'HYBRID' ? 'PETROL' : vehicle.fuelType,
      litres,
      pricePerLitre: price,
      odometerKm: odo,
      receiptNumber: input.receiptNumber,
    })
    const now = new Date().toISOString()
    const resubmitted = row.status === 'RETURNED'
    row.submission = {
      litres: Math.round(litres * 100) / 100,
      pricePerLitre: Math.round(price),
      odometerKm: Math.round(odo),
      receiptNumber: input.receiptNumber.trim(),
      station,
      transactedAt: transactedAt.toISOString(),
      proof: {
        fileName: proof.fileName ?? 'receipt',
        contentType: proof.contentType ?? 'image/jpeg',
        sizeBytes: proof.sizeBytes ?? proof.dataUrl.length,
        dataUrl: proof.dataUrl,
      },
      notes: input.notes?.trim() || null,
      submittedAt: now,
      submittedById: user.id,
    }
    row.status = 'SUBMITTED'
    row.reviewNote = null
    addHistory(row, user.id, resubmitted ? 'Receipt resubmitted' : 'Receipt submitted', `${row.submission.litres} L at ${station}`, now)
    auditA(user, 'SUBMIT', row, [{ field: 'status', from: resubmitted ? 'RETURNED' : 'PENDING', to: 'SUBMITTED' }])
    notifyOfficers(
      row,
      `Receipt ${resubmitted ? 'resubmitted' : 'submitted'} for ${row.requestNumber}`,
      `${row.submission.litres} L at ${station} for ${vehicle.plateNumber}. Verify it to record the fuel.`,
      user.id,
    )
    persist()
    return toFuelRequest(row)
  },
  { permission: ['FUEL_SUBMIT', 'FUEL_MANAGE'] },
)

patch(
  '/fuel/allocations/:id/verify',
  ({ params, body, user }) => {
    const row = findAllocation(params.id)
    if (row.status !== 'SUBMITTED') throw businessRule('Only a submitted receipt can be verified.')
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const s = row.submission
    const input = {
      vehicleId: vehicle.id,
      driverId: row.driverId,
      station: s.station,
      transactedAt: s.transactedAt,
      fuelType: vehicle.fuelType === 'HYBRID' ? 'PETROL' : vehicle.fuelType,
      litres: s.litres,
      pricePerLitre: s.pricePerLitre,
      odometerKm: s.odometerKm,
      receiptNumber: s.receiptNumber,
      notes: [`Allocation ${row.requestNumber}`, s.notes, body?.note?.trim()].filter(Boolean).join(' · '),
    }
    validateFuel(input)
    const now = new Date().toISOString()
    const fuelRow = { id: nextId('fuel'), ...normaliseFuel(input, user), allocationId: row.id, createdAt: now, updatedAt: now }
    d.fuel.push(fuelRow)
    if (fuelRow.odometerKm > vehicle.odometerKm) {
      vehicle.odometerKm = fuelRow.odometerKm
      vehicle.updatedAt = now
    }
    auditFuel(user, 'CREATE', fuelRow)
    row.status = 'VERIFIED'
    row.fuelTransactionId = fuelRow.id
    row.reviewNote = body?.note?.trim() || null
    row.reviewedById = user.id
    row.reviewedAt = now
    addHistory(row, user.id, 'Verified', row.reviewNote, now)
    auditA(user, 'APPROVE', row, [{ field: 'status', from: 'SUBMITTED', to: 'VERIFIED' }])
    notifyDriver(
      row,
      `Fuel receipt verified · ${row.requestNumber}`,
      `${s.litres} L at ${s.station} for ${vehicle.plateNumber} has been recorded.`,
      user.id,
    )
    persist()
    return toFuelRequest(row)
  },
  { permission: 'FUEL_MANAGE' },
)

patch(
  '/fuel/allocations/:id/return',
  ({ params, body, user }) => {
    const row = findAllocation(params.id)
    if (row.status !== 'SUBMITTED') throw businessRule('Only a submitted receipt can be returned to the driver.')
    const note = body?.note?.trim()
    if (!note) throw badRequest('Tell the driver what to fix.', [{ field: 'note', message: 'A note to the driver is required.' }])
    const now = new Date().toISOString()
    row.status = 'RETURNED'
    row.reviewNote = note
    row.reviewedById = user.id
    row.reviewedAt = now
    addHistory(row, user.id, 'Returned to driver', note, now)
    auditA(user, 'REJECT', row, [{ field: 'status', from: 'SUBMITTED', to: 'RETURNED' }])
    notifyDriver(row, `Fuel receipt returned · ${row.requestNumber}`, note, user.id)
    persist()
    return toFuelRequest(row)
  },
  { permission: 'FUEL_MANAGE' },
)

patch(
  '/fuel/allocations/:id/cancel',
  ({ params, body, user }) => {
    const row = findAllocation(params.id)
    if (!OPEN.includes(row.status)) throw businessRule(`A ${row.status.toLowerCase()} allocation cannot be cancelled.`)
    const from = row.status
    const now = new Date().toISOString()
    row.status = 'CANCELLED'
    row.reviewNote = body?.reason?.trim() || null
    row.reviewedById = user.id
    row.reviewedAt = now
    addHistory(row, user.id, 'Cancelled', row.reviewNote, now)
    auditA(user, 'CANCEL', row, [{ field: 'status', from, to: 'CANCELLED' }])
    notifyDriver(row, `Fuel allocation ${row.requestNumber} cancelled`, row.reviewNote ?? 'No fill-up is needed.', user.id)
    persist()
    return toFuelRequest(row)
  },
  { permission: 'FUEL_MANAGE' },
)
