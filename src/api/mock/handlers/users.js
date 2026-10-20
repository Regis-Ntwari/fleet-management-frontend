import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, matchesText, notFound, paginate } from '../core'
import { diff, recordAudit, roleById, toUser } from '../mappers'

const auditU = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'USER',
    entityId: row.id,
    entityLabel: row.email,
    changes,
  })

const isSuperAdmin = (row) => roleById(row.roleId)?.code === 'SUPER_ADMIN'

/** Shared validation for create and update. Role and department are mandatory links, never free text. */
function validate(input, { existing } = {}) {
  const errors = []
  const d = getDb()
  if (!input.firstName?.trim()) errors.push({ field: 'firstName', message: 'First name is required.' })
  if (!input.lastName?.trim()) errors.push({ field: 'lastName', message: 'Last name is required.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? '')) errors.push({ field: 'email', message: 'Enter a valid email address.' })
  else if (d.users.some((u) => u.id !== existing?.id && u.email.toLowerCase() === input.email.trim().toLowerCase()))
    throw conflict(`A user with email ${input.email.trim()} already exists.`)
  const roleId = Number(input.roleId)
  if (!roleId || !d.roles.some((r) => r.id === roleId)) errors.push({ field: 'roleId', message: 'Choose a role.' })
  const departmentId = Number(input.departmentId)
  const department = d.departments.find((x) => x.id === departmentId)
  if (!departmentId || !department) errors.push({ field: 'departmentId', message: 'Choose a department.' })
  else if (!department.active && existing?.departmentId !== departmentId)
    errors.push({ field: 'departmentId', message: `${department.name} is inactive.` })
  if (!existing && (!input.password || input.password.length < 10))
    errors.push({ field: 'password', message: 'Password must be at least 10 characters.' })
  // Optional link to a driver profile: this is what scopes the driver workspace (trips, fuel, reports).
  const driverId = input.driverId ? Number(input.driverId) : null
  if (driverId) {
    const driver = d.drivers.find((x) => x.id === driverId)
    if (!driver || driver.archived) errors.push({ field: 'driverId', message: 'Unknown driver.' })
    else {
      const holder = d.users.find((u) => u.id !== existing?.id && u.driverId === driverId)
      if (holder) errors.push({ field: 'driverId', message: `${driver.fullName} is already linked to ${holder.email}.` })
    }
  }
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: input.email.trim().toLowerCase(),
    phone: input.phone?.trim() || null,
    roleId,
    departmentId,
    driverId,
  }
}

get(
  '/users',
  ({ query }) => {
    const list = getDb()
      .users.map(toUser)
      .filter((u) => matchesText([u.firstName, u.lastName, u.email, u.phone, u.roleName, u.departmentName], query.q))
      .filter((u) => !query.roleId || u.roleId === Number(query.roleId))
      .filter((u) => !query.role || u.role === query.role)
      .filter((u) => !query.departmentId || u.departmentId === Number(query.departmentId))
      .filter((u) => query.active === undefined || String(u.active) === query.active)
    return paginate(list, query, 'lastName,asc')
  },
  { permission: 'USER_MANAGE' },
)
get(
  '/users/:id',
  ({ params }) => {
    const u = getDb().users.find((x) => x.id === Number(params.id))
    if (!u) throw notFound('User')
    return toUser(u)
  },
  { permission: 'USER_MANAGE' },
)
post(
  '/users',
  ({ body, user }) => {
    const values = validate(body ?? {})
    const d = getDb()
    const now = new Date().toISOString()
    const row = { id: nextId('user'), ...values, password: body.password, active: true, lastLoginAt: null, createdAt: now, updatedAt: now }
    d.users.push(row)
    auditU(user, 'CREATE', row)
    persist()
    return toUser(row)
  },
  { permission: 'USER_MANAGE' },
)
put(
  '/users/:id',
  ({ params, body, user }) => {
    const d = getDb()
    const row = d.users.find((x) => x.id === Number(params.id))
    if (!row) throw notFound('User')
    const values = validate(body ?? {}, { existing: row })
    if (row.id === user.id && values.roleId !== row.roleId) throw businessRule('You cannot change your own role.')
    if (isSuperAdmin(row) && values.roleId !== row.roleId && row.active && d.users.filter((u) => u.active && isSuperAdmin(u)).length <= 1)
      throw businessRule('At least one active super admin is required.')
    const before = toUser(row)
    Object.assign(row, values, { updatedAt: new Date().toISOString() })
    auditU(user, 'UPDATE', row, diff(before, toUser(row)))
    persist()
    return toUser(row)
  },
  { permission: 'USER_MANAGE' },
)
patch(
  '/users/:id/status',
  ({ params, body, user }) => {
    const d = getDb()
    const row = d.users.find((x) => x.id === Number(params.id))
    if (!row) throw notFound('User')
    const { active } = body
    if (row.id === user.id && !active) throw businessRule('You cannot deactivate your own account.')
    if (isSuperAdmin(row) && !active && d.users.filter((u) => u.active && isSuperAdmin(u)).length <= 1)
      throw businessRule('At least one active super admin is required.')
    auditU(user, 'STATUS_CHANGE', row, [{ field: 'active', from: row.active, to: active }])
    row.active = active
    row.updatedAt = new Date().toISOString()
    persist()
    return toUser(row)
  },
  { permission: 'USER_MANAGE' },
)
post(
  '/users/:id/reset-password',
  ({ params, body }) => {
    const row = getDb().users.find((x) => x.id === Number(params.id))
    if (!row) throw notFound('User')
    const { password } = body
    if (!password || password.length < 10)
      throw badRequest('Password must be at least 10 characters.', [{ field: 'password', message: 'Use at least 10 characters.' }])
    row.password = password
    row.updatedAt = new Date().toISOString()
    persist()
    return null
  },
  { permission: 'USER_MANAGE' },
)
