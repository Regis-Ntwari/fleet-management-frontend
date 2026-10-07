import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, matchesText, notFound, paginate } from '../core'
import { diff, recordAudit, toDocument } from '../mappers'
import { REFERENCE } from './reference'

const auditD = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'DOCUMENT',
    entityId: row.id,
    entityLabel: `${row.type} ${row.number}`,
    changes,
  })

const findDocument = (id) => {
  const x = getDb().documents.find((d) => d.id === Number(id))
  if (!x) throw notFound('Document')
  return x
}

function validate(input, existingId = null) {
  const errors = []
  const d = getDb()
  if (!['VEHICLE', 'DRIVER'].includes(input.ownerType)) errors.push({ field: 'ownerType', message: 'Choose vehicle or driver.' })
  const ownerExists =
    input.ownerType === 'VEHICLE'
      ? d.vehicles.some((v) => v.id === Number(input.ownerId) && !v.archived)
      : d.drivers.some((x) => x.id === Number(input.ownerId) && !x.archived)
  if (!ownerExists) errors.push({ field: 'ownerId', message: `Choose a ${String(input.ownerType ?? 'vehicle').toLowerCase()}.` })
  if (!REFERENCE.documentTypes.some((t) => t.value === input.type)) errors.push({ field: 'type', message: 'Choose a document type.' })
  if (!input.number?.trim()) errors.push({ field: 'number', message: 'Document number is required.' })
  if (!input.issueDate) errors.push({ field: 'issueDate', message: 'Issue date is required.' })
  if (!input.expiryDate) errors.push({ field: 'expiryDate', message: 'Expiry date is required.' })
  else if (input.issueDate && input.expiryDate <= input.issueDate)
    errors.push({ field: 'expiryDate', message: 'Expiry must be after the issue date.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  const dup = d.documents.find(
    (x) =>
      x.id !== existingId &&
      x.ownerType === input.ownerType &&
      x.ownerId === Number(input.ownerId) &&
      x.type === input.type &&
      x.expiryDate === input.expiryDate,
  )
  if (dup) throw conflict('An identical document (same type and expiry) already exists for this owner.')
}

get(
  '/documents',
  ({ query }) => {
    const list = getDb()
      .documents.map(toDocument)
      .filter((x) => matchesText([x.ownerLabel, x.number, x.type], query.q))
      .filter((x) => !query.status || query.status.split(',').includes(x.status))
      .filter((x) => !query.type || x.type === query.type)
      .filter((x) => !query.ownerType || x.ownerType === query.ownerType)
      .filter((x) => !query.ownerId || x.ownerId === Number(query.ownerId))
      .filter((x) => !query.expiringWithinDays || x.daysToExpiry <= Number(query.expiringWithinDays))
    return paginate(list, query, 'expiryDate,asc')
  },
  { permission: 'DOCUMENT_READ' },
)

get(
  '/documents/summary',
  () => {
    const list = getDb().documents.map(toDocument)
    const warn = getDb().settings.documentExpiryWarningDays
    return {
      total: list.length,
      expired: list.filter((x) => x.status === 'EXPIRED').length,
      expiringSoon: list.filter((x) => x.status === 'EXPIRING_SOON').length,
      valid: list.filter((x) => x.status === 'VALID').length,
      windows: warn.map((days) => ({ days, count: list.filter((x) => x.daysToExpiry >= 0 && x.daysToExpiry <= days).length })),
      byType: REFERENCE.documentTypes
        .map((t) => ({
          type: t.value,
          label: t.label,
          expired: list.filter((x) => x.type === t.value && x.status === 'EXPIRED').length,
          expiringSoon: list.filter((x) => x.type === t.value && x.status === 'EXPIRING_SOON').length,
          total: list.filter((x) => x.type === t.value).length,
        }))
        .filter((x) => x.total > 0),
    }
  },
  { permission: 'DOCUMENT_READ' },
)

get('/documents/:id', ({ params }) => toDocument(findDocument(params.id)), { permission: 'DOCUMENT_READ' })

post(
  '/documents',
  ({ body, user }) => {
    validate(body)
    const now = new Date().toISOString()
    const row = {
      id: nextId('document'),
      ownerType: body.ownerType,
      ownerId: Number(body.ownerId),
      type: body.type,
      number: body.number.trim().toUpperCase(),
      issueDate: body.issueDate,
      expiryDate: body.expiryDate,
      attachment: body.attachment?.fileName
        ? {
            id: nextId('attachment'),
            fileName: body.attachment.fileName,
            contentType: body.attachment.contentType || 'application/octet-stream',
            sizeBytes: Number(body.attachment.sizeBytes) || 0,
            uploadedAt: now,
            url: '#',
          }
        : null,
      notes: body.notes?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }
    const d = getDb()
    d.documents.push(row)
    if (row.ownerType === 'VEHICLE' && row.type === 'INSURANCE') {
      const v = d.vehicles.find((x) => x.id === row.ownerId)
      if (v && (!v.insuranceExpiry || row.expiryDate > v.insuranceExpiry)) {
        v.insuranceExpiry = row.expiryDate
        v.insurancePolicyNumber = row.number
        v.updatedAt = now
      }
    }
    if (row.ownerType === 'DRIVER' && row.type === 'DRIVER_LICENCE') {
      const dr = d.drivers.find((x) => x.id === row.ownerId)
      if (dr && row.expiryDate > dr.licenseExpiry) {
        dr.licenseExpiry = row.expiryDate
        dr.licenseNumber = row.number
        dr.licenseIssueDate = row.issueDate
        dr.updatedAt = now
      }
    }
    auditD(user, 'CREATE', row)
    persist()
    return toDocument(row)
  },
  { permission: 'DOCUMENT_MANAGE' },
)

put(
  '/documents/:id',
  ({ params, body, user }) => {
    const row = findDocument(params.id)
    validate({ ...body, ownerType: row.ownerType, ownerId: row.ownerId }, row.id)
    const before = { ...row }
    Object.assign(row, {
      type: body.type,
      number: body.number.trim().toUpperCase(),
      issueDate: body.issueDate,
      expiryDate: body.expiryDate,
      notes: body.notes?.trim() || null,
      updatedAt: new Date().toISOString(),
    })
    if (body.attachment?.fileName)
      row.attachment = {
        id: nextId('attachment'),
        fileName: body.attachment.fileName,
        contentType: body.attachment.contentType || 'application/octet-stream',
        sizeBytes: Number(body.attachment.sizeBytes) || 0,
        uploadedAt: row.updatedAt,
        url: '#',
      }
    auditD(user, 'UPDATE', row, diff(before, row))
    persist()
    return toDocument(row)
  },
  { permission: 'DOCUMENT_MANAGE' },
)

del(
  '/documents/:id',
  ({ params, user }) => {
    const row = findDocument(params.id)
    if (row.ownerType === 'DRIVER' && row.type === 'DRIVER_LICENCE')
      throw businessRule('A driver licence record is maintained from the driver profile and cannot be deleted here.')
    const d = getDb()
    d.documents = d.documents.filter((x) => x.id !== row.id)
    auditD(user, 'DELETE', row)
    persist()
    return null
  },
  { permission: 'DOCUMENT_MANAGE' },
)
