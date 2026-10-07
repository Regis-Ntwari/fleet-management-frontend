import { format } from 'date-fns'
import { get, post, put, patch, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, inDateRange, matchesText, notFound, paginate } from '../core'
import { currentAssignmentOf, diff, recordAudit, toMaintenance, toSchedule } from '../mappers'
import { REFERENCE } from './reference'

const auditM = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'MAINTENANCE',
    entityId: row.id,
    entityLabel: row.maintenanceNumber,
    changes,
  })

const findRecord = (id) => {
  const m = getDb().maintenance.find((x) => x.id === Number(id))
  if (!m) throw notFound('Maintenance record')
  return m
}

const OPEN = ['REPORTED', 'INSPECTION', 'APPROVED', 'IN_PROGRESS', 'WAITING_FOR_PARTS']

function validate(input) {
  const errors = []
  const d = getDb()
  const vehicle = d.vehicles.find((v) => v.id === Number(input.vehicleId) && !v.archived)
  if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (!input.complaint?.trim()) errors.push({ field: 'complaint', message: 'Describe the complaint or problem.' })
  if (!REFERENCE.maintenanceTypes.some((t) => t.value === input.type)) errors.push({ field: 'type', message: 'Choose a maintenance type.' })
  if (!input.workshop?.trim()) errors.push({ field: 'workshop', message: 'Workshop is required.' })
  const odo = Number(input.odometerKm)
  if (!Number.isFinite(odo) || odo < 0) errors.push({ field: 'odometerKm', message: 'Enter the odometer reading.' })
  for (const k of ['laborCost', 'otherCost'])
    if (input[k] != null && input[k] !== '' && Number(input[k]) < 0) errors.push({ field: k, message: 'Cannot be negative.' })
  if (Array.isArray(input.parts)) {
    input.parts.forEach((p, i) => {
      if (!d.parts.some((x) => x.id === Number(p.partId))) errors.push({ field: `parts.${i}.partId`, message: 'Unknown part.' })
      if (!Number.isInteger(Number(p.quantity)) || Number(p.quantity) < 1)
        errors.push({ field: `parts.${i}.quantity`, message: 'Quantity must be at least 1.' })
    })
  }
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return vehicle
}

const partsFrom = (input) =>
  (Array.isArray(input.parts) ? input.parts : []).map((p) => {
    const part = getDb().parts.find((x) => x.id === Number(p.partId))
    return { partId: part.id, quantity: Number(p.quantity), unitCost: part.unitCost }
  })

get(
  '/maintenance',
  ({ query }) => {
    const list = getDb()
      .maintenance.map(toMaintenance)
      .filter((m) => matchesText([m.maintenanceNumber, m.vehiclePlate, m.complaint, m.workshop, m.technicianName], query.q))
      .filter((m) => !query.status || query.status.split(',').includes(m.status))
      .filter((m) => query.open !== 'true' || OPEN.includes(m.status))
      .filter((m) => !query.type || m.type === query.type)
      .filter((m) => !query.vehicleId || m.vehicleId === Number(query.vehicleId))
      .filter((m) => !query.workshop || m.workshop === query.workshop)
      .filter((m) => inDateRange(m.reportedAt, query.from, query.to))
    return paginate(list, query, 'reportedAt,desc')
  },
  { permission: 'MAINTENANCE_READ' },
)

get(
  '/maintenance/summary',
  () => {
    const list = getDb().maintenance.map(toMaintenance)
    const open = list.filter((m) => OPEN.includes(m.status))
    const month = new Date().toISOString().slice(0, 7)
    return {
      open: open.length,
      inProgress: list.filter((m) => m.status === 'IN_PROGRESS').length,
      waitingForParts: list.filter((m) => m.status === 'WAITING_FOR_PARTS').length,
      overdue: open.filter((m) => m.expectedCompletionAt && m.expectedCompletionAt < new Date().toISOString()).length,
      completedThisMonth: list.filter((m) => m.status === 'COMPLETED' && (m.completedAt ?? '').startsWith(month)).length,
      costThisMonth: list
        .filter((m) => m.status === 'COMPLETED' && (m.completedAt ?? '').startsWith(month))
        .reduce((s, m) => s + m.totalCost, 0),
      byStatus: REFERENCE.maintenanceStatuses.map((s) => ({
        status: s.value,
        label: s.label,
        count: list.filter((m) => m.status === s.value).length,
      })),
    }
  },
  { permission: 'MAINTENANCE_READ' },
)

get('/maintenance/workshops', () => Array.from(new Set(getDb().maintenance.map((m) => m.workshop))).sort(), {
  permission: 'MAINTENANCE_READ',
})

get('/maintenance/:id', ({ params }) => toMaintenance(findRecord(params.id)), { permission: 'MAINTENANCE_READ' })

post(
  '/maintenance',
  ({ body, user }) => {
    const vehicle = validate(body)
    const d = getDb()
    if (
      d.maintenance.some(
        (m) => m.vehicleId === vehicle.id && OPEN.includes(m.status) && m.complaint.toLowerCase() === body.complaint.trim().toLowerCase(),
      )
    )
      throw conflict(`An open maintenance record with the same complaint already exists for ${vehicle.plateNumber}.`)
    const now = new Date()
    const id = nextId('maintenance')
    const row = {
      id,
      maintenanceNumber: `MT-${format(now, 'yyMM')}-${String(id).padStart(4, '0')}`,
      vehicleId: vehicle.id,
      reportedAt: now.toISOString(),
      reportedById: user.id,
      complaint: body.complaint.trim(),
      type: body.type,
      technicianName: body.technicianName?.trim() || null,
      workshop: body.workshop.trim(),
      startedAt: null,
      expectedCompletionAt: body.expectedCompletionAt ? new Date(body.expectedCompletionAt).toISOString() : null,
      completedAt: null,
      odometerKm: Math.round(Number(body.odometerKm)),
      diagnosis: body.diagnosis?.trim() || null,
      servicePerformed: null,
      parts: partsFrom(body),
      laborCost: Number(body.laborCost) || 0,
      otherCost: Number(body.otherCost) || 0,
      status: 'REPORTED',
      comments: body.comments?.trim() || null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    d.maintenance.push(row)
    auditM(user, 'CREATE', row)
    persist()
    return toMaintenance(row)
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

put(
  '/maintenance/:id',
  ({ params, body, user }) => {
    const row = findRecord(params.id)
    if (['COMPLETED', 'CANCELLED'].includes(row.status))
      throw businessRule('Closed maintenance records are read-only. Create a new record for additional work.')
    validate({ ...body, vehicleId: row.vehicleId })
    const before = { ...row, parts: [...row.parts] }
    Object.assign(row, {
      complaint: body.complaint.trim(),
      type: body.type,
      technicianName: body.technicianName?.trim() || null,
      workshop: body.workshop.trim(),
      expectedCompletionAt: body.expectedCompletionAt ? new Date(body.expectedCompletionAt).toISOString() : row.expectedCompletionAt,
      odometerKm: Math.round(Number(body.odometerKm)),
      diagnosis: body.diagnosis?.trim() || null,
      servicePerformed: body.servicePerformed?.trim() || null,
      parts: partsFrom(body),
      laborCost: Number(body.laborCost) || 0,
      otherCost: Number(body.otherCost) || 0,
      comments: body.comments?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    auditM(user, 'UPDATE', row, diff(before, row))
    persist()
    return toMaintenance(row)
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

const transitions = {
  REPORTED: ['INSPECTION', 'APPROVED', 'CANCELLED'],
  INSPECTION: ['APPROVED', 'CANCELLED'],
  APPROVED: ['IN_PROGRESS', 'WAITING_FOR_PARTS', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_PARTS', 'COMPLETED', 'CANCELLED'],
  WAITING_FOR_PARTS: ['IN_PROGRESS', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
}

patch(
  '/maintenance/:id/status',
  ({ params, body, user }) => {
    const row = findRecord(params.id)
    const { status, note, technicianName, servicePerformed } = body ?? {}
    if (!transitions[row.status]?.includes(status))
      throw businessRule(
        `Cannot move from ${row.status.toLowerCase().replace(/_/g, ' ')} to ${String(status).toLowerCase().replace(/_/g, ' ')}.`,
      )
    const d = getDb()
    const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
    const now = new Date().toISOString()
    const from = row.status
    if (status === 'APPROVED' || status === 'IN_PROGRESS') {
      if (vehicle.status === 'ON_TRIP')
        throw businessRule(`${vehicle.plateNumber} is on a trip. The vehicle must be back before work begins.`)
    }
    if (status === 'IN_PROGRESS') {
      if (!row.technicianName && !technicianName?.trim())
        throw badRequest('Assign a technician before starting work.', [{ field: 'technicianName', message: 'Required to start work.' }])
      row.technicianName = technicianName?.trim() || row.technicianName
      row.startedAt = row.startedAt ?? now
      // Deduct parts from stock the first time work starts.
      if (from !== 'WAITING_FOR_PARTS') {
        for (const p of row.parts) {
          const part = d.parts.find((x) => x.id === p.partId)
          if (part && part.currentStock < p.quantity)
            throw businessRule(
              `Insufficient stock for ${part.name}: ${part.currentStock} available, ${p.quantity} required. Set the job to "Waiting for parts".`,
            )
        }
        for (const p of row.parts) {
          const part = d.parts.find((x) => x.id === p.partId)
          if (part) {
            part.currentStock -= p.quantity
            part.updatedAt = now
          }
        }
      }
      if (['AVAILABLE', 'ASSIGNED', 'RESERVED'].includes(vehicle.status)) {
        vehicle.status = 'IN_MAINTENANCE'
        vehicle.updatedAt = now
      }
    }
    if (status === 'WAITING_FOR_PARTS' && ['AVAILABLE', 'ASSIGNED', 'RESERVED'].includes(vehicle.status)) {
      vehicle.status = 'IN_MAINTENANCE'
      vehicle.updatedAt = now
    }
    if (status === 'COMPLETED') {
      if (!row.servicePerformed && !servicePerformed?.trim())
        throw badRequest('Describe the service performed before completing.', [
          { field: 'servicePerformed', message: 'Required to complete.' },
        ])
      row.servicePerformed = servicePerformed?.trim() || row.servicePerformed
      row.completedAt = now
      if (
        vehicle.status === 'IN_MAINTENANCE' &&
        !d.maintenance.some((m) => m.id !== row.id && m.vehicleId === vehicle.id && ['IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(m.status))
      ) {
        vehicle.status = currentAssignmentOf(vehicle.id) ? 'ASSIGNED' : 'AVAILABLE'
        vehicle.updatedAt = now
      }
      if (row.odometerKm > vehicle.odometerKm) vehicle.odometerKm = row.odometerKm
      // Preventive work resets matching schedules.
      if (row.type === 'PREVENTIVE') {
        const lower = row.complaint.toLowerCase()
        for (const s of d.schedules.filter((x) => x.vehicleId === vehicle.id)) {
          const task = s.task.toLowerCase()
          if (lower.includes('service') || lower.includes(task.split(' ')[0])) {
            s.lastServiceKm = row.odometerKm
            s.lastServiceDate = now.slice(0, 10)
          }
        }
      }
    }
    if (status === 'CANCELLED') {
      if (from === 'IN_PROGRESS')
        for (const p of row.parts) {
          const part = d.parts.find((x) => x.id === p.partId)
          if (part) part.currentStock += p.quantity
        }
      if (
        vehicle.status === 'IN_MAINTENANCE' &&
        !d.maintenance.some((m) => m.id !== row.id && m.vehicleId === vehicle.id && ['IN_PROGRESS', 'WAITING_FOR_PARTS'].includes(m.status))
      ) {
        vehicle.status = currentAssignmentOf(vehicle.id) ? 'ASSIGNED' : 'AVAILABLE'
        vehicle.updatedAt = now
      }
    }
    if (note?.trim()) row.comments = `${row.comments ? row.comments + '\n' : ''}[${now.slice(0, 16).replace('T', ' ')}] ${note.trim()}`
    row.status = status
    row.updatedAt = now
    auditM(user, 'STATUS_CHANGE', row, [{ field: 'status', from, to: status }])
    persist()
    return toMaintenance(row)
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

// ---------- Preventive schedules ----------

get(
  '/maintenance-schedules',
  ({ query }) => {
    const list = getDb()
      .schedules.map(toSchedule)
      .filter((s) => matchesText([s.vehiclePlate, s.task], query.q))
      .filter((s) => !query.state || query.state.split(',').includes(s.state))
      .filter((s) => !query.vehicleId || s.vehicleId === Number(query.vehicleId))
    const order = { OVERDUE: 0, DUE_SOON: 1, OK: 2 }
    list.sort((a, b) => order[a.state] - order[b.state] || (a.kmRemaining ?? 1e9) - (b.kmRemaining ?? 1e9))
    return paginate(list, query)
  },
  { permission: 'MAINTENANCE_READ' },
)

post(
  '/maintenance-schedules',
  ({ body, user }) => {
    const d = getDb()
    const errors = []
    const vehicle = d.vehicles.find((v) => v.id === Number(body?.vehicleId) && !v.archived)
    if (!vehicle) errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
    if (!body?.task?.trim()) errors.push({ field: 'task', message: 'Task is required.' })
    const km = body?.intervalKm === '' || body?.intervalKm == null ? null : Number(body.intervalKm)
    const days = body?.intervalDays === '' || body?.intervalDays == null ? null : Number(body.intervalDays)
    if (km == null && days == null) errors.push({ field: 'intervalKm', message: 'Set a km interval, a day interval, or both.' })
    if (km != null && (!Number.isFinite(km) || km <= 0)) errors.push({ field: 'intervalKm', message: 'Must be a positive number.' })
    if (days != null && (!Number.isFinite(days) || days <= 0)) errors.push({ field: 'intervalDays', message: 'Must be a positive number.' })
    const lastKm = Number(body?.lastServiceKm)
    if (!Number.isFinite(lastKm) || lastKm < 0) errors.push({ field: 'lastServiceKm', message: 'Enter the last service odometer.' })
    if (!body?.lastServiceDate) errors.push({ field: 'lastServiceDate', message: 'Enter the last service date.' })
    if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
    if (lastKm > vehicle.odometerKm)
      throw businessRule(`Last service odometer cannot exceed the vehicle's current ${vehicle.odometerKm.toLocaleString()} km.`)
    if (d.schedules.some((s) => s.vehicleId === vehicle.id && s.task.toLowerCase() === body.task.trim().toLowerCase()))
      throw conflict(`${vehicle.plateNumber} already has a "${body.task.trim()}" schedule.`)
    const row = {
      id: nextId('schedule'),
      vehicleId: vehicle.id,
      task: body.task.trim(),
      intervalKm: km,
      intervalDays: days,
      lastServiceKm: lastKm,
      lastServiceDate: body.lastServiceDate,
    }
    d.schedules.push(row)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'CREATE',
      entityType: 'MAINTENANCE_SCHEDULE',
      entityId: row.id,
      entityLabel: `${vehicle.plateNumber} · ${row.task}`,
      changes: null,
    })
    persist()
    return toSchedule(row)
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

put(
  '/maintenance-schedules/:id',
  ({ params, body }) => {
    const d = getDb()
    const row = d.schedules.find((s) => s.id === Number(params.id))
    if (!row) throw notFound('Maintenance schedule')
    const km = body?.intervalKm === '' || body?.intervalKm == null ? null : Number(body.intervalKm)
    const days = body?.intervalDays === '' || body?.intervalDays == null ? null : Number(body.intervalDays)
    if (km == null && days == null)
      throw badRequest('Set a km interval, a day interval, or both.', [{ field: 'intervalKm', message: 'Required.' }])
    Object.assign(row, {
      task: body.task?.trim() || row.task,
      intervalKm: km,
      intervalDays: days,
      lastServiceKm: Number(body.lastServiceKm ?? row.lastServiceKm),
      lastServiceDate: body.lastServiceDate || row.lastServiceDate,
    })
    persist()
    return toSchedule(row)
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

del(
  '/maintenance-schedules/:id',
  ({ params }) => {
    const d = getDb()
    if (!d.schedules.some((s) => s.id === Number(params.id))) throw notFound('Maintenance schedule')
    d.schedules = d.schedules.filter((s) => s.id !== Number(params.id))
    persist()
    return null
  },
  { permission: 'MAINTENANCE_MANAGE' },
)

// ---------- Spare parts ----------

get(
  '/spare-parts',
  ({ query }) => {
    const list = getDb()
      .parts.filter((p) => matchesText([p.partNumber, p.name, p.category, p.supplier], query.q))
      .filter((p) => !query.category || p.category === query.category)
      .filter((p) => query.lowStock !== 'true' || p.currentStock < p.minimumStock)
      .map((p) => ({ ...p, lowStock: p.currentStock < p.minimumStock, stockValue: p.currentStock * p.unitCost }))
    return paginate(list, query, 'name,asc')
  },
  { permission: 'MAINTENANCE_READ' },
)

get('/spare-parts/categories', () => Array.from(new Set(getDb().parts.map((p) => p.category))).sort(), { permission: 'MAINTENANCE_READ' })

function validatePart(input, existingId = null) {
  const errors = []
  if (!input.partNumber?.trim()) errors.push({ field: 'partNumber', message: 'Part number is required.' })
  else if (getDb().parts.some((p) => p.id !== existingId && p.partNumber.toLowerCase() === input.partNumber.trim().toLowerCase()))
    throw conflict(`Part number ${input.partNumber.trim()} already exists.`)
  if (!input.name?.trim()) errors.push({ field: 'name', message: 'Name is required.' })
  if (!input.category?.trim()) errors.push({ field: 'category', message: 'Category is required.' })
  if (!input.supplier?.trim()) errors.push({ field: 'supplier', message: 'Supplier is required.' })
  if (!(Number(input.unitCost) >= 0)) errors.push({ field: 'unitCost', message: 'Unit cost cannot be negative.' })
  if (!Number.isInteger(Number(input.minimumStock)) || Number(input.minimumStock) < 0)
    errors.push({ field: 'minimumStock', message: 'Whole number, zero or more.' })
  if (!Number.isInteger(Number(input.currentStock)) || Number(input.currentStock) < 0)
    errors.push({ field: 'currentStock', message: 'Whole number, zero or more.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

post(
  '/spare-parts',
  ({ body, user }) => {
    validatePart(body)
    const now = new Date().toISOString()
    const row = {
      id: nextId('part'),
      partNumber: body.partNumber.trim().toUpperCase(),
      name: body.name.trim(),
      category: body.category.trim(),
      unitCost: Number(body.unitCost),
      supplier: body.supplier.trim(),
      minimumStock: Number(body.minimumStock),
      currentStock: Number(body.currentStock),
      createdAt: now,
      updatedAt: now,
    }
    getDb().parts.push(row)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'CREATE',
      entityType: 'SPARE_PART',
      entityId: row.id,
      entityLabel: row.partNumber,
      changes: null,
    })
    persist()
    return { ...row, lowStock: row.currentStock < row.minimumStock, stockValue: row.currentStock * row.unitCost }
  },
  { permission: 'PARTS_MANAGE' },
)

put(
  '/spare-parts/:id',
  ({ params, body, user }) => {
    const row = getDb().parts.find((p) => p.id === Number(params.id))
    if (!row) throw notFound('Spare part')
    validatePart(body, row.id)
    const before = { ...row }
    Object.assign(row, {
      partNumber: body.partNumber.trim().toUpperCase(),
      name: body.name.trim(),
      category: body.category.trim(),
      unitCost: Number(body.unitCost),
      supplier: body.supplier.trim(),
      minimumStock: Number(body.minimumStock),
      currentStock: Number(body.currentStock),
      updatedAt: new Date().toISOString(),
    })
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'SPARE_PART',
      entityId: row.id,
      entityLabel: row.partNumber,
      changes: diff(before, row),
    })
    persist()
    return { ...row, lowStock: row.currentStock < row.minimumStock, stockValue: row.currentStock * row.unitCost }
  },
  { permission: 'PARTS_MANAGE' },
)

patch(
  '/spare-parts/:id/stock',
  ({ params, body, user }) => {
    const row = getDb().parts.find((p) => p.id === Number(params.id))
    if (!row) throw notFound('Spare part')
    const delta = Number(body?.delta)
    if (!Number.isInteger(delta) || delta === 0)
      throw badRequest('Enter a non-zero whole number.', [{ field: 'delta', message: 'Required.' }])
    if (row.currentStock + delta < 0) throw businessRule(`Stock cannot go below zero (currently ${row.currentStock}).`)
    const from = row.currentStock
    row.currentStock += delta
    row.updatedAt = new Date().toISOString()
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'SPARE_PART',
      entityId: row.id,
      entityLabel: row.partNumber,
      changes: [
        { field: 'currentStock', from, to: row.currentStock },
        ...(body?.reason ? [{ field: 'reason', from: null, to: body.reason }] : []),
      ],
    })
    persist()
    return { ...row, lowStock: row.currentStock < row.minimumStock, stockValue: row.currentStock * row.unitCost }
  },
  { permission: 'PARTS_MANAGE' },
)
