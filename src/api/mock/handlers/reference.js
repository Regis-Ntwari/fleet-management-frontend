import { get, post, put, del } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, conflict, notFound, requireFields } from '../core'
import { lookupItems, recordAudit, toCategory, toCompany, toTariff } from '../mappers'
export { REFERENCE } from '../referenceData'
/**
 * Every enum, status and suggestion list the UI renders. Lists are rows in `db.lookups`
 * (editable under Administration → Reference data), so only active items are returned.
 */
get('/reference', () => {
  const d = getDb()
  const out = {}
  for (const key of new Set(d.lookups.map((r) => r.list))) out[key] = lookupItems(key, { activeOnly: true })
  // Roles live in the database, so badges and filters pick up roles created by an administrator.
  out.roles = d.roles.map((r) => ({ value: r.code, label: r.name, tone: r.tone ?? 'neutral' }))
  out.vehicleCategories = d.categories.map(toCategory)
  out.companies = d.companies.map(toCompany)
  out.tariffs = d.tariffs.map(toTariff)
  return out
})
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
