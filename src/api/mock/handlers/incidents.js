import { format } from 'date-fns'
import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, inDateRange, matchesText, notFound, paginate } from '../core'
import { diff, recordAudit, toIncident } from '../mappers'
import { REFERENCE } from './reference'

const auditI = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'INCIDENT',
    entityId: row.id,
    entityLabel: row.incidentNumber,
    changes,
  })

const findIncident = (id) => {
  const i = getDb().incidents.find((x) => x.id === Number(id))
  if (!i) throw notFound('Incident')
  return i
}

function validate(input) {
  const errors = []
  const d = getDb()
  if (!d.vehicles.some((v) => v.id === Number(input.vehicleId) && !v.archived))
    errors.push({ field: 'vehicleId', message: 'Choose a vehicle.' })
  if (input.driverId && !d.drivers.some((x) => x.id === Number(input.driverId)))
    errors.push({ field: 'driverId', message: 'Unknown driver.' })
  if (!input.occurredAt) errors.push({ field: 'occurredAt', message: 'Date and time are required.' })
  else if (new Date(input.occurredAt) > new Date()) errors.push({ field: 'occurredAt', message: 'Cannot be in the future.' })
  if (!input.location?.trim()) errors.push({ field: 'location', message: 'Location is required.' })
  if (!REFERENCE.incidentTypes.some((t) => t.value === input.type)) errors.push({ field: 'type', message: 'Choose an incident type.' })
  if (!input.description?.trim() || input.description.trim().length < 10)
    errors.push({ field: 'description', message: 'Describe what happened (at least 10 characters).' })
  if (!REFERENCE.incidentSeverities.some((s) => s.value === input.severity))
    errors.push({ field: 'severity', message: 'Choose a severity.' })
  if (input.estimatedCost != null && input.estimatedCost !== '' && Number(input.estimatedCost) < 0)
    errors.push({ field: 'estimatedCost', message: 'Cannot be negative.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

const entry = (user, action, note = null) => ({ at: new Date().toISOString(), byName: `${user.firstName} ${user.lastName}`, action, note })

get(
  '/incidents',
  ({ query }) => {
    const list = getDb()
      .incidents.map(toIncident)
      .filter((i) => matchesText([i.incidentNumber, i.vehiclePlate, i.driverName, i.location, i.description], query.q))
      .filter((i) => !query.status || query.status.split(',').includes(i.status))
      .filter((i) => !query.severity || i.severity === query.severity)
      .filter((i) => !query.type || i.type === query.type)
      .filter((i) => !query.vehicleId || i.vehicleId === Number(query.vehicleId))
      .filter((i) => !query.driverId || i.driverId === Number(query.driverId))
      .filter((i) => inDateRange(i.occurredAt, query.from, query.to))
    return paginate(list, query, 'occurredAt,desc')
  },
  { permission: 'INCIDENT_READ' },
)

get(
  '/incidents/summary',
  () => {
    const list = getDb().incidents
    const month = new Date().toISOString().slice(0, 7)
    return {
      open: list.filter((i) => i.status === 'OPEN').length,
      underInvestigation: list.filter((i) => i.status === 'UNDER_INVESTIGATION').length,
      thisMonth: list.filter((i) => i.occurredAt.startsWith(month)).length,
      estimatedCostOpen: list
        .filter((i) => ['OPEN', 'UNDER_INVESTIGATION'].includes(i.status))
        .reduce((s, i) => s + (i.estimatedCost ?? 0), 0),
      byType: REFERENCE.incidentTypes
        .map((t) => ({ type: t.value, label: t.label, count: list.filter((i) => i.type === t.value).length }))
        .filter((x) => x.count > 0),
    }
  },
  { permission: 'INCIDENT_READ' },
)

get('/incidents/:id', ({ params }) => toIncident(findIncident(params.id)), { permission: 'INCIDENT_READ' })

post(
  '/incidents',
  ({ body, user }) => {
    validate(body)
    const now = new Date()
    const id = nextId('incident')
    const row = {
      id,
      incidentNumber: `INC-${format(now, 'yyMM')}-${String(id).padStart(3, '0')}`,
      vehicleId: Number(body.vehicleId),
      driverId: body.driverId ? Number(body.driverId) : null,
      occurredAt: new Date(body.occurredAt).toISOString(),
      location: body.location.trim(),
      type: body.type,
      description: body.description.trim(),
      severity: body.severity,
      investigation: null,
      correctiveAction: null,
      estimatedCost: body.estimatedCost === '' || body.estimatedCost == null ? null : Number(body.estimatedCost),
      status: 'OPEN',
      attachments: [],
      history: [entry(user, 'Incident reported')],
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }
    const d = getDb()
    d.incidents.push(row)
    if (['ACCIDENT', 'BREAKDOWN'].includes(row.type) && ['HIGH', 'CRITICAL'].includes(row.severity)) {
      const vehicle = d.vehicles.find((v) => v.id === row.vehicleId)
      if (vehicle && ['AVAILABLE', 'ASSIGNED', 'RESERVED'].includes(vehicle.status)) {
        vehicle.status = 'OUT_OF_SERVICE'
        vehicle.updatedAt = now.toISOString()
        row.history.push(entry(user, 'Vehicle taken out of service', 'Automatic: high-severity accident or breakdown.'))
      }
    }
    auditI(user, 'CREATE', row)
    persist()
    return toIncident(row)
  },
  { permission: 'INCIDENT_MANAGE' },
)

put(
  '/incidents/:id',
  ({ params, body, user }) => {
    const row = findIncident(params.id)
    if (row.status === 'CLOSED') throw businessRule('Closed incidents cannot be edited.')
    validate({ ...body, vehicleId: row.vehicleId })
    const before = { ...row }
    Object.assign(row, {
      driverId: body.driverId ? Number(body.driverId) : null,
      occurredAt: new Date(body.occurredAt).toISOString(),
      location: body.location.trim(),
      type: body.type,
      description: body.description.trim(),
      severity: body.severity,
      investigation: body.investigation?.trim() || row.investigation,
      correctiveAction: body.correctiveAction?.trim() || row.correctiveAction,
      estimatedCost: body.estimatedCost === '' || body.estimatedCost == null ? null : Number(body.estimatedCost),
      updatedAt: new Date().toISOString(),
    })
    const changes = diff(before, row, [
      'driverId',
      'occurredAt',
      'location',
      'type',
      'description',
      'severity',
      'investigation',
      'correctiveAction',
      'estimatedCost',
    ])
    if (changes.length) row.history.push(entry(user, 'Details updated', changes.map((c) => c.field).join(', ')))
    auditI(user, 'UPDATE', row, changes)
    persist()
    return toIncident(row)
  },
  { permission: 'INCIDENT_MANAGE' },
)

const transitions = {
  OPEN: ['UNDER_INVESTIGATION', 'RESOLVED'],
  UNDER_INVESTIGATION: ['RESOLVED', 'OPEN'],
  RESOLVED: ['CLOSED', 'UNDER_INVESTIGATION'],
  CLOSED: [],
}

patch(
  '/incidents/:id/status',
  ({ params, body, user }) => {
    const row = findIncident(params.id)
    const { status, note, investigation, correctiveAction } = body ?? {}
    if (!transitions[row.status]?.includes(status))
      throw businessRule(
        `Cannot move from ${row.status.toLowerCase().replace(/_/g, ' ')} to ${String(status).toLowerCase().replace(/_/g, ' ')}.`,
      )
    if (status === 'RESOLVED') {
      row.correctiveAction = correctiveAction?.trim() || row.correctiveAction
      if (!row.correctiveAction)
        throw badRequest('Record the corrective action before resolving.', [{ field: 'correctiveAction', message: 'Required to resolve.' }])
    }
    if (status === 'UNDER_INVESTIGATION') row.investigation = investigation?.trim() || row.investigation
    if (status === 'CLOSED' && !note?.trim())
      throw badRequest('A closing note is required.', [{ field: 'note', message: 'Required to close.' }])
    const from = row.status
    const labels = { UNDER_INVESTIGATION: 'Investigation opened', RESOLVED: 'Marked resolved', CLOSED: 'Closed', OPEN: 'Reopened' }
    row.history.push(entry(user, labels[status], note?.trim() || null))
    row.status = status
    row.updatedAt = new Date().toISOString()
    auditI(user, 'STATUS_CHANGE', row, [{ field: 'status', from, to: status }])
    persist()
    return toIncident(row)
  },
  { permission: 'INCIDENT_MANAGE' },
)

post(
  '/incidents/:id/attachments',
  ({ params, body, user }) => {
    const row = findIncident(params.id)
    if (row.status === 'CLOSED') throw businessRule('Closed incidents cannot receive attachments.')
    const { fileName, contentType, sizeBytes } = body ?? {}
    if (!fileName) throw badRequest('Choose a file.', [{ field: 'file', message: 'Required.' }])
    if (Number(sizeBytes) > 10 * 1024 * 1024)
      throw badRequest('Files must be 10 MB or smaller.', [{ field: 'file', message: 'Too large.' }])
    const att = {
      id: nextId('attachment'),
      fileName,
      contentType: contentType || 'application/octet-stream',
      sizeBytes: Number(sizeBytes) || 0,
      uploadedAt: new Date().toISOString(),
      url: '#',
    }
    row.attachments.push(att)
    row.history.push(entry(user, 'Attachment added', fileName))
    row.updatedAt = att.uploadedAt
    persist()
    return att
  },
  { permission: 'INCIDENT_MANAGE' },
)
