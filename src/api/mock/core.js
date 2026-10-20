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
// Permissions are the only static part of access control. Roles are rows in the
// database (see handlers/roles.js) that bundle permissions, and users point at a role.
const P = (code, label, group, description) => ({ code, label, group, description })
export const PERMISSIONS = [
  P('DASHBOARD_VIEW', 'View dashboard', 'Overview', 'Dashboard, alert centre and daily position.'),
  P('DISPATCH_VIEW', 'View dispatch board', 'Overview', 'Live dispatch board and vehicle positions.'),
  P('VEHICLE_READ', 'View vehicles', 'Fleet', 'Vehicle list, profiles and telematics.'),
  P('VEHICLE_CREATE', 'Add vehicles', 'Fleet', 'Register new vehicles and import vehicle files.'),
  P('VEHICLE_UPDATE', 'Edit vehicles', 'Fleet', 'Change vehicle details and status.'),
  P('VEHICLE_DELETE', 'Archive vehicles', 'Fleet', 'Archive vehicles from the active fleet.'),
  P('DRIVER_READ', 'View drivers', 'Fleet', 'Driver list and profiles.'),
  P('DRIVER_MANAGE', 'Manage drivers', 'Fleet', 'Add, edit, suspend and archive drivers.'),
  P('ASSIGNMENT_MANAGE', 'Manage assignments', 'Fleet', 'Assign and release drivers on vehicles.'),
  P('DOCUMENT_READ', 'View documents', 'Fleet', 'Vehicle and driver documents.'),
  P('DOCUMENT_MANAGE', 'Manage documents', 'Fleet', 'Upload, renew and remove documents.'),
  P('TRIP_READ', 'View trips', 'Operations', 'Trip list and trip detail.'),
  P('TRIP_MANAGE', 'Manage trips', 'Operations', 'Plan, dispatch, complete and cancel trips.'),
  P('BOOKING_READ', 'View bookings', 'Operations', 'Customer booking list.'),
  P('BOOKING_MANAGE', 'Manage bookings', 'Operations', 'Create, confirm and cancel bookings.'),
  P('FUEL_READ', 'View fuel', 'Operations', 'Fuel transactions and consumption.'),
  P('FUEL_MANAGE', 'Record fuel', 'Operations', 'Record, edit and import fuel transactions.'),
  P('INCIDENT_READ', 'View incidents', 'Operations', 'Incident list, detail and history.'),
  P('INCIDENT_MANAGE', 'Manage incidents', 'Operations', 'Report incidents, investigate, resolve and reassign departments.'),
  P('MAINTENANCE_READ', 'View maintenance', 'Workshop', 'Work orders, schedules and parts.'),
  P('MAINTENANCE_MANAGE', 'Manage maintenance', 'Workshop', 'Open, progress and complete work orders.'),
  P('PARTS_MANAGE', 'Manage spare parts', 'Workshop', 'Maintain the parts catalogue and stock levels.'),
  P('REPORT_VIEW', 'View reports', 'Insight', 'Run and view reports.'),
  P('REPORT_EXPORT', 'Export reports', 'Insight', 'Download reports as PDF or CSV.'),
  P('USER_MANAGE', 'Manage users', 'Administration', 'Create accounts, assign roles and departments, reset passwords.'),
  P('ROLE_MANAGE', 'Manage roles', 'Administration', 'Create roles and decide which permissions they carry.'),
  P('DEPARTMENT_MANAGE', 'Manage departments', 'Administration', 'Create and edit departments.'),
  P('AUDIT_VIEW', 'View audit log', 'Administration', 'Who changed what and when.'),
  P('SETTINGS_MANAGE', 'Manage settings', 'Administration', 'Thresholds, categories and demo data.'),
  // Driver self-service: scoped to the driver profile linked to the account, never to the whole fleet.
  P('TRIP_START', 'Start own trips', 'Driver', 'Start and complete trips where you are the driver.'),
  P('FUEL_SUBMIT', 'Fill up as allocated', 'Driver', 'See your fuel allocations, fill up at the station and submit the receipt.'),
  P('MAINTENANCE_REPORT', 'Report vehicle problems', 'Driver', 'Report your vehicle for maintenance.'),
]
/** Permissions that open the driver workspace ("My day"). */
export const DRIVER_PERMISSIONS = ['TRIP_START', 'FUEL_SUBMIT', 'MAINTENANCE_REPORT']
export const PERMISSION_CODES = PERMISSIONS.map((p) => p.code)
export const PERMISSION_GROUPS = [...new Set(PERMISSIONS.map((p) => p.group))]
const ALL = PERMISSION_CODES
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
const R = (code, name, tone, description, permissions, system = false) => ({ code, name, tone, description, permissions, system })
/** Seed roles. Only SUPER_ADMIN is a system role: it always holds every permission and cannot be deleted. */
export const DEFAULT_ROLES = [
  R('SUPER_ADMIN', 'Super admin', 'danger', 'Unrestricted access to every module and setting.', ALL, true),
  R('IT_ADMIN', 'IT admin', 'info', 'Runs accounts, roles, departments and system settings.', [
    ...READ_ALL,
    'USER_MANAGE',
    'ROLE_MANAGE',
    'DEPARTMENT_MANAGE',
    'AUDIT_VIEW',
    'SETTINGS_MANAGE',
  ]),
  R('MANAGEMENT', 'Management', 'accent', 'Read-only oversight with report exports and the audit trail.', [
    ...READ_ALL,
    'REPORT_EXPORT',
    'AUDIT_VIEW',
  ]),
  R('FLEET_MANAGER', 'Fleet manager', 'success', 'Owns the fleet: vehicles, drivers, operations and the workshop.', [
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
  ]),
  R('FLEET_OFFICER', 'Fleet officer', 'success', 'Day-to-day fleet administration.', [
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
  ]),
  R('DISPATCHER', 'Dispatcher', 'info', 'Assigns drivers, runs trips and bookings, logs incidents.', [
    ...READ_ALL,
    'ASSIGNMENT_MANAGE',
    'TRIP_MANAGE',
    'BOOKING_MANAGE',
    'INCIDENT_MANAGE',
  ]),
  R('WORKSHOP_MANAGER', 'Workshop manager', 'warning', 'Runs maintenance, parts and workshop reporting.', [
    ...READ_ALL,
    'MAINTENANCE_MANAGE',
    'PARTS_MANAGE',
    'REPORT_EXPORT',
  ]),
  R('TECHNICIAN', 'Technician', 'warning', 'Works maintenance orders in the workshop.', [
    'DASHBOARD_VIEW',
    'VEHICLE_READ',
    'MAINTENANCE_READ',
    'MAINTENANCE_MANAGE',
  ]),
  R('DRIVER', 'Driver', 'neutral', 'Starts own trips, fills up as allocated and reports vehicle problems.', DRIVER_PERMISSIONS),
  R('FINANCE', 'Finance', 'info', 'Fuel, maintenance costs and financial reports.', [
    'DASHBOARD_VIEW',
    'VEHICLE_READ',
    'FUEL_READ',
    'FUEL_MANAGE',
    'MAINTENANCE_READ',
    'REPORT_VIEW',
    'REPORT_EXPORT',
  ]),
  R('VIEWER', 'Viewer', 'neutral', 'Read-only access across the system.', READ_ALL),
]
/** Departments every seed account and incident is attached to. */
export const DEFAULT_DEPARTMENTS = [
  { code: 'MGMT', name: 'Management', description: 'Executive office and general management.' },
  { code: 'IT', name: 'IT', description: 'Systems, accounts and support.' },
  { code: 'OPS', name: 'Fleet Operations', description: 'Dispatch, drivers and vehicle administration.' },
  { code: 'WORKSHOP', name: 'Workshop', description: 'Maintenance, inspections and spare parts.' },
  { code: 'FINANCE', name: 'Finance', description: 'Fuel spend, costs and reporting.' },
  { code: 'VIP', name: 'VIP Transfers', description: 'Executive and VIP transfer services.' },
  { code: 'CORP', name: 'Corporate', description: 'Corporate contracts and shuttles.' },
  { code: 'TOURS', name: 'Tours & Safari', description: 'Tour and safari operations.' },
  { code: 'LOGISTICS', name: 'Logistics', description: 'Cargo and delivery operations.' },
]
/** Turns a human name into a stable upper-snake code, e.g. "Fleet officer" → FLEET_OFFICER. */
export const toCode = (name) =>
  String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
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
