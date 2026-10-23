import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, forbidden, inDateRange, matchesText, notFound, paginate } from '../core'
import { companyById, diff, recordAudit, toPart, toStockMovement } from '../mappers'

/**
 * Spare parts and stock, kept per company. A user attached to a company only sees and moves that
 * company's stock; head-office users pick the company first. Every receipt, issue, return,
 * adjustment and transfer is a movement row, so the current quantity is always explainable.
 */

const auditP = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'SPARE_PART',
    entityId: row.id,
    entityLabel: `${row.partNumber} (${companyById(row.companyId)?.name ?? 'company'})`,
    changes,
  })

/** The companies whose stock this user may see: their own, or all for head-office accounts. */
const visibleCompanyIds = (user) => (user.companyId ? [user.companyId] : getDb().companies.map((c) => c.id))

const assertCompanyAccess = (user, companyId) => {
  if (!visibleCompanyIds(user).includes(Number(companyId))) throw forbidden('You can only work with your own company’s stock.')
}

const findPart = (id, user) => {
  const row = getDb().parts.find((p) => p.id === Number(id))
  if (!row) throw notFound('Spare part')
  assertCompanyAccess(user, row.companyId)
  return row
}

/** Records a movement and applies it to the part's quantity. `quantity` is signed. */
export function recordMovement(
  part,
  { type, quantity, unitCost, reference, note, counterpartCompanyId = null },
  user,
  at = new Date().toISOString(),
) {
  const d = getDb()
  if (part.currentStock + quantity < 0)
    throw businessRule(`Stock of ${part.name} cannot go below zero (currently ${part.currentStock} ${part.unit ?? 'pcs'}).`)
  const row = {
    id: nextId('stockMovement'),
    companyId: part.companyId,
    partId: part.id,
    type,
    quantity,
    unitCost: unitCost ?? part.unitCost,
    reference: reference?.trim() || null,
    note: note?.trim() || null,
    counterpartCompanyId,
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    at,
  }
  d.stockMovements.unshift(row)
  part.currentStock += quantity
  part.updatedAt = at
  return row
}

function validatePart(input, user, existing = null) {
  const errors = []
  const d = getDb()
  const companyId = Number(input.companyId ?? existing?.companyId)
  if (!companyId || !d.companies.some((c) => c.id === companyId && c.active))
    errors.push({ field: 'companyId', message: 'Choose the company this stock belongs to.' })
  else assertCompanyAccess(user, companyId)
  const partNumber = input.partNumber?.trim().toUpperCase()
  if (!partNumber) errors.push({ field: 'partNumber', message: 'Part number is required.' })
  else if (d.parts.some((p) => p.id !== existing?.id && p.companyId === companyId && p.partNumber.toUpperCase() === partNumber))
    throw conflict(`Part number ${partNumber} already exists in ${companyById(companyId)?.name ?? 'this company'}’s stock.`)
  if (!input.name?.trim()) errors.push({ field: 'name', message: 'Name is required.' })
  if (!input.category?.trim()) errors.push({ field: 'category', message: 'Category is required.' })
  if (!input.supplier?.trim()) errors.push({ field: 'supplier', message: 'Supplier is required.' })
  if (!(Number(input.unitCost) >= 0)) errors.push({ field: 'unitCost', message: 'Unit cost cannot be negative.' })
  if (!Number.isInteger(Number(input.minimumStock)) || Number(input.minimumStock) < 0)
    errors.push({ field: 'minimumStock', message: 'Whole number, zero or more.' })
  if (!existing && (!Number.isInteger(Number(input.currentStock)) || Number(input.currentStock) < 0))
    errors.push({ field: 'currentStock', message: 'Whole number, zero or more.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return {
    companyId,
    partNumber,
    name: input.name.trim(),
    category: input.category.trim(),
    unit: input.unit?.trim() || 'pcs',
    location: input.location?.trim() || null,
    unitCost: Number(input.unitCost),
    supplier: input.supplier.trim(),
    minimumStock: Number(input.minimumStock),
  }
}

get(
  '/spare-parts',
  ({ query, user }) => {
    const companies = visibleCompanyIds(user)
    const list = getDb()
      .parts.filter((p) => companies.includes(p.companyId))
      .filter((p) => !query.companyId || p.companyId === Number(query.companyId))
      .filter((p) => matchesText([p.partNumber, p.name, p.category, p.supplier, p.location], query.q))
      .filter((p) => !query.category || p.category === query.category)
      .map(toPart)
      .filter((p) => query.lowStock !== 'true' || p.lowStock)
    return paginate(list, query, 'name,asc')
  },
  { permission: 'MAINTENANCE_READ' },
)

get(
  '/spare-parts/categories',
  ({ query, user }) => {
    const companies = visibleCompanyIds(user)
    return Array.from(
      new Set(
        getDb()
          .parts.filter((p) => companies.includes(p.companyId) && (!query.companyId || p.companyId === Number(query.companyId)))
          .map((p) => p.category),
      ),
    ).sort()
  },
  { permission: 'MAINTENANCE_READ' },
)

/** Stock position per company for the page header. */
get(
  '/spare-parts/summary',
  ({ user }) => {
    const d = getDb()
    return d.companies
      .filter((c) => visibleCompanyIds(user).includes(c.id))
      .map((c) => {
        const parts = d.parts.filter((p) => p.companyId === c.id)
        return {
          companyId: c.id,
          companyName: c.name,
          companyCode: c.code,
          parts: parts.length,
          lowStock: parts.filter((p) => p.currentStock < p.minimumStock).length,
          stockValue: parts.reduce((s, p) => s + p.currentStock * p.unitCost, 0),
        }
      })
  },
  { permission: 'MAINTENANCE_READ' },
)

get(
  '/stock-movements',
  ({ query, user }) => {
    const companies = visibleCompanyIds(user)
    const list = getDb()
      .stockMovements.filter((m) => companies.includes(m.companyId))
      .filter((m) => !query.companyId || m.companyId === Number(query.companyId))
      .filter((m) => !query.partId || m.partId === Number(query.partId))
      .filter((m) => !query.type || query.type.split(',').includes(m.type))
      .filter((m) => inDateRange(m.at, query.from, query.to))
      .map(toStockMovement)
      .filter((m) => matchesText([m.partNumber, m.partName, m.reference, m.note, m.userName], query.q))
    return paginate(list, query, 'at,desc')
  },
  { permission: 'MAINTENANCE_READ' },
)

get('/spare-parts/:id', ({ params, user }) => toPart(findPart(params.id, user)), { permission: 'MAINTENANCE_READ' })

post(
  '/spare-parts',
  ({ body, user }) => {
    const values = validatePart(body ?? {}, user)
    const now = new Date().toISOString()
    const opening = Number(body.currentStock) || 0
    const row = { id: nextId('part'), ...values, currentStock: 0, createdAt: now, updatedAt: now }
    getDb().parts.push(row)
    if (opening > 0)
      recordMovement(row, { type: 'RECEIPT', quantity: opening, reference: body.reference, note: 'Opening stock' }, user, now)
    auditP(user, 'CREATE', row)
    persist()
    return toPart(row)
  },
  { permission: 'PARTS_MANAGE' },
)

put(
  '/spare-parts/:id',
  ({ params, body, user }) => {
    const row = findPart(params.id, user)
    const values = validatePart({ ...body, companyId: row.companyId }, user, row)
    const before = { ...row }
    Object.assign(row, values, { updatedAt: new Date().toISOString() })
    auditP(user, 'UPDATE', row, diff(before, row))
    persist()
    return toPart(row)
  },
  { permission: 'PARTS_MANAGE' },
)

const MANUAL_TYPES = { RECEIPT: 1, ISSUE: -1, RETURN: 1, ADJUSTMENT: 0 }

/** Receipt, issue, return or count adjustment on one part. */
post(
  '/spare-parts/:id/movements',
  ({ params, body, user }) => {
    const row = findPart(params.id, user)
    const { type, quantity, unitCost, reference, note } = body ?? {}
    if (!(type in MANUAL_TYPES))
      throw badRequest('Choose the movement type.', [{ field: 'type', message: 'Receipt, issue, return or adjustment.' }])
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty === 0)
      throw badRequest('Enter a non-zero whole number.', [{ field: 'quantity', message: 'Required.' }])
    if (type !== 'ADJUSTMENT' && qty < 0)
      throw badRequest('Quantities are entered as positive numbers.', [{ field: 'quantity', message: 'Use a positive number.' }])
    if (type === 'ADJUSTMENT' && !note?.trim())
      throw badRequest('Give the reason for the adjustment.', [{ field: 'note', message: 'Required for adjustments.' }])
    if (type === 'RECEIPT' && !reference?.trim())
      throw badRequest('Enter the delivery or invoice reference.', [{ field: 'reference', message: 'Required for receipts.' }])
    const signed = type === 'ADJUSTMENT' ? qty : qty * MANUAL_TYPES[type]
    const from = row.currentStock
    const movement = recordMovement(
      row,
      { type, quantity: signed, unitCost: unitCost != null && unitCost !== '' ? Number(unitCost) : undefined, reference, note },
      user,
    )
    if (type === 'RECEIPT' && unitCost != null && unitCost !== '' && Number(unitCost) >= 0) row.unitCost = Number(unitCost)
    auditP(user, 'UPDATE', row, [
      { field: 'currentStock', from, to: row.currentStock },
      { field: 'movement', from: null, to: `${type} ${signed > 0 ? '+' : ''}${signed}${reference ? ` (${reference})` : ''}` },
    ])
    persist()
    return { part: toPart(row), movement: toStockMovement(movement) }
  },
  { permission: 'PARTS_MANAGE' },
)

/** Kept for compatibility with the old quick adjust: a signed delta becomes an adjustment movement. */
patch(
  '/spare-parts/:id/stock',
  ({ params, body, user }) => {
    const row = findPart(params.id, user)
    const delta = Number(body?.delta)
    if (!Number.isInteger(delta) || delta === 0)
      throw badRequest('Enter a non-zero whole number.', [{ field: 'delta', message: 'Required.' }])
    const from = row.currentStock
    recordMovement(row, { type: 'ADJUSTMENT', quantity: delta, note: body?.reason || 'Stock adjustment' }, user)
    auditP(user, 'UPDATE', row, [{ field: 'currentStock', from, to: row.currentStock }])
    persist()
    return toPart(row)
  },
  { permission: 'PARTS_MANAGE' },
)

/**
 * Intercompany transfer: stock leaves one company and arrives in the other as two movements
 * referencing each other, with the approving user and a mandatory note. The receiving company
 * gets a matching part record if it has none.
 */
post(
  '/spare-parts/:id/transfer',
  ({ params, body, user }) => {
    const d = getDb()
    const source = findPart(params.id, user)
    const { toCompanyId, quantity, note, reference } = body ?? {}
    const target = d.companies.find((c) => c.id === Number(toCompanyId) && c.active)
    if (!target) throw badRequest('Choose the receiving company.', [{ field: 'toCompanyId', message: 'Required.' }])
    if (target.id === source.companyId)
      throw badRequest('Choose a different company.', [{ field: 'toCompanyId', message: 'Same company.' }])
    const qty = Number(quantity)
    if (!Number.isInteger(qty) || qty <= 0)
      throw badRequest('Enter the quantity to transfer.', [{ field: 'quantity', message: 'Positive whole number.' }])
    if (!note?.trim()) throw badRequest('Transfers need an approval note.', [{ field: 'note', message: 'Who approved it and why.' }])
    if (source.currentStock < qty) throw businessRule(`Only ${source.currentStock} ${source.unit ?? 'pcs'} of ${source.name} in stock.`)
    const now = new Date().toISOString()
    let dest = d.parts.find((p) => p.companyId === target.id && p.partNumber.toUpperCase() === source.partNumber.toUpperCase())
    if (!dest) {
      dest = {
        id: nextId('part'),
        companyId: target.id,
        partNumber: source.partNumber,
        name: source.name,
        category: source.category,
        unit: source.unit ?? 'pcs',
        location: null,
        unitCost: source.unitCost,
        supplier: source.supplier,
        minimumStock: source.minimumStock,
        currentStock: 0,
        createdAt: now,
        updatedAt: now,
      }
      d.parts.push(dest)
      auditP(user, 'CREATE', dest, [{ field: 'transferredFrom', from: null, to: companyById(source.companyId)?.name ?? null }])
    }
    const ref = reference?.trim() || `TRF-${now.slice(0, 10).replace(/-/g, '')}-${source.id}`
    const approval = `Approved by ${user.firstName} ${user.lastName}: ${note.trim()}`
    const out = recordMovement(
      source,
      { type: 'TRANSFER_OUT', quantity: -qty, reference: ref, note: approval, counterpartCompanyId: target.id },
      user,
      now,
    )
    const inn = recordMovement(
      dest,
      { type: 'TRANSFER_IN', quantity: qty, reference: ref, note: approval, counterpartCompanyId: source.companyId },
      user,
      now,
    )
    auditP(user, 'UPDATE', source, [{ field: 'transfer', from: null, to: `${qty} ${source.unit ?? 'pcs'} to ${target.name} (${ref})` }])
    persist()
    return { source: toPart(source), destination: toPart(dest), movements: [toStockMovement(out), toStockMovement(inn)] }
  },
  { permission: 'PARTS_MANAGE' },
)
