import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, notFound, toCode } from '../core'
import { diff, recordAudit, toCompany, toTariff } from '../mappers'

/**
 * Operating companies of the group (LIMOZ, Gorilland, Goritech…) and the tariff categories
 * deployments are billed under. Both are configured under Settings rather than in code: the
 * company carries the deployment number prefix and the road map letterhead; the tariff carries
 * the daily rate for CAT1–CAT3.
 */

const audit = (user, entityType, action, row, label, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType,
    entityId: row.id,
    entityLabel: label,
    changes,
  })

// ---------- Companies ----------

const findCompany = (id) => {
  const row = getDb().companies.find((c) => c.id === Number(id))
  if (!row) throw notFound('Company')
  return row
}

function validateCompany(input, existing = null) {
  const errors = []
  const d = getDb()
  const name = input.name?.trim()
  const code = toCode(input.code || name)
  const prefix = String(input.numberPrefix ?? '')
    .trim()
    .toUpperCase()
  if (!name) errors.push({ field: 'name', message: 'Give the company a name.' })
  if (!code) errors.push({ field: 'code', message: 'Code is required.' })
  else if (d.companies.some((c) => c.id !== existing?.id && c.code === code))
    errors.push({ field: 'code', message: `Code ${code} is already used.` })
  if (!input.legalName?.trim()) errors.push({ field: 'legalName', message: 'Legal name is required for the road map letterhead.' })
  if (!/^[A-Z]{2,8}$/.test(prefix)) errors.push({ field: 'numberPrefix', message: 'Use 2–8 letters, e.g. GSL or LIMOZ.' })
  else if (d.companies.some((c) => c.id !== existing?.id && c.numberPrefix === prefix))
    errors.push({ field: 'numberPrefix', message: `Prefix ${prefix} is already used by another company.` })
  if (input.logoDataUrl && !/^data:image\//.test(input.logoDataUrl))
    errors.push({ field: 'logoDataUrl', message: 'The logo must be an image.' })
  if (input.logoDataUrl && input.logoDataUrl.length > 400_000) errors.push({ field: 'logoDataUrl', message: 'Use a logo under 300 KB.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return {
    name,
    code,
    legalName: input.legalName.trim(),
    numberPrefix: prefix,
    tin: input.tin?.trim() || null,
    address: input.address?.trim() || null,
    phone: input.phone?.trim() || null,
    email: input.email?.trim() || null,
    roadMapTitle: input.roadMapTitle?.trim() || 'Road map / Feuille de route / Urupapuro ruranga imikoreshereze y’imodoka',
    logoDataUrl: input.logoDataUrl || null,
  }
}

/** Any signed-in user can list companies: deployment, stock and user forms need them. */
get('/companies', ({ query }) =>
  getDb()
    .companies.map(toCompany)
    .filter((c) => query.active === undefined || String(c.active) === query.active)
    .sort((a, b) => a.id - b.id),
)

get('/companies/:id', ({ params }) => toCompany(findCompany(params.id)))

post(
  '/companies',
  ({ body, user }) => {
    const values = validateCompany(body ?? {})
    const now = new Date().toISOString()
    const row = { id: nextId('company'), ...values, active: true, createdAt: now, updatedAt: now }
    getDb().companies.push(row)
    audit(user, 'COMPANY', 'CREATE', row, row.name)
    persist()
    return toCompany(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)

put(
  '/companies/:id',
  ({ params, body, user }) => {
    const row = findCompany(params.id)
    const input = body ?? {}
    const before = { ...row }
    // A bare `{ active }` toggles availability; anything else is a full edit.
    if (Object.keys(input).length === 1 && 'active' in input) {
      if (!input.active && getDb().companies.filter((c) => c.active).length <= 1)
        throw businessRule('At least one company must stay active.')
      row.active = Boolean(input.active)
    } else {
      // The prefix is part of every issued number; it is frozen once deployments exist.
      const values = validateCompany({ ...row, ...input }, row)
      if (values.numberPrefix !== row.numberPrefix && getDb().deployments.some((t) => t.companyId === row.id))
        throw businessRule('The number prefix cannot change once deployments have been issued under it.')
      Object.assign(row, values)
    }
    row.updatedAt = new Date().toISOString()
    audit(user, 'COMPANY', 'UPDATE', row, row.name, diff(before, row))
    persist()
    return toCompany(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)

del(
  '/companies/:id',
  ({ params, user }) => {
    const d = getDb()
    const row = findCompany(params.id)
    if (
      d.deployments.some((t) => t.companyId === row.id) ||
      d.parts.some((p) => p.companyId === row.id) ||
      d.users.some((u) => u.companyId === row.id)
    )
      throw businessRule('This company has deployments, stock or users. Deactivate it instead of deleting.')
    d.companies = d.companies.filter((c) => c.id !== row.id)
    audit(user, 'COMPANY', 'DELETE', row, row.name)
    persist()
    return null
  },
  { permission: 'SETTINGS_MANAGE' },
)

// ---------- Tariff categories ----------

const findTariff = (id) => {
  const row = getDb().tariffs.find((t) => t.id === Number(id))
  if (!row) throw notFound('Tariff category')
  return row
}

function validateTariff(input, existing = null) {
  const errors = []
  const d = getDb()
  const name = input.name?.trim()
  const code = toCode(input.code || name)
  if (!name) errors.push({ field: 'name', message: 'Give the category a name.' })
  if (!code) errors.push({ field: 'code', message: 'Code is required, e.g. CAT1.' })
  else if (d.tariffs.some((t) => t.id !== existing?.id && t.code === code))
    errors.push({ field: 'code', message: `Code ${code} is already used.` })
  const rate = Number(input.dailyRate)
  if (!Number.isFinite(rate) || rate < 0) errors.push({ field: 'dailyRate', message: 'Enter the daily rate.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return { name, code, dailyRate: Math.round(rate), description: input.description?.trim() || null }
}

get('/tariffs', ({ query }) =>
  getDb()
    .tariffs.map(toTariff)
    .filter((t) => query.active === undefined || String(t.active) === query.active)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
)

post(
  '/tariffs',
  ({ body, user }) => {
    const values = validateTariff(body ?? {})
    const now = new Date().toISOString()
    const row = { id: nextId('tariff'), ...values, active: true, createdAt: now, updatedAt: now }
    getDb().tariffs.push(row)
    audit(user, 'TARIFF', 'CREATE', row, row.code)
    persist()
    return toTariff(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)

put(
  '/tariffs/:id',
  ({ params, body, user }) => {
    const row = findTariff(params.id)
    const input = body ?? {}
    const before = { ...row }
    if (Object.keys(input).length === 1 && 'active' in input) row.active = Boolean(input.active)
    else Object.assign(row, validateTariff({ ...row, ...input }, row))
    row.updatedAt = new Date().toISOString()
    // Existing deployments keep the rate they were registered at (`tariffRate` snapshot).
    audit(user, 'TARIFF', 'UPDATE', row, row.code, diff(before, row))
    persist()
    return toTariff(row)
  },
  { permission: 'SETTINGS_MANAGE' },
)

del(
  '/tariffs/:id',
  ({ params, user }) => {
    const d = getDb()
    const row = findTariff(params.id)
    if (d.deployments.some((t) => t.tariffId === row.id))
      throw businessRule('This category is used by deployments. Deactivate it instead of deleting.')
    d.tariffs = d.tariffs.filter((t) => t.id !== row.id)
    audit(user, 'TARIFF', 'DELETE', row, row.code)
    persist()
    return null
  },
  { permission: 'SETTINGS_MANAGE' },
)
