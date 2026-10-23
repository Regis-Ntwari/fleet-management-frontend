import { get, post, put, patch } from '../router'
import { getDb, nextId, persist } from '../db'
import { badRequest, businessRule, conflict, inDateRange, matchesText, notFound, paginate } from '../core'
import { diff, isLookupValue, recordAudit, toDeployment, toPurchaseOrder, userCan } from '../mappers'

/**
 * Commerce: customer purchase orders (LPO). The account manager records the LPO as received;
 * deployments are then registered against it, and the record shows how much of the amount and
 * duration has been committed. The original amount is kept and every change is in the audit trail.
 */

const auditO = (user, action, row, changes = null) =>
  recordAudit({
    userId: user.id,
    userName: `${user.firstName} ${user.lastName}`,
    action,
    entityType: 'PURCHASE_ORDER',
    entityId: row.id,
    entityLabel: row.lpoNumber,
    changes,
  })

const findOrder = (id) => {
  const row = getDb().purchaseOrders.find((o) => o.id === Number(id))
  if (!row) throw notFound('Purchase order')
  return row
}

const normaliseNumber = (v) =>
  String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ')

function validate(input, { existing } = {}) {
  const errors = []
  const d = getDb()
  const lpoNumber = normaliseNumber(input.lpoNumber)
  const institution = input.institution?.trim()
  if (!lpoNumber) errors.push({ field: 'lpoNumber', message: 'Enter the LPO number as shown on the order.' })
  if (!institution) errors.push({ field: 'institution', message: 'Choose the institution.' })
  if (lpoNumber && institution) {
    const dup = d.purchaseOrders.find(
      (o) => o.id !== existing?.id && o.institution === institution && o.lpoNumber.toLowerCase() === lpoNumber.toLowerCase(),
    )
    if (dup) throw conflict(`${institution} already has an LPO numbered ${lpoNumber}.`)
  }
  const managerId = Number(input.accountManagerId)
  const manager = d.users.find((u) => u.id === managerId)
  if (!managerId || !manager) errors.push({ field: 'accountManagerId', message: 'Choose the account manager.' })
  else if (!userCan(manager, 'ORDER_MANAGE'))
    errors.push({ field: 'accountManagerId', message: `${manager.firstName} ${manager.lastName} cannot manage LPOs.` })
  if (!input.receivedOn || Number.isNaN(Date.parse(input.receivedOn)))
    errors.push({ field: 'receivedOn', message: 'Enter the date received.' })
  const days = Number(input.durationDays)
  if (!Number.isInteger(days) || days < 1 || days > 1095) errors.push({ field: 'durationDays', message: 'Duration in days (1–1095).' })
  if (!input.description?.trim()) errors.push({ field: 'description', message: 'Describe the order.' })
  const amount = Number(input.amount)
  if (!Number.isFinite(amount) || amount <= 0) errors.push({ field: 'amount', message: 'Enter the total LPO amount.' })
  const currency = input.currency || 'RWF'
  if (!isLookupValue('currencies', currency)) errors.push({ field: 'currency', message: 'Choose a currency.' })
  if (errors.length) throw badRequest('Please correct the highlighted fields.', errors)
  return {
    lpoNumber,
    institution,
    accountManagerId: managerId,
    receivedOn: input.receivedOn.slice(0, 10),
    durationDays: days,
    description: input.description.trim(),
    amount: Math.round(amount),
    currency,
    notes: input.notes?.trim() || null,
  }
}

get(
  '/purchase-orders',
  ({ query }) => {
    const list = getDb()
      .purchaseOrders.map(toPurchaseOrder)
      .filter((o) => matchesText([o.lpoNumber, o.institution, o.accountManagerName, o.description], query.q))
      .filter((o) => !query.institution || o.institution === query.institution)
      .filter((o) => !query.status || query.status.split(',').includes(o.status))
      .filter((o) => !query.accountManagerId || o.accountManagerId === Number(query.accountManagerId))
      .filter((o) => inDateRange(o.receivedOn, query.from, query.to))
    return paginate(list, query, 'receivedOn,desc')
  },
  { permission: ['ORDER_READ', 'ORDER_MANAGE', 'DEPLOYMENT_MANAGE'] },
)

/** Open LPOs of an institution, for the deployment form. */
get(
  '/purchase-orders/options',
  ({ query }) =>
    getDb()
      .purchaseOrders.map(toPurchaseOrder)
      .filter((o) => !query.institution || o.institution === query.institution)
      .filter((o) => query.includeClosed === 'true' || !o.closedAt)
      .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn)),
  { permission: ['ORDER_READ', 'ORDER_MANAGE', 'DEPLOYMENT_MANAGE', 'DEPLOYMENT_READ'] },
)

/** Users who may be named as account manager on an LPO: active accounts holding ORDER_MANAGE. */
get(
  '/purchase-orders/account-managers',
  () =>
    getDb()
      .users.filter((u) => u.active && userCan(u, 'ORDER_MANAGE'))
      .map((u) => ({ id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  { permission: ['ORDER_READ', 'ORDER_MANAGE'] },
)

get(
  '/purchase-orders/summary',
  () => {
    const list = getDb().purchaseOrders.map(toPurchaseOrder)
    const open = list.filter((o) => o.status === 'OPEN')
    return {
      open: open.length,
      exhausted: list.filter((o) => o.status === 'EXHAUSTED').length,
      expired: list.filter((o) => o.status === 'EXPIRED').length,
      openAmount: open.reduce((s, o) => s + o.amount, 0),
      openRemaining: open.reduce((s, o) => s + o.remainingAmount, 0),
    }
  },
  { permission: ['ORDER_READ', 'ORDER_MANAGE'] },
)

get('/purchase-orders/:id', ({ params }) => toPurchaseOrder(findOrder(params.id)), {
  permission: ['ORDER_READ', 'ORDER_MANAGE', 'DEPLOYMENT_MANAGE', 'DEPLOYMENT_READ'],
})

get(
  '/purchase-orders/:id/deployments',
  ({ params }) => {
    const row = findOrder(params.id)
    return getDb()
      .deployments.filter((t) => t.purchaseOrderId === row.id)
      .sort((a, b) => b.scheduledStartAt.localeCompare(a.scheduledStartAt))
      .map(toDeployment)
  },
  { permission: ['ORDER_READ', 'ORDER_MANAGE', 'DEPLOYMENT_READ'] },
)

post(
  '/purchase-orders',
  ({ body, user }) => {
    const values = validate(body ?? {})
    const now = new Date().toISOString()
    const row = {
      id: nextId('purchaseOrder'),
      ...values,
      originalAmount: values.amount,
      closedAt: null,
      createdById: user.id,
      createdAt: now,
      updatedAt: now,
    }
    getDb().purchaseOrders.push(row)
    auditO(user, 'CREATE', row)
    persist()
    return toPurchaseOrder(row)
  },
  { permission: 'ORDER_MANAGE' },
)

put(
  '/purchase-orders/:id',
  ({ params, body, user }) => {
    const row = findOrder(params.id)
    if (row.closedAt) throw businessRule('This LPO is closed. Reopen it before editing.')
    const values = validate(body ?? {}, { existing: row })
    const before = { ...row }
    const committed = toPurchaseOrder(row).committedAmount
    if (values.amount < committed)
      throw businessRule(
        `Deployments worth ${committed.toLocaleString()} ${row.currency} are already registered against this LPO; the amount cannot go below that.`,
      )
    Object.assign(row, values, { updatedAt: new Date().toISOString() })
    auditO(user, 'UPDATE', row, diff(before, row))
    persist()
    return toPurchaseOrder(row)
  },
  { permission: 'ORDER_MANAGE' },
)

/** Close (or reopen) an LPO so no further deployments can be made against it. */
patch(
  '/purchase-orders/:id/status',
  ({ params, body, user }) => {
    const row = findOrder(params.id)
    const { closed } = body ?? {}
    const d = getDb()
    if (closed && d.deployments.some((t) => t.purchaseOrderId === row.id && ['PLANNED', 'DISPATCHED', 'IN_PROGRESS'].includes(t.status)))
      throw businessRule('Deployments are still open against this LPO. Return or cancel them first.')
    const before = { ...row }
    row.closedAt = closed ? new Date().toISOString() : null
    row.updatedAt = new Date().toISOString()
    auditO(user, 'STATUS_CHANGE', row, diff(before, row))
    persist()
    return toPurchaseOrder(row)
  },
  { permission: 'ORDER_MANAGE' },
)
