/**
 * Profitability workbook analysis (LIMOZ / Gorilland monthly GL exports).
 *
 * Each worksheet has a title row, a "From: … To …" row, a header row and transaction rows
 * ending with a "TOTAL AMT" row. The three known layouts differ slightly:
 *  - Trucks:   SALES AMOUNT, MILEAGE MISSION + EXTRA MILEAGE MISSION, FUEL AMOUNT FRW / TZS, no day count
 *  - GSL/SUVs: INSTITUTION AMOUNT, MISSION, FUEL, NUMBER OF DAY
 * Columns are found by header name, so column order and extra columns do not matter.
 */

const norm = (s) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()

/** Field → accepted header spellings (normalised). */
const HEADERS = {
  date: ['DATE'],
  voucher: ['VOUCHER TYPE', 'VOUCHER'],
  driver: ['DRIVER NAME', 'DRIVER'],
  plate: ['PLATE NO', 'PLATE NUMBER', 'PLATE', 'PLATE NO S'],
  vehicleType: ['TYPE OF TRUCK', 'TYPE OF VEHICLE', 'VEHICLE TYPE'],
  days: ['NUMBER OF DAY', 'NUMBER OF DAYS', 'NO OF DAYS', 'DAYS'],
  owner: ['OWNER'],
  revenue: ['INSTITUTION AMOUNT', 'SALES AMOUNT'],
  ownersAmount: ['OWNERS AMOUNT', 'OWNER AMOUNT', 'OWNER S AMOUNT'],
  mission: ['MISSION', 'MILEAGE MISSION'],
  extraMission: ['EXTRA MILEAGE MISSION'],
  fuel: ['FUEL', 'FUEL AMOUNT FRW', 'FUEL AMOUNT RWF'],
  fuelTzs: ['FUEL AMOUNT TZS', 'FUEL AMOUNT TZ'],
  repair: ['REPAIR MAINTENANCE', 'REPAIR AND MAINTENANCE'],
  deploymentComment: ['DEPLOYMENT COMMENT', 'DEPLOYMENT COMMENTS'],
  technicalComment: ['TECHNICAL COMMENT', 'TECHNICAL COMMENTS'],
  fuelComment: ['FUEL COMMENT', 'FUEL COMENT', 'FUEL COMMENTS'],
}
const AMOUNT_FIELDS = ['revenue', 'ownersAmount', 'mission', 'extraMission', 'fuel', 'fuelTzs', 'repair']

/** Friendly names for the sheets we know about; anything else keeps its sheet name. */
const KNOWN_SHEETS = [
  { test: /truck/i, label: 'Trucks (oil tankers)' },
  { test: /^GL\s*Profit/i, label: 'Gorilland Safaris' },
  { test: /^LM\s*Profit/i, label: 'Limoz Rwanda SUVs' },
]

export const STATUSES = [
  { key: 'returned', label: 'Returned', tone: 'success' },
  { key: 'delivered', label: 'Delivered', tone: 'success' },
  { key: 'notReturned', label: 'Not returned', tone: 'warning' },
  { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
  { key: 'other', label: 'Other comment', tone: 'neutral' },
  { key: 'none', label: 'No comment', tone: 'neutral' },
]

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 }
const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Accepts "1-Oct-26", "01/10/2026", "2026-10-01" or an Excel serial number. Returns yyyy-MM-dd or null. */
export function parseDate(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (value < 20000 || value > 80000) return null
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000)
    return iso(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
  }
  const s = String(value).trim()
  let m = s.match(/^(\d{1,2})[-\s/.]([A-Za-z]{3})[A-Za-z]*[-\s/.](\d{2,4})$/)
  if (m && MONTHS[m[2].toUpperCase()] != null) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return iso(y, MONTHS[m[2].toUpperCase()], Number(m[1]))
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return iso(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (m) return iso(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  return null
}

export function parseAmount(value) {
  if (value == null || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const n = Number(
    String(value)
      .replace(/[,\s]/g, '')
      .replace(/^\((.*)\)$/, '-$1'),
  )
  return Number.isFinite(n) ? n : 0
}

const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim())
export const plateKey = (plate) => norm(plate).replace(/ /g, '')
/** Drops the ledger account code in front of a name: "412002 HANO TOURS LTD" → "HANO TOURS LTD". */
export const stripCode = (name) => clean(name).replace(/^\d{3,}\s*[_\-:]?\s*/, '') || clean(name)
export const isCompanyOwner = (owner) => /LIMOZ|GSL|GORILL/i.test(owner ?? '')

function rowKind(voucher) {
  const v = norm(voucher)
  if (v.includes('DEPLOY')) return 'deployment'
  if (v.includes('FUEL')) return 'fuel'
  if (/TECHNIC|REPAIR|MAINTEN/.test(v)) return 'technical'
  return 'other'
}

function deploymentStatus(comment) {
  const c = norm(comment)
  if (!c) return 'none'
  if (/\bNOT\b.*RETURN/.test(c)) return 'notReturned'
  if (c.startsWith('CANCEL')) return 'cancelled'
  if (c.includes('RETURN')) return 'returned'
  if (c.includes('DELIVER')) return 'delivered'
  return 'other'
}

function findHeader(rows) {
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const cells = (rows[i] ?? []).map(norm)
    if (cells.some((c) => HEADERS.plate.includes(c)) && cells.some((c) => HEADERS.voucher.includes(c))) return i
  }
  return -1
}

function mapColumns(headerRow) {
  const cols = {}
  headerRow.forEach((cell, index) => {
    const h = norm(cell)
    for (const [field, names] of Object.entries(HEADERS)) if (cols[field] == null && names.includes(h)) cols[field] = index
  })
  return cols
}

function sheetLabel(name) {
  return KNOWN_SHEETS.find((k) => k.test.test(name))?.label ?? name
}

/** Parses one worksheet into normalised transaction records. Returns null if it has no recognisable header. */
export function parseSheet({ name, rows }) {
  const headerIndex = findHeader(rows)
  if (headerIndex < 0) return null
  const cols = mapColumns(rows[headerIndex])
  const get = (row, field) => (cols[field] == null ? null : row[cols[field]])

  const periodRow = rows.slice(0, headerIndex).find((r) => /^FROM/i.test(clean(r?.[0])))
  const period = periodRow
    ? {
        from: parseDate(periodRow.find((c, i) => i > 0 && parseDate(c))),
        to: parseDate([...periodRow].reverse().find((c) => parseDate(c))),
      }
    : { from: null, to: null }

  const records = []
  const issues = []
  let sheetTotals = null
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i] ?? []
    const first = clean(row[0])
    if (/^TOTAL/i.test(first)) {
      sheetTotals = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, cols[f] == null ? null : parseAmount(get(row, f))]))
      break
    }
    const voucher = clean(get(row, 'voucher'))
    const plate = clean(get(row, 'plate'))
    if (!voucher && !plate) continue
    const amounts = Object.fromEntries(AMOUNT_FIELDS.map((f) => [f, parseAmount(get(row, f))]))
    if (!plate) {
      if (AMOUNT_FIELDS.some((f) => amounts[f]))
        issues.push({ row: i + 1, message: 'Row has amounts but no plate number; left out of vehicle figures.' })
      continue
    }
    const rawDate = get(row, 'date')
    const date = parseDate(rawDate)
    if (rawDate != null && rawDate !== '' && !date) issues.push({ row: i + 1, message: `Unreadable date "${clean(rawDate)}".` })
    const kind = rowKind(voucher)
    records.push({
      sheet: name,
      row: i + 1,
      date,
      voucher: voucher || '(no voucher type)',
      kind,
      driver: clean(get(row, 'driver')),
      plate,
      plateKey: plateKey(plate),
      vehicleType: clean(get(row, 'vehicleType')),
      days: cols.days == null ? null : parseAmount(get(row, 'days')),
      owner: clean(get(row, 'owner')),
      ...amounts,
      status: kind === 'deployment' ? deploymentStatus(get(row, 'deploymentComment')) : null,
      deploymentComment: clean(get(row, 'deploymentComment')),
      technicalComment: clean(get(row, 'technicalComment')),
      fuelComment: clean(get(row, 'fuelComment')),
    })
  }
  const missing = ['date', 'voucher', 'plate', 'revenue'].filter((f) => cols[f] == null)
  return {
    name,
    label: sheetLabel(name),
    title: clean(rows[0]?.[0]),
    period,
    hasDays: cols.days != null,
    records,
    sheetTotals,
    issues,
    missing,
  }
}

export function parseWorkbook(sheets) {
  const parsed = []
  const skipped = []
  for (const s of sheets) {
    const p = parseSheet(s)
    if (p && p.records.length) parsed.push(p)
    else skipped.push(s.name)
  }
  return { sheets: parsed, skipped }
}

/* ---------- Aggregation ---------- */

const countMap = (map, key, by = 1) => map.set(key, (map.get(key) ?? 0) + by)
const topKey = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ''
const sortedEntries = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }))
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

/**
 * Builds every indicator from the records of the selected sheet(s).
 * `tzsRate` converts FUEL AMOUNT TZS to RWF (RWF per 1 TZS); without it TZS fuel is left out and flagged.
 */
export function summarize(sheets, { tzsRate = 0 } = {}) {
  const records = sheets.flatMap((s) => s.records.map((r) => ({ ...r, hasDays: s.hasDays })))
  const periodEnd =
    sheets
      .map((s) => s.period.to)
      .filter(Boolean)
      .sort()
      .at(-1) ??
    records
      .map((r) => r.date)
      .filter(Boolean)
      .sort()
      .at(-1) ??
    null

  const vehicles = new Map()
  const drivers = new Map()
  const statusByVoucher = new Map()
  const ongoing = []
  const daily = new Map()
  let tzsUnconverted = 0

  for (const r of records) {
    const fuel = r.fuel + (tzsRate > 0 ? r.fuelTzs * tzsRate : 0)
    if (!(tzsRate > 0)) tzsUnconverted += r.fuelTzs
    const mission = r.mission + r.extraMission
    const isDeployment = r.kind === 'deployment'
    const active = isDeployment && r.status !== 'cancelled'

    let v = vehicles.get(r.plateKey)
    if (!v) {
      v = {
        plateKey: r.plateKey,
        spellings: new Map(),
        sheets: new Set(),
        voucherTypes: new Map(),
        owners: new Map(),
        deploymentOwners: new Map(),
        vehicleTypes: new Map(),
        drivers: new Set(),
        dates: new Set(),
        deployments: 0,
        cancelled: 0,
        days: 0,
        daysEstimated: false,
        revenue: 0,
        ownersAmount: 0,
        ownersAmountGsl2: 0,
        mission: 0,
        fuel: 0,
        repair: 0,
        repairs: [],
        timeline: [],
      }
      vehicles.set(r.plateKey, v)
    }
    countMap(v.spellings, r.plate)
    v.sheets.add(r.sheet)
    countMap(v.voucherTypes, r.voucher)
    if (r.owner) countMap(isDeployment ? v.deploymentOwners : v.owners, r.owner)
    if (r.vehicleType) countMap(v.vehicleTypes, r.vehicleType)
    v.revenue += r.revenue
    v.ownersAmount += r.ownersAmount
    if (/GSL\s*2\b/i.test(r.voucher)) v.ownersAmountGsl2 += r.ownersAmount
    v.mission += mission
    v.fuel += fuel
    v.repair += r.repair
    if (r.kind === 'technical' || r.repair) v.repairs.push({ date: r.date, amount: r.repair, comment: r.technicalComment })

    if (r.date) {
      const d = daily.get(r.date) ?? { date: r.date, deployments: 0, revenue: 0, cost: 0 }
      if (isDeployment) d.deployments += 1
      d.revenue += r.revenue
      d.cost += r.ownersAmount + mission + fuel + r.repair
      daily.set(r.date, d)
    }

    if (isDeployment) {
      v.deployments += 1
      if (r.status === 'cancelled') v.cancelled += 1
      if (r.driver) v.drivers.add(r.driver)
      if (active) {
        if (r.hasDays) v.days += r.days ?? 0
        else if (r.date && !v.dates.has(r.date)) {
          v.dates.add(r.date)
          v.days += 1
          v.daysEstimated = true
        }
      }
      v.timeline.push({
        date: r.date,
        voucher: r.voucher,
        driver: r.driver,
        days: r.hasDays ? r.days : null,
        status: r.status,
        comment: r.deploymentComment,
        revenue: r.revenue,
        mission,
      })

      const sv = statusByVoucher.get(r.voucher) ?? Object.fromEntries([...STATUSES.map((s) => [s.key, 0]), ['total', 0]])
      sv[r.status] += 1
      sv.total += 1
      statusByVoucher.set(r.voucher, sv)

      if (r.status === 'notReturned')
        ongoing.push({
          plate: r.plate,
          plateKey: r.plateKey,
          driver: r.driver,
          owner: r.owner,
          voucher: r.voucher,
          date: r.date,
          days: r.hasDays ? r.days : null,
          daysSince: r.date && periodEnd ? daysBetween(r.date, periodEnd) : null,
        })
    }

    // Drivers: every deployment, plus any other row that carries a mission amount.
    if (isDeployment || mission) {
      const name = r.driver || 'Not recorded'
      const key = norm(name)
      const d = drivers.get(key) ?? { key, name, deployments: 0, days: 0, mission: 0, vehicles: new Set(), first: null, last: null }
      if (isDeployment) d.deployments += 1
      if (active && r.hasDays) d.days += r.days ?? 0
      d.mission += mission
      d.vehicles.add(r.plate)
      if (r.date) {
        if (!d.first || r.date < d.first) d.first = r.date
        if (!d.last || r.date > d.last) d.last = r.date
      }
      drivers.set(key, d)
    }
  }

  const vehicleRows = [...vehicles.values()].map((v) => {
    const owner = topKey(v.deploymentOwners) || topKey(v.owners)
    const allOwners = new Map([...v.owners])
    for (const [k, c] of v.deploymentOwners) countMap(allOwners, k, c)
    const cost = v.ownersAmount + v.mission + v.fuel + v.repair
    const profit = v.revenue - cost
    return {
      plateKey: v.plateKey,
      plate: topKey(v.spellings),
      spellings: [...v.spellings.keys()],
      sheets: [...v.sheets],
      vehicleType: topKey(v.vehicleTypes),
      voucherTypes: sortedEntries(v.voucherTypes),
      voucherTypeCount: v.voucherTypes.size,
      owner,
      ownerName: owner ? stripCode(owner) : '',
      owners: sortedEntries(allOwners).map((o) => ({ ...o, label: stripCode(o.name) })),
      ownerType: !owner ? 'unknown' : isCompanyOwner(owner) ? 'company' : 'subcontractor',
      drivers: [...v.drivers],
      deployments: v.deployments,
      cancelled: v.cancelled,
      days: v.days,
      daysEstimated: v.daysEstimated,
      revenue: v.revenue,
      ownersAmount: v.ownersAmount,
      ownersAmountGsl2: v.ownersAmountGsl2,
      mission: v.mission,
      fuel: v.fuel,
      repair: v.repair,
      repairs: v.repairs.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
      cost,
      profit,
      margin: v.revenue ? (profit / v.revenue) * 100 : null,
      timeline: v.timeline.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')),
    }
  })

  const driverRows = [...drivers.values()].map((d) => ({ ...d, vehicles: [...d.vehicles] }))

  const statusRows = [...statusByVoucher.entries()].map(([voucher, counts]) => ({ voucher, ...counts }))
  const statusTotals = Object.fromEntries(
    [...STATUSES.map((s) => s.key), 'total'].map((k) => [k, statusRows.reduce((sum, r) => sum + r[k], 0)]),
  )

  const sum = (f) => vehicleRows.reduce((s, v) => s + v[f], 0)
  const totals = {
    vehicles: vehicleRows.length,
    deployments: sum('deployments'),
    days: sum('days'),
    revenue: sum('revenue'),
    ownersAmount: sum('ownersAmount'),
    mission: sum('mission'),
    fuel: sum('fuel'),
    repair: sum('repair'),
    cost: sum('cost'),
    profit: sum('profit'),
  }
  totals.margin = totals.revenue ? (totals.profit / totals.revenue) * 100 : null

  return {
    periodEnd,
    vehicles: vehicleRows,
    drivers: driverRows,
    status: { rows: statusRows, totals: statusTotals },
    ongoing: ongoing.sort((a, b) => (b.daysSince ?? 0) - (a.daysSince ?? 0)),
    totals,
    tzsUnconverted,
    hasTzs: records.some((r) => r.fuelTzs),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
  }
}

/**
 * Compares our column sums with the sheet's own TOTAL AMT row, so the reader can trust the figures.
 * Returns [{ field, computed, sheet, ok }] for every amount column the TOTAL row filled in.
 */
export function reconcile(sheet) {
  if (!sheet.sheetTotals) return []
  return AMOUNT_FIELDS.filter((f) => sheet.sheetTotals[f] != null && (sheet.sheetTotals[f] !== 0 || sheet.records.some((r) => r[f]))).map(
    (field) => {
      const computed = sheet.records.reduce((s, r) => s + r[field], 0)
      const expected = sheet.sheetTotals[field]
      return { field, computed, sheet: expected, ok: Math.abs(computed - expected) < 1 }
    },
  )
}

export const FIELD_LABELS = {
  revenue: 'Revenue (institution / sales amount)',
  ownersAmount: 'Owners amount',
  mission: 'Mission',
  extraMission: 'Extra mileage mission',
  fuel: 'Fuel (RWF)',
  fuelTzs: 'Fuel (TZS)',
  repair: 'Repair & maintenance',
}
