import { get, post, put, patch, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, notFound, toCode } from '../core'
import { diff, recordAudit, toDepartment } from '../mappers'

const auditD = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'DEPARTMENT',
    entityId: row.id,
    entityLabel: row.name,
    changes,
  })

const findDepartment = (id) => {
  const r = getDb().departments.find((x) => x.id === Number(id))
  if (!r) throw notFound('Department')
  return r
}

function validate(input, { existing } = {}) {
  const errors = []
  const d = getDb()
  const name = input.name?.trim()
  const code = toCode(input.code || name)
  if (!name || name.length < 2) errors.push({ field: 'name', message: 'Give the department a name.' })
  else if (d.departments.some((x) => x.id !== existing?.id && x.name.toLowerCase() === name.toLowerCase()))
    errors.push({ field: 'name', message: `A department named "${name}" already exists.` })
  if (!code) errors.push({ field: 'code', message: 'Code is required.' })
  else if (code.length > 12) errors.push({ field: 'code', message: 'Keep the code to 12 characters.' })
  else if (d.departments.some((x) => x.id !== existing?.id && x.code === code))
    errors.push({ field: 'code', message: `Code ${code} is already used.` })
  if (input.description && input.description.length > 200)
    errors.push({ field: 'description', message: 'Keep the description under 200 characters.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return { name, code, description: input.description?.trim() || null }
}

/** Any signed-in user can list departments: pickers on users and incidents need them. */
get('/departments', ({ query }) =>
  getDb()
    .departments.map(toDepartment)
    .filter((x) => query.active === undefined || String(x.active) === query.active)
    .filter((x) => !query.q || [x.name, x.code, x.description].some((v) => v?.toLowerCase().includes(query.q.toLowerCase())))
    .sort((a, b) => a.name.localeCompare(b.name)),
)

get('/departments/:id', ({ params }) => toDepartment(findDepartment(params.id)))

post(
  '/departments',
  ({ body, user }) => {
    const values = validate(body ?? {})
    const now = new Date().toISOString()
    const row = { id: nextId('department'), ...values, active: true, createdAt: now, updatedAt: now }
    getDb().departments.push(row)
    auditD(user, 'CREATE', row)
    persist()
    return toDepartment(row)
  },
  { permission: 'DEPARTMENT_MANAGE' },
)

put(
  '/departments/:id',
  ({ params, body, user }) => {
    const row = findDepartment(params.id)
    const values = validate(body ?? {}, { existing: row })
    const before = { ...row }
    Object.assign(row, values, { updatedAt: new Date().toISOString() })
    auditD(user, 'UPDATE', row, diff(before, row, ['name', 'code', 'description']))
    persist()
    return toDepartment(row)
  },
  { permission: 'DEPARTMENT_MANAGE' },
)

patch(
  '/departments/:id/status',
  ({ params, body, user }) => {
    const row = findDepartment(params.id)
    const active = Boolean(body?.active)
    if (!active && getDb().departments.filter((x) => x.active && x.id !== row.id).length === 0)
      throw businessRule('At least one active department is required.')
    auditD(user, 'STATUS_CHANGE', row, [{ field: 'active', from: row.active, to: active }])
    row.active = active
    row.updatedAt = new Date().toISOString()
    persist()
    return toDepartment(row)
  },
  { permission: 'DEPARTMENT_MANAGE' },
)

del(
  '/departments/:id',
  ({ params, user }) => {
    const row = findDepartment(params.id)
    const d = getDb()
    const members = d.users.filter((u) => u.departmentId === row.id).length
    if (members)
      throw conflict(`${members} user${members === 1 ? ' belongs' : 's belong'} to ${row.name}. Move them to another department first.`)
    const incidents = d.incidents.filter((i) => i.departmentId === row.id).length
    if (incidents)
      throw conflict(
        `${incidents} incident${incidents === 1 ? ' is' : 's are'} assigned to ${row.name}. Deactivate it instead of deleting.`,
      )
    d.departments = d.departments.filter((x) => x.id !== row.id)
    auditD(user, 'DELETE', row)
    persist()
    return null
  },
  { permission: 'DEPARTMENT_MANAGE' },
)
