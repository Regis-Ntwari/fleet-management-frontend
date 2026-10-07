import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, conflict, notFound, requireFields } from '../core'
import { recordAudit, toCategory } from '../mappers'
const s = (value, label, tone) => ({ value, label, tone })
export const REFERENCE = {
  vehicleStatuses: [
    s('AVAILABLE', 'Available', 'success'),
    s('ASSIGNED', 'Assigned', 'info'),
    s('ON_TRIP', 'On trip', 'accent'),
    s('RESERVED', 'Reserved', 'info'),
    s('IN_MAINTENANCE', 'In maintenance', 'warning'),
    s('OUT_OF_SERVICE', 'Out of service', 'danger'),
    s('INACTIVE', 'Inactive', 'neutral'),
  ],
  driverStatuses: [
    s('AVAILABLE', 'Available', 'success'),
    s('ASSIGNED', 'Assigned', 'info'),
    s('ON_TRIP', 'On trip', 'accent'),
    s('OFF_DUTY', 'Off duty', 'neutral'),
    s('ON_LEAVE', 'On leave', 'warning'),
    s('SUSPENDED', 'Suspended', 'danger'),
    s('INACTIVE', 'Inactive', 'neutral'),
  ],
  tripStatuses: [
    s('PLANNED', 'Planned', 'neutral'),
    s('DISPATCHED', 'Dispatched', 'info'),
    s('IN_PROGRESS', 'In progress', 'accent'),
    s('COMPLETED', 'Completed', 'success'),
    s('CANCELLED', 'Cancelled', 'danger'),
  ],
  bookingStatuses: [
    s('REQUESTED', 'Requested', 'warning'),
    s('CONFIRMED', 'Confirmed', 'info'),
    s('ASSIGNED', 'Assigned', 'info'),
    s('IN_PROGRESS', 'In progress', 'accent'),
    s('COMPLETED', 'Completed', 'success'),
    s('CANCELLED', 'Cancelled', 'danger'),
  ],
  maintenanceStatuses: [
    s('REPORTED', 'Reported', 'neutral'),
    s('INSPECTION', 'Inspection', 'info'),
    s('APPROVED', 'Approved', 'info'),
    s('IN_PROGRESS', 'In progress', 'accent'),
    s('WAITING_FOR_PARTS', 'Waiting for parts', 'warning'),
    s('COMPLETED', 'Completed', 'success'),
    s('CANCELLED', 'Cancelled', 'danger'),
  ],
  maintenanceTypes: [
    s('PREVENTIVE', 'Preventive', 'success'),
    s('CORRECTIVE', 'Corrective', 'warning'),
    s('INSPECTION', 'Inspection', 'info'),
    s('TYRES', 'Tyres', 'neutral'),
    s('BODYWORK', 'Bodywork', 'neutral'),
    s('ELECTRICAL', 'Electrical', 'neutral'),
  ],
  incidentStatuses: [
    s('OPEN', 'Open', 'danger'),
    s('UNDER_INVESTIGATION', 'Under investigation', 'warning'),
    s('RESOLVED', 'Resolved', 'info'),
    s('CLOSED', 'Closed', 'neutral'),
  ],
  incidentTypes: [
    s('ACCIDENT', 'Accident', 'danger'),
    s('BREAKDOWN', 'Breakdown', 'warning'),
    s('TRAFFIC_VIOLATION', 'Traffic violation', 'warning'),
    s('THEFT', 'Theft', 'danger'),
    s('FUEL_ANOMALY', 'Fuel anomaly', 'warning'),
    s('DAMAGE', 'Damage', 'warning'),
    s('CUSTOMER_COMPLAINT', 'Customer complaint', 'info'),
  ],
  incidentSeverities: [
    s('LOW', 'Low', 'neutral'),
    s('MEDIUM', 'Medium', 'info'),
    s('HIGH', 'High', 'warning'),
    s('CRITICAL', 'Critical', 'danger'),
  ],
  documentStatuses: [s('VALID', 'Valid', 'success'), s('EXPIRING_SOON', 'Expiring soon', 'warning'), s('EXPIRED', 'Expired', 'danger')],
  documentTypes: [
    s('INSURANCE', 'Insurance', 'neutral'),
    s('INSPECTION', 'Technical inspection', 'neutral'),
    s('ROAD_LICENCE', 'Road licence', 'neutral'),
    s('REGISTRATION', 'Registration (carte jaune)', 'neutral'),
    s('DRIVER_LICENCE', 'Driving licence', 'neutral'),
    s('PERMIT', 'Operating permit', 'neutral'),
    s('OTHER', 'Other', 'neutral'),
  ],
  gpsStatuses: [
    s('ONLINE', 'Online', 'success'),
    s('OFFLINE', 'Offline', 'danger'),
    s('NO_SIGNAL', 'No signal', 'warning'),
    s('DISCONNECTED', 'Disconnected', 'neutral'),
    s('UNKNOWN', 'Unknown', 'neutral'),
  ],
  assignmentStatuses: [s('ACTIVE', 'Active', 'success'), s('ENDED', 'Ended', 'neutral'), s('CANCELLED', 'Cancelled', 'danger')],
  fuelTypes: [
    s('DIESEL', 'Diesel', 'neutral'),
    s('PETROL', 'Petrol', 'neutral'),
    s('HYBRID', 'Hybrid', 'neutral'),
    s('ELECTRIC', 'Electric', 'neutral'),
  ],
  transmissions: [s('AUTOMATIC', 'Automatic', 'neutral'), s('MANUAL', 'Manual', 'neutral')],
  roles: [
    s('SUPER_ADMIN', 'Super admin', 'danger'),
    s('IT_ADMIN', 'IT admin', 'info'),
    s('MANAGEMENT', 'Management', 'accent'),
    s('FLEET_MANAGER', 'Fleet manager', 'success'),
    s('FLEET_OFFICER', 'Fleet officer', 'success'),
    s('DISPATCHER', 'Dispatcher', 'info'),
    s('WORKSHOP_MANAGER', 'Workshop manager', 'warning'),
    s('TECHNICIAN', 'Technician', 'warning'),
    s('DRIVER', 'Driver', 'neutral'),
    s('FINANCE', 'Finance', 'info'),
    s('VIEWER', 'Viewer', 'neutral'),
  ],
  serviceTypes: [
    s('Airport transfer', 'Airport transfer', 'neutral'),
    s('Hourly hire', 'Hourly hire', 'neutral'),
    s('Daily hire', 'Daily hire', 'neutral'),
    s('Safari tour', 'Safari tour', 'neutral'),
    s('Conference shuttle', 'Conference shuttle', 'neutral'),
    s('Executive protocol', 'Executive protocol', 'neutral'),
    s('Cargo haulage', 'Cargo haulage', 'neutral'),
    s('Fuel delivery', 'Fuel delivery', 'neutral'),
  ],
}
get('/reference', () => ({ ...REFERENCE, vehicleCategories: getDb().categories.map(toCategory) }))
get('/vehicle-categories', () => getDb().categories.map(toCategory), { permission: 'VEHICLE_READ' })
post(
  '/vehicle-categories',
  ({ body, user }) => {
    const input = body
    requireFields(input, ['name', 'code'])
    const d = getDb()
    if (d.categories.some((c) => c.code.toLowerCase() === input.code.toLowerCase()))
      throw conflict(`A category with code "${input.code}" already exists.`)
    const now = new Date().toISOString()
    const row = {
      id: nextId('category'),
      name: input.name.trim(),
      code: input.code.trim().toUpperCase(),
      description: input.description ?? null,
      seatingCapacity: input.seatingCapacity ?? null,
      active: true,
      createdAt: now,
      updatedAt: now,
    }
    d.categories.push(row)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'CREATE',
      entityType: 'VEHICLE_CATEGORY',
      entityId: row.id,
      entityLabel: row.name,
      changes: null,
    })
    persist()
    return toCategory(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)
put(
  '/vehicle-categories/:id',
  ({ params, body }) => {
    const d = getDb()
    const row = d.categories.find((c) => c.id === Number(params.id))
    if (!row) throw notFound('Vehicle category')
    const input = body
    if (input.code && d.categories.some((c) => c.id !== row.id && c.code.toLowerCase() === input.code.toLowerCase()))
      throw conflict(`A category with code "${input.code}" already exists.`)
    Object.assign(row, { ...input, updatedAt: new Date().toISOString() })
    persist()
    return toCategory(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)
del(
  '/vehicle-categories/:id',
  ({ params }) => {
    const d = getDb()
    const row = d.categories.find((c) => c.id === Number(params.id))
    if (!row) throw notFound('Vehicle category')
    if (d.vehicles.some((v) => v.categoryId === row.id))
      throw badRequest('This category is in use by vehicles. Deactivate it instead of deleting.')
    d.categories = d.categories.filter((c) => c.id !== row.id)
    persist()
    return null
  },
  { permission: 'SETTINGS_MANAGE' },
)
