import { get, post, put, patch, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, notFound, toCode } from '../core'
import { recordAudit } from '../mappers'
import { LOOKUP_BY_KEY, LOOKUP_LISTS, TONES } from '../lookupDefs'

/**
 * Editable reference lists: the values behind every dropdown and suggestion box. The catalogue of
 * lists (keys, kinds, where each value is used) is fixed in `lookupDefs.js`; the items are rows in
 * `db.lookups`. Requires REFERENCE_MANAGE; reading the lists for dropdowns goes through GET /reference.
 */

const auditL = (user, action, def, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'REFERENCE_LIST',
    entityId: row.id,
    entityLabel: `${def.name}: ${row.label}`,
    changes,
  })

const findList = (key) => {
  const def = LOOKUP_BY_KEY[key]
  if (!def) throw notFound('Reference list')
  return def
}

const findItem = (def, id) => {
  const row = getDb().lookups.find((r) => r.list === def.key && r.id === Number(id))
  if (!row) throw notFound('Reference value')
  return row
}

/** How many records currently hold this value, across the fields the list feeds. */
export function usageCount(def, value) {
  const d = getDb()
  return def.usage.reduce((sum, [table, field]) => sum + (d[table] ?? []).filter((r) => r[field] === value).length, 0)
}

const toItem = (def, r) => ({
  id: r.id,
  value: r.value,
  label: r.label,
  tone: r.tone ?? 'neutral',
  description: r.description ?? null,
  active: r.active,
  system: Boolean(r.system),
  sortOrder: r.sortOrder,
  usageCount: usageCount(def, r.value),
  updatedAt: r.updatedAt,
})

const toList = (def) => ({
  key: def.key,
  name: def.name,
  group: def.group,
  kind: def.kind,
  description: def.description,
  usedBy: def.usage.map(([table, field]) => `${table}.${field}`),
  items: getDb()
    .lookups.filter((r) => r.list === def.key)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r) => toItem(def, r)),
})

function validateItem(def, input, { existing = null } = {}) {
  const errors = []
  const d = getDb()
  const label = input.label?.trim()
  if (!label) errors.push({ field: 'label', message: 'A label is required.' })
  else if (label.length > 60) errors.push({ field: 'label', message: 'Keep the label under 60 characters.' })
  let value = existing?.value
  if (!existing) {
    value = def.kind === 'text' ? label : toCode(input.value?.trim() || label)
    if (!value) errors.push({ field: 'value', message: 'A code is required.' })
    else if (def.kind === 'coded' && value.length > 40) errors.push({ field: 'value', message: 'Keep the code under 40 characters.' })
  }
  const tone = input.tone ?? existing?.tone ?? 'neutral'
  if (!TONES.includes(tone)) errors.push({ field: 'tone', message: 'Choose a colour.' })
  if (input.description && input.description.length > 160)
    errors.push({ field: 'description', message: 'Keep the description under 160 characters.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  const clash = d.lookups.find(
    (r) =>
      r.list === def.key &&
      r.id !== existing?.id &&
      (r.value.toLowerCase() === String(value).toLowerCase() || r.label.toLowerCase() === label.toLowerCase()),
  )
  if (clash) throw conflict(`"${clash.label}" already exists in ${def.name}.`)
  return { value, label, tone, description: input.description?.trim() || null }
}

get('/lookups', () => LOOKUP_LISTS.map(toList), { permission: 'REFERENCE_MANAGE' })

get('/lookups/:list', ({ params }) => toList(findList(params.list)), { permission: 'REFERENCE_MANAGE' })

post(
  '/lookups/:list/items',
  ({ params, body, user }) => {
    const def = findList(params.list)
    if (def.kind === 'status') throw businessRule(`${def.name} are workflow states and cannot be extended.`)
    const values = validateItem(def, body ?? {})
    const d = getDb()
    const now = new Date().toISOString()
    const sortOrder = Math.max(0, ...d.lookups.filter((r) => r.list === def.key).map((r) => r.sortOrder)) + 1
    const row = { id: nextId('lookup'), list: def.key, ...values, active: true, system: false, sortOrder, createdAt: now, updatedAt: now }
    d.lookups.push(row)
    auditL(user, 'CREATE', def, row)
    persist()
    return toItem(def, row)
  },
  { permission: 'REFERENCE_MANAGE' },
)

put(
  '/lookups/:list/items/:id',
  ({ params, body, user }) => {
    const def = findList(params.list)
    const row = findItem(def, params.id)
    const values = validateItem(def, body ?? {}, { existing: row })
    const before = { ...row }
    Object.assign(row, { label: values.label, tone: values.tone, description: values.description, updatedAt: new Date().toISOString() })
    const changes = ['label', 'tone', 'description']
      .filter((k) => before[k] !== row[k])
      .map((k) => ({ field: k, from: before[k], to: row[k] }))
    if (changes.length) auditL(user, 'UPDATE', def, row, changes)
    persist()
    return toItem(def, row)
  },
  { permission: 'REFERENCE_MANAGE' },
)

patch(
  '/lookups/:list/items/:id/status',
  ({ params, body, user }) => {
    const def = findList(params.list)
    const row = findItem(def, params.id)
    const active = Boolean(body?.active)
    if (row.active === active) return toItem(def, row)
    if (!active) {
      if (def.kind === 'status' || row.system) throw businessRule(`"${row.label}" is used by business rules and cannot be deactivated.`)
      const others = getDb().lookups.filter((r) => r.list === def.key && r.id !== row.id && r.active)
      if (!others.length) throw businessRule(`${def.name} needs at least one active value.`)
    }
    auditL(user, 'STATUS_CHANGE', def, row, [{ field: 'active', from: row.active, to: active }])
    row.active = active
    row.updatedAt = new Date().toISOString()
    persist()
    return toItem(def, row)
  },
  { permission: 'REFERENCE_MANAGE' },
)

del(
  '/lookups/:list/items/:id',
  ({ params, user }) => {
    const def = findList(params.list)
    const row = findItem(def, params.id)
    if (def.kind === 'status' || row.system)
      throw businessRule(`"${row.label}" is used by business rules and cannot be deleted. Rename it instead.`)
    const used = usageCount(def, row.value)
    if (used)
      throw conflict(
        `"${row.label}" is still used by ${used} record${used === 1 ? '' : 's'}. Deactivate it instead so it stops being offered.`,
      )
    const d = getDb()
    if (!d.lookups.some((r) => r.list === def.key && r.id !== row.id && r.active))
      throw businessRule(`${def.name} needs at least one active value.`)
    d.lookups = d.lookups.filter((r) => r.id !== row.id)
    auditL(user, 'DELETE', def, row)
    persist()
    return null
  },
  { permission: 'REFERENCE_MANAGE' },
)

/** Reorder a list; `ids` is the full set of item ids in the wanted order. */
put(
  '/lookups/:list/order',
  ({ params, body, user }) => {
    const def = findList(params.list)
    const d = getDb()
    const rows = d.lookups.filter((r) => r.list === def.key)
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : []
    if (ids.length !== rows.length || rows.some((r) => !ids.includes(r.id)))
      throw badRequest('The order must list every value in the list exactly once.')
    const now = new Date().toISOString()
    rows.forEach((r) => {
      r.sortOrder = ids.indexOf(r.id) + 1
      r.updatedAt = now
    })
    recordAudit({
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      action: 'UPDATE',
      entityType: 'REFERENCE_LIST',
      entityId: null,
      entityLabel: `${def.name}: order`,
      changes: null,
    })
    persist()
    return toList(def)
  },
  { permission: 'REFERENCE_MANAGE' },
)
