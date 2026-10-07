export class MockHttpError extends Error {
  status
  error
  fieldErrors
  constructor(status, error, message, fieldErrors) {
    super(message)
    this.status = status
    this.error = error
    this.fieldErrors = fieldErrors
  }
  toBody(path) {
    return {
      timestamp: new Date().toISOString(),
      status: this.status,
      error: this.error,
      message: this.message,
      path,
      ...(this.fieldErrors?.length ? { fieldErrors: this.fieldErrors } : {}),
    }
  }
}
export const notFound = (what) => new MockHttpError(404, 'Not Found', `${what} was not found.`)
export const badRequest = (msg, fieldErrors) => new MockHttpError(400, 'Validation Failed', msg, fieldErrors)
export const conflict = (msg) => new MockHttpError(409, 'Conflict', msg)
export const forbidden = (msg = 'You do not have permission to perform this action.') => new MockHttpError(403, 'Forbidden', msg)
export const unauthorized = (msg = 'Authentication is required.') => new MockHttpError(401, 'Unauthorized', msg)
export const businessRule = (msg) => new MockHttpError(422, 'Business Rule Violation', msg)
// ---------- RBAC ----------
const ALL = [
  'DASHBOARD_VIEW',
  'VEHICLE_READ',
  'VEHICLE_CREATE',
  'VEHICLE_UPDATE',
  'VEHICLE_DELETE',
  'DRIVER_READ',
  'DRIVER_MANAGE',
  'ASSIGNMENT_MANAGE',
  'TRIP_READ',
  'TRIP_MANAGE',
  'BOOKING_READ',
  'BOOKING_MANAGE',
  'DISPATCH_VIEW',
  'FUEL_READ',
  'FUEL_MANAGE',
  'MAINTENANCE_READ',
  'MAINTENANCE_MANAGE',
  'INCIDENT_READ',
  'INCIDENT_MANAGE',
  'DOCUMENT_READ',
  'DOCUMENT_MANAGE',
  'REPORT_VIEW',
  'REPORT_EXPORT',
  'USER_MANAGE',
  'AUDIT_VIEW',
  'SETTINGS_MANAGE',
  'PARTS_MANAGE',
]
const READ_ALL = [
  'DASHBOARD_VIEW',
  'VEHICLE_READ',
  'DRIVER_READ',
  'TRIP_READ',
  'BOOKING_READ',
  'DISPATCH_VIEW',
  'FUEL_READ',
  'MAINTENANCE_READ',
  'INCIDENT_READ',
  'DOCUMENT_READ',
  'REPORT_VIEW',
]
export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: ALL,
  IT_ADMIN: [...READ_ALL, 'USER_MANAGE', 'AUDIT_VIEW', 'SETTINGS_MANAGE'],
  MANAGEMENT: [...READ_ALL, 'REPORT_EXPORT', 'AUDIT_VIEW'],
  FLEET_MANAGER: [
    ...READ_ALL,
    'VEHICLE_CREATE',
    'VEHICLE_UPDATE',
    'VEHICLE_DELETE',
    'DRIVER_MANAGE',
    'ASSIGNMENT_MANAGE',
    'TRIP_MANAGE',
    'BOOKING_MANAGE',
    'FUEL_MANAGE',
    'MAINTENANCE_MANAGE',
    'INCIDENT_MANAGE',
    'DOCUMENT_MANAGE',
    'REPORT_EXPORT',
    'SETTINGS_MANAGE',
    'PARTS_MANAGE',
  ],
  FLEET_OFFICER: [
    ...READ_ALL,
    'VEHICLE_CREATE',
    'VEHICLE_UPDATE',
    'DRIVER_MANAGE',
    'ASSIGNMENT_MANAGE',
    'TRIP_MANAGE',
    'FUEL_MANAGE',
    'INCIDENT_MANAGE',
    'DOCUMENT_MANAGE',
    'REPORT_EXPORT',
  ],
  DISPATCHER: [...READ_ALL, 'ASSIGNMENT_MANAGE', 'TRIP_MANAGE', 'BOOKING_MANAGE', 'INCIDENT_MANAGE'],
  WORKSHOP_MANAGER: [...READ_ALL, 'MAINTENANCE_MANAGE', 'PARTS_MANAGE', 'REPORT_EXPORT'],
  TECHNICIAN: ['DASHBOARD_VIEW', 'VEHICLE_READ', 'MAINTENANCE_READ', 'MAINTENANCE_MANAGE'],
  DRIVER: ['DASHBOARD_VIEW', 'TRIP_READ', 'VEHICLE_READ', 'INCIDENT_READ', 'INCIDENT_MANAGE'],
  FINANCE: ['DASHBOARD_VIEW', 'VEHICLE_READ', 'FUEL_READ', 'FUEL_MANAGE', 'MAINTENANCE_READ', 'REPORT_VIEW', 'REPORT_EXPORT'],
  VIEWER: READ_ALL,
}
export function num(value, fallback) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}
export function paginate(items, query, defaultSort) {
  const page = Math.max(0, num(query.page, 0))
  const size = Math.min(100, Math.max(1, num(query.size, 20)))
  const sort = query.sort ?? defaultSort
  const sorted = sort ? sortBy(items, sort) : items
  const start = page * size
  return {
    content: sorted.slice(start, start + size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.max(1, Math.ceil(items.length / size)),
  }
}
export function sortBy(items, sort) {
  const [field, dir = 'asc'] = sort.split(',')
  const sign = dir === 'desc' ? -1 : 1
  return [...items].sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    if (av == null && bv == null) return 0
    if (av == null) return 1
    if (bv == null) return -1
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * sign
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' }) * sign
  })
}
export function matchesText(haystack, needle) {
  if (!needle) return true
  const n = needle.trim().toLowerCase()
  if (!n) return true
  return haystack.some((h) => h != null && String(h).toLowerCase().includes(n))
}
export function inDateRange(value, from, to) {
  if (!value) return !from && !to
  const d = value.slice(0, 10)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}
export function requireFields(body, fields) {
  const errors = fields
    .filter((f) => body[f] === undefined || body[f] === null || body[f] === '')
    .map((f) => ({ field: f, message: 'This field is required.' }))
  if (errors.length) throw badRequest('Some required fields are missing.', errors)
}
