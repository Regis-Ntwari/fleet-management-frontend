import { get, post, put, patch, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, matchesText, notFound, paginate } from '../core'
import {
  currentAssignmentOfDriver,
  diff,
  recordAudit,
  toAssignment,
  toDocument,
  toDriver,
  toDriverSummary,
  toIncident,
  toTrip,
} from '../mappers'
import { REFERENCE } from './reference'

const audit = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'DRIVER',
    entityId: row.id,
    entityLabel: row.fullName,
    changes,
  })

export const findDriver = (id) => {
  const d = getDb().drivers.find((x) => x.id === Number(id) && !x.archived)
  if (!d) throw notFound('Driver')
  return d
}

function validateDriver(input, existingId = null) {
  const errors = []
  const d = getDb()
  if (!input.fullName?.trim()) errors.push({ field: 'fullName', message: 'Full name is required.' })
  if (!input.employeeNumber?.trim()) errors.push({ field: 'employeeNumber', message: 'Employee number is required.' })
  else if (d.drivers.some((x) => x.id !== existingId && x.employeeNumber.toLowerCase() === input.employeeNumber.trim().toLowerCase()))
    errors.push({ field: 'employeeNumber', message: 'This employee number is already in use.' })
  if (!/^\+?[0-9 ]{9,15}$/.test(input.phone ?? '')) errors.push({ field: 'phone', message: 'Enter a valid phone number.' })
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email))
    errors.push({ field: 'email', message: 'Enter a valid email address.' })
  if (!/^\d{16}$/.test(input.nationalId ?? '')) errors.push({ field: 'nationalId', message: 'National ID must have 16 digits.' })
  if (!input.licenseNumber?.trim()) errors.push({ field: 'licenseNumber', message: 'Licence number is required.' })
  else if (d.drivers.some((x) => x.id !== existingId && x.licenseNumber.toLowerCase() === input.licenseNumber.trim().toLowerCase()))
    throw conflict(`Licence number ${input.licenseNumber} is already registered to another driver.`)
  if (!input.licenseCategory?.trim()) errors.push({ field: 'licenseCategory', message: 'Licence category is required.' })
  if (!input.licenseIssueDate) errors.push({ field: 'licenseIssueDate', message: 'Issue date is required.' })
  if (!input.licenseExpiry) errors.push({ field: 'licenseExpiry', message: 'Expiry date is required.' })
  else if (input.licenseIssueDate && input.licenseExpiry <= input.licenseIssueDate)
    errors.push({ field: 'licenseExpiry', message: 'Expiry must be after the issue date.' })
  if (!['FULL_TIME', 'CONTRACT', 'CASUAL'].includes(input.employmentStatus))
    errors.push({ field: 'employmentStatus', message: 'Choose an employment status.' })
  if (!input.joiningDate) errors.push({ field: 'joiningDate', message: 'Joining date is required.' })
  if (!REFERENCE.driverStatuses.some((s) => s.value === input.status)) errors.push({ field: 'status', message: 'Choose a status.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
}

const normalise = (input) => ({
  employeeNumber: input.employeeNumber.trim().toUpperCase(),
  fullName: input.fullName.trim(),
  phone: input.phone.replace(/\s/g, ''),
  email: input.email?.trim().toLowerCase() || null,
  nationalId: input.nationalId.trim(),
  licenseNumber: input.licenseNumber.trim().toUpperCase(),
  licenseCategory: input.licenseCategory.trim().toUpperCase(),
  licenseIssueDate: input.licenseIssueDate,
  licenseExpiry: input.licenseExpiry,
  employmentStatus: input.employmentStatus,
  joiningDate: input.joiningDate,
  status: input.status,
  emergencyContactName: input.emergencyContactName?.trim() || null,
  emergencyContactPhone: input.emergencyContactPhone?.trim() || null,
  notes: input.notes?.trim() || null,
})

get(
  '/drivers',
  ({ query }) => {
    const list = getDb()
      .drivers.filter((d) => !d.archived)
      .filter((d) => matchesText([d.fullName, d.employeeNumber, d.phone, d.licenseNumber, d.email], query.q))
      .filter((d) => !query.status || query.status.split(',').includes(d.status))
      .filter((d) => !query.employmentStatus || d.employmentStatus === query.employmentStatus)
      .map(toDriverSummary)
      .filter((d) => query.licenseValid !== 'false' || d.licenseExpiry < new Date().toISOString().slice(0, 10))
    return paginate(list, query, 'fullName,asc')
  },
  { permission: 'DRIVER_READ' },
)

get(
  '/drivers/options',
  ({ query }) => {
    return getDb()
      .drivers.filter((d) => !d.archived && !['INACTIVE', 'SUSPENDED'].includes(d.status))
      .filter((d) => !query.status || query.status.split(',').includes(d.status))
      .map(toDriverSummary)
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
  },
  { permission: 'DRIVER_READ' },
)

get('/drivers/:id', ({ params }) => toDriver(findDriver(params.id)), { permission: 'DRIVER_READ' })

post(
  '/drivers',
  ({ body, user }) => {
    validateDriver(body)
    const now = new Date().toISOString()
    const row = { id: nextId('driver'), ...normalise(body), rating: 0, archived: false, createdAt: now, updatedAt: now }
    const d = getDb()
    d.drivers.push(row)
    d.documents.push({
      id: nextId('document'),
      ownerType: 'DRIVER',
      ownerId: row.id,
      type: 'DRIVER_LICENCE',
      number: row.licenseNumber,
      issueDate: row.licenseIssueDate,
      expiryDate: row.licenseExpiry,
      attachment: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    })
    audit(user, 'CREATE', row)
    persist()
    return toDriver(row)
  },
  { permission: 'DRIVER_MANAGE' },
)

put(
  '/drivers/:id',
  ({ params, body, user }) => {
    const row = findDriver(params.id)
    validateDriver(body, row.id)
    const next = normalise(body)
    if (next.status !== row.status && row.status === 'ON_TRIP')
      throw businessRule('This driver is on a trip. Complete the trip before changing their status.')
    if (['INACTIVE', 'SUSPENDED', 'ON_LEAVE'].includes(next.status) && currentAssignmentOfDriver(row.id))
      throw businessRule('End the active vehicle assignment before changing this driver to an unavailable status.')
    const before = { ...row }
    Object.assign(row, next, { updatedAt: new Date().toISOString() })
    const licence = getDb().documents.find((x) => x.ownerType === 'DRIVER' && x.ownerId === row.id && x.type === 'DRIVER_LICENCE')
    if (licence)
      Object.assign(licence, {
        number: row.licenseNumber,
        issueDate: row.licenseIssueDate,
        expiryDate: row.licenseExpiry,
        updatedAt: row.updatedAt,
      })
    audit(user, 'UPDATE', row, diff(before, row))
    persist()
    return toDriver(row)
  },
  { permission: 'DRIVER_MANAGE' },
)

patch(
  '/drivers/:id/status',
  ({ params, body, user }) => {
    const row = findDriver(params.id)
    const { status } = body ?? {}
    if (!REFERENCE.driverStatuses.some((s) => s.value === status)) throw badRequest('Choose a valid status.')
    if (row.status === 'ON_TRIP') throw businessRule('This driver is on a trip. Complete the trip first.')
    if (['INACTIVE', 'SUSPENDED', 'ON_LEAVE', 'OFF_DUTY'].includes(status) && currentAssignmentOfDriver(row.id))
      throw businessRule('End the active vehicle assignment first.')
    if (status === 'AVAILABLE' && currentAssignmentOfDriver(row.id))
      throw businessRule('This driver has an active vehicle assignment and is therefore "Assigned".')
    const from = row.status
    row.status = status
    row.updatedAt = new Date().toISOString()
    audit(user, 'STATUS_CHANGE', row, [{ field: 'status', from, to: status }])
    persist()
    return toDriver(row)
  },
  { permission: 'DRIVER_MANAGE' },
)

del(
  '/drivers/:id',
  ({ params, user }) => {
    const row = findDriver(params.id)
    if (currentAssignmentOfDriver(row.id)) throw businessRule('End the active vehicle assignment before archiving this driver.')
    if (row.status === 'ON_TRIP') throw businessRule('A driver on a trip cannot be archived.')
    row.archived = true
    row.status = 'INACTIVE'
    row.updatedAt = new Date().toISOString()
    audit(user, 'DELETE', row)
    persist()
    return null
  },
  { permission: 'DRIVER_MANAGE' },
)

get(
  '/drivers/:id/assignments',
  ({ params, query }) => {
    const row = findDriver(params.id)
    return paginate(
      getDb()
        .assignments.filter((a) => a.driverId === row.id)
        .map(toAssignment),
      query,
      'startAt,desc',
    )
  },
  { permission: 'DRIVER_READ' },
)

get(
  '/drivers/:id/trips',
  ({ params, query }) => {
    const row = findDriver(params.id)
    return paginate(
      getDb()
        .trips.filter((t) => t.driverId === row.id)
        .map(toTrip),
      query,
      'scheduledStartAt,desc',
    )
  },
  { permission: 'DRIVER_READ' },
)

get(
  '/drivers/:id/incidents',
  ({ params, query }) => {
    const row = findDriver(params.id)
    return paginate(
      getDb()
        .incidents.filter((i) => i.driverId === row.id)
        .map(toIncident),
      query,
      'occurredAt,desc',
    )
  },
  { permission: 'DRIVER_READ' },
)

get(
  '/drivers/:id/documents',
  ({ params }) => {
    const row = findDriver(params.id)
    return getDb()
      .documents.filter((x) => x.ownerType === 'DRIVER' && x.ownerId === row.id)
      .map(toDocument)
  },
  { permission: 'DRIVER_READ' },
)

get(
  '/drivers/:id/performance',
  ({ params }) => {
    const row = findDriver(params.id)
    const d = getDb()
    const trips = d.trips.filter((t) => t.driverId === row.id)
    const completed = trips.filter((t) => t.status === 'COMPLETED')
    const distance = completed.reduce((s, t) => s + ((t.endOdometer ?? 0) - (t.startOdometer ?? 0)), 0)
    const fuel = completed.reduce((s, t) => s + (t.fuelUsedLitres ?? 0), 0)
    const onTime = completed.filter((t) => t.startedAt && new Date(t.startedAt) - new Date(t.scheduledStartAt) <= 10 * 60000).length
    const incidents = d.incidents.filter((i) => i.driverId === row.id)
    const last30 = {}
    for (const t of completed) {
      const k = (t.endedAt ?? t.scheduledStartAt).slice(0, 10)
      last30[k] = (last30[k] ?? 0) + ((t.endOdometer ?? 0) - (t.startOdometer ?? 0))
    }
    return {
      driverId: row.id,
      tripsCompleted: completed.length,
      tripsCancelled: trips.filter((t) => t.status === 'CANCELLED').length,
      distanceKm: distance,
      incidents: incidents.length,
      violations: incidents.filter((i) => i.type === 'TRAFFIC_VIOLATION').length,
      onTimeRate: completed.length ? Math.round((onTime / completed.length) * 100) : null,
      fuelEfficiencyKmPerL: fuel > 0 ? Math.round((distance / fuel) * 10) / 10 : null,
      rating: row.rating,
      distanceByDay: Object.entries(last30)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-30)
        .map(([date, value]) => ({ date, value })),
    }
  },
  { permission: 'DRIVER_READ' },
)
