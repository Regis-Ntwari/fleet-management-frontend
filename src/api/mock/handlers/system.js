import { get, put, post, patch } from '../router'
import { getDb, persist, resetDb } from '../db'
import { badRequest, matchesText, paginate, inDateRange } from '../core'
import { computeAlerts, recordAudit, diff } from '../mappers'
// ---------- Settings ----------
get('/settings', () => getDb().settings, { permission: 'DASHBOARD_VIEW' })
put(
  '/settings',
  ({ body, user }) => {
    const d = getDb()
    const input = body
    const errors = []
    const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/
    if (input.nightDrivingStart && !timeRe.test(input.nightDrivingStart)) errors.push({ field: 'nightDrivingStart', message: 'Use HH:mm.' })
    if (input.nightDrivingEnd && !timeRe.test(input.nightDrivingEnd)) errors.push({ field: 'nightDrivingEnd', message: 'Use HH:mm.' })
    for (const k of [
      'excessiveDailyDrivingHours',
      'highDailyDistanceKm',
      'fuelVarianceTolerancePercent',
      'maintenanceDueSoonKm',
      'maintenanceDueSoonDays',
      'gpsOfflineThresholdMinutes',
      'idleVehicleDays',
    ]) {
      if (input[k] !== undefined && (!Number.isFinite(input[k]) || input[k] <= 0))
        errors.push({ field: k, message: 'Must be a positive number.' })
    }
    if (
      input.documentExpiryWarningDays &&
      (!Array.isArray(input.documentExpiryWarningDays) || input.documentExpiryWarningDays.some((n) => !Number.isInteger(n) || n <= 0))
    )
      errors.push({ field: 'documentExpiryWarningDays', message: 'Provide positive whole numbers.' })
    if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
    const before = { ...d.settings }
    d.settings = { ...d.settings, ...input }
    if (input.documentExpiryWarningDays) d.settings.documentExpiryWarningDays = [...input.documentExpiryWarningDays].sort((a, b) => b - a)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'SETTINGS',
      entityId: null,
      entityLabel: 'System settings',
      changes: diff(before, d.settings),
    })
    persist()
    return d.settings
  },
  { permission: 'SETTINGS_MANAGE' },
)
post(
  '/system/reset-demo-data',
  () => {
    resetDb()
    return null
  },
  { permission: 'SETTINGS_MANAGE' },
)
// ---------- Alerts ----------
get(
  '/alerts',
  ({ query }) => {
    let list = computeAlerts()
    if (query.severity) list = list.filter((a) => a.severity === query.severity)
    if (query.entityType) list = list.filter((a) => a.entityType === query.entityType)
    if (query.acknowledged === 'false') list = list.filter((a) => !a.acknowledgedAt)
    if (query.acknowledged === 'true') list = list.filter((a) => a.acknowledgedAt)
    if (query.q) list = list.filter((a) => matchesText([a.title, a.message, a.entityLabel], query.q))
    return paginate(list, query)
  },
  { permission: 'DASHBOARD_VIEW' },
)
get(
  '/alerts/summary',
  () => {
    const list = computeAlerts().filter((a) => !a.acknowledgedAt)
    return {
      critical: list.filter((a) => a.severity === 'CRITICAL').length,
      warning: list.filter((a) => a.severity === 'WARNING').length,
      info: list.filter((a) => a.severity === 'INFO').length,
      total: list.length,
    }
  },
  { permission: 'DASHBOARD_VIEW' },
)
post(
  '/alerts/:id/acknowledge',
  ({ params, user }) => {
    const alert = computeAlerts().find((a) => a.id === Number(params.id))
    if (!alert) throw badRequest('This alert no longer exists.')
    getDb().alertAcks[alert.ackKey] = { at: new Date().toISOString(), byId: user.id }
    persist()
    return computeAlerts().find((a) => a.id === alert.id)
  },
  { permission: 'DASHBOARD_VIEW' },
)
// ---------- Notifications ----------
get('/notifications', ({ query, user }) => {
  const list = getDb()
    .notifications.filter((n) => n.userId === user.id)
    .filter((n) => query.unread !== 'true' || !n.readAt)
    .map(({ userId: _u, ...n }) => n)
  return { ...paginate(list, query, 'createdAt,desc'), unreadCount: list.filter((n) => !n.readAt).length }
})
patch('/notifications/:id/read', ({ params, user }) => {
  const n = getDb().notifications.find((x) => x.id === Number(params.id) && x.userId === user.id)
  if (!n) throw badRequest('Notification not found.')
  n.readAt = n.readAt ?? new Date().toISOString()
  persist()
  const { userId: _u, ...dto } = n
  return dto
})
post('/notifications/read-all', ({ user }) => {
  const now = new Date().toISOString()
  getDb()
    .notifications.filter((n) => n.userId === user.id && !n.readAt)
    .forEach((n) => (n.readAt = now))
  persist()
  return null
})
// ---------- Audit ----------
get(
  '/audit-logs',
  ({ query }) => {
    const list = getDb()
      .audit.filter((a) => matchesText([a.userName, a.entityLabel, a.entityType, a.action], query.q))
      .filter((a) => !query.action || a.action === query.action)
      .filter((a) => !query.entityType || a.entityType === query.entityType)
      .filter((a) => !query.userId || a.userId === Number(query.userId))
      .filter((a) => inDateRange(a.at, query.from, query.to))
    return paginate(list, query, 'at,desc')
  },
  { permission: 'AUDIT_VIEW' },
)
// ---------- Global search ----------
get('/search', ({ query }) => {
  const q = (query.q ?? '').trim().toLowerCase()
  if (q.length < 2) return []
  const d = getDb()
  const hits = []
  const has = (...parts) => parts.some((p) => p && p.toLowerCase().includes(q))
  for (const v of d.vehicles)
    if (has(v.plateNumber, v.fleetNumber, v.make, v.model))
      hits.push({
        type: 'VEHICLE',
        id: v.id,
        title: v.plateNumber,
        subtitle: `${v.make} ${v.model} · ${v.fleetNumber}`,
        link: `/vehicles/${v.id}`,
      })
  for (const x of d.drivers)
    if (has(x.fullName, x.employeeNumber, x.phone, x.licenseNumber))
      hits.push({ type: 'DRIVER', id: x.id, title: x.fullName, subtitle: `${x.employeeNumber} · ${x.phone}`, link: `/drivers/${x.id}` })
  for (const t of d.trips)
    if (has(t.tripNumber, t.customerName, t.destination))
      hits.push({ type: 'TRIP', id: t.id, title: t.tripNumber, subtitle: `${t.startLocation} → ${t.destination}`, link: `/trips/${t.id}` })
  for (const b of d.bookings)
    if (has(b.bookingNumber, b.customerName, b.company))
      hits.push({
        type: 'BOOKING',
        id: b.id,
        title: b.bookingNumber,
        subtitle: `${b.company ?? b.customerName} · ${b.pickupLocation}`,
        link: `/bookings/${b.id}`,
      })
  for (const m of d.maintenance)
    if (has(m.maintenanceNumber, m.complaint))
      hits.push({ type: 'MAINTENANCE', id: m.id, title: m.maintenanceNumber, subtitle: m.complaint, link: `/maintenance/${m.id}` })
  for (const i of d.incidents)
    if (has(i.incidentNumber, i.description, i.location))
      hits.push({ type: 'INCIDENT', id: i.id, title: i.incidentNumber, subtitle: i.description, link: `/incidents/${i.id}` })
  const seenCustomers = new Set()
  for (const b of d.bookings) {
    const c = b.company ?? b.customerName
    if (!seenCustomers.has(c) && has(c)) {
      seenCustomers.add(c)
      hits.push({
        type: 'CUSTOMER',
        id: b.id,
        title: c,
        subtitle: 'Customer · view bookings',
        link: `/bookings?q=${encodeURIComponent(c)}`,
      })
    }
  }
  return hits.slice(0, 25)
})
