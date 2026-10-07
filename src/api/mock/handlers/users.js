import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, matchesText, notFound, paginate } from '../core'
import { diff, recordAudit, toUser } from '../mappers'
get(
  '/users',
  ({ query }) => {
    const list = getDb()
      .users.filter((u) => matchesText([u.firstName, u.lastName, u.email, u.phone], query.q))
      .filter((u) => !query.role || u.role === query.role)
      .filter((u) => query.active === undefined || String(u.active) === query.active)
      .map(toUser)
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
    const input = body
    const errors = []
    if (!input.firstName?.trim()) errors.push({ field: 'firstName', message: 'First name is required.' })
    if (!input.lastName?.trim()) errors.push({ field: 'lastName', message: 'Last name is required.' })
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email ?? '')) errors.push({ field: 'email', message: 'Enter a valid email address.' })
    if (!input.role) errors.push({ field: 'role', message: 'Role is required.' })
    if (!input.password || input.password.length < 10)
      errors.push({ field: 'password', message: 'Password must be at least 10 characters.' })
    if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
    const d = getDb()
    if (d.users.some((u) => u.email.toLowerCase() === input.email.toLowerCase()))
      throw conflict(`A user with email ${input.email} already exists.`)
    const now = new Date().toISOString()
    const row = {
      id: nextId('user'),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim().toLowerCase(),
      phone: input.phone ?? null,
      role: input.role,
      password: input.password,
      active: true,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
    }
    d.users.push(row)
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'CREATE',
      entityType: 'USER',
      entityId: row.id,
      entityLabel: row.email,
      changes: null,
    })
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
    const input = body
    if (input.email && d.users.some((u) => u.id !== row.id && u.email.toLowerCase() === input.email.toLowerCase()))
      throw conflict(`A user with email ${input.email} already exists.`)
    if (row.id === user.id && input.role && input.role !== row.role) throw businessRule('You cannot change your own role.')
    const before = toUser(row)
    Object.assign(row, { ...input, updatedAt: new Date().toISOString() })
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'USER',
      entityId: row.id,
      entityLabel: row.email,
      changes: diff(before, toUser(row)),
    })
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
    if (row.role === 'SUPER_ADMIN' && !active && d.users.filter((u) => u.role === 'SUPER_ADMIN' && u.active).length <= 1)
      throw businessRule('At least one active super admin is required.')
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'STATUS_CHANGE',
      entityType: 'USER',
      entityId: row.id,
      entityLabel: row.email,
      changes: [{ field: 'active', from: row.active, to: active }],
    })
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
