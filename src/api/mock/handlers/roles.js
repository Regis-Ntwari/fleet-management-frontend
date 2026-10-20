import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, notFound, PERMISSION_CODES, PERMISSION_GROUPS, PERMISSIONS, toCode } from '../core'
import { diff, recordAudit, toRole } from '../mappers'

const auditR = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'ROLE',
    entityId: row.id,
    entityLabel: row.name,
    changes,
  })

const findRole = (id) => {
  const r = getDb().roles.find((x) => x.id === Number(id))
  if (!r) throw notFound('Role')
  return r
}

function validate(input, { existing } = {}) {
  const errors = []
  const d = getDb()
  const name = input.name?.trim()
  if (!name || name.length < 2) errors.push({ field: 'name', message: 'Give the role a name.' })
  else if (name.length > 40) errors.push({ field: 'name', message: 'Keep the name under 40 characters.' })
  else if (d.roles.some((r) => r.id !== existing?.id && r.name.toLowerCase() === name.toLowerCase()))
    errors.push({ field: 'name', message: `A role named "${name}" already exists.` })
  if (input.description && input.description.length > 200)
    errors.push({ field: 'description', message: 'Keep the description under 200 characters.' })
  const permissions = Array.isArray(input.permissions) ? [...new Set(input.permissions)] : null
  if (!existing?.system) {
    if (!permissions || permissions.length === 0) errors.push({ field: 'permissions', message: 'Pick at least one permission.' })
    else {
      const unknown = permissions.filter((p) => !PERMISSION_CODES.includes(p))
      if (unknown.length) errors.push({ field: 'permissions', message: `Unknown permission: ${unknown.join(', ')}.` })
    }
  }
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return { name, description: input.description?.trim() || null, permissions }
}

/** The permission catalogue is static: the backend owns it, roles only reference it. */
get('/permissions', () => ({
  groups: PERMISSION_GROUPS.map((group) => ({ group, permissions: PERMISSIONS.filter((p) => p.group === group) })),
  all: PERMISSIONS,
}))

get(
  '/roles',
  ({ query }) =>
    getDb()
      .roles.map(toRole)
      .filter((r) => !query.q || [r.name, r.code, r.description].some((v) => v?.toLowerCase().includes(query.q.toLowerCase())))
      .sort((a, b) => a.name.localeCompare(b.name)),
  { permission: ['USER_MANAGE', 'ROLE_MANAGE'] },
)

get('/roles/:id', ({ params }) => toRole(findRole(params.id)), { permission: ['USER_MANAGE', 'ROLE_MANAGE'] })

post(
  '/roles',
  ({ body, user }) => {
    const { name, description, permissions } = validate(body ?? {})
    const d = getDb()
    let code = toCode(name) || 'ROLE'
    if (d.roles.some((r) => r.code === code)) code = `${code}_${nextId('roleCode')}`
    const now = new Date().toISOString()
    const row = { id: nextId('role'), code, name, description, tone: 'neutral', permissions, system: false, createdAt: now, updatedAt: now }
    d.roles.push(row)
    auditR(user, 'CREATE', row)
    persist()
    return toRole(row)
  },
  { permission: 'ROLE_MANAGE' },
)

put(
  '/roles/:id',
  ({ params, body, user }) => {
    const row = findRole(params.id)
    const { name, description, permissions } = validate(body ?? {}, { existing: row })
    const before = { ...row }
    row.name = name
    row.description = description
    // A system role always carries every permission, whatever the request says.
    if (!row.system) row.permissions = permissions
    row.updatedAt = new Date().toISOString()
    const changes = diff(before, row, ['name', 'description', 'permissions'])
    auditR(user, 'UPDATE', row, changes)
    persist()
    return toRole(row)
  },
  { permission: 'ROLE_MANAGE' },
)

del(
  '/roles/:id',
  ({ params, user }) => {
    const row = findRole(params.id)
    if (row.system) throw businessRule(`${row.name} is a system role and cannot be deleted.`)
    const d = getDb()
    const holders = d.users.filter((u) => u.roleId === row.id).length
    if (holders)
      throw conflict(
        `${holders} user${holders === 1 ? ' still has' : 's still have'} the ${row.name} role. Move them to another role first.`,
      )
    d.roles = d.roles.filter((r) => r.id !== row.id)
    auditR(user, 'DELETE', row)
    persist()
    return null
  },
  { permission: 'ROLE_MANAGE' },
)
