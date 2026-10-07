import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import { REFERENCE } from './reference'

/**
 * Visual summary for every report, declared as data so the screen and the
 * server-rendered PDF draw the same KPIs and charts from the same payload.
 *
 *   summary: {
 *     kpis:   [{ key, label, value, format, hint?, tone? }],
 *     charts: [{ key, title, subtitle?, type, span, height?, x?, series, data, stacked? }]
 *   }
 *
 * Chart types: line | area | bar | hbar | donut | diverging.
 *   - `x`      : { key, format: 'date' | 'label' } — category axis for cartesian charts
 *   - `series` : [{ key, label, format, tone? }]. Without `tone` the series takes the
 *                categorical palette in fixed order; with `tone` it takes the reserved
 *                status colour (success | warning | danger | info | neutral).
 *   - donut    : data = [{ label, value, tone? }], one series describing `value`
 *   - diverging: one series; negative values are drawn to the left in `negativeTone`
 * Value formats: number | currency | percent | km | litres | minutes | kph.
 */

const r1 = (n) => Math.round(n * 10) / 10
const sum = (arr, fn) => arr.reduce((s, x) => s + (fn(x) ?? 0), 0)
const avg = (arr, fn) => (arr.length ? sum(arr, fn) / arr.length : 0)
const kpi = (key, label, value, fmt, extra = {}) => ({ key, label, value, format: fmt, ...extra })
const humanize = (v) => {
  const s = String(v ?? '')
    .replace(/_/g, ' ')
    .toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function countBy(items, fn) {
  const out = new Map()
  for (const it of items) {
    const k = fn(it)
    if (k == null) continue
    out.set(k, (out.get(k) ?? 0) + 1)
  }
  return out
}

/** Top-N rows by a numeric key, descending. */
const top = (rows, key, n = 10) =>
  [...rows]
    .filter((r) => (r[key] ?? 0) > 0)
    .sort((a, b) => (b[key] ?? 0) - (a[key] ?? 0))
    .slice(0, n)

/** Daily buckets, or weekly once the range exceeds ~9 weeks so bars stay readable. */
function buckets(from, to) {
  const start = parseISO(from)
  const end = parseISO(to)
  const weekly = differenceInCalendarDays(end, start) > 62
  const keys = []
  if (weekly) {
    for (let cur = startOfWeek(start, { weekStartsOn: 1 }); cur <= end; cur = addDays(cur, 7)) keys.push(format(cur, 'yyyy-MM-dd'))
  } else {
    for (let cur = start; cur <= end; cur = addDays(cur, 1)) keys.push(format(cur, 'yyyy-MM-dd'))
  }
  const keyOf = (iso) => {
    if (!iso) return null
    const d = parseISO(iso.slice(0, 10))
    return format(weekly ? startOfWeek(d, { weekStartsOn: 1 }) : d, 'yyyy-MM-dd')
  }
  return { keys, keyOf, weekly }
}

/** Time series: one row per bucket, `fill(itemsInBucket)` returns the measures. */
function timeSeries(from, to, items, dateOf, fill) {
  const { keys, keyOf, weekly } = buckets(from, to)
  const grouped = new Map(keys.map((k) => [k, []]))
  for (const it of items) {
    const k = keyOf(dateOf(it))
    if (grouped.has(k)) grouped.get(k).push(it)
  }
  return { weekly, data: keys.map((date) => ({ date, ...fill(grouped.get(date)) })) }
}

/** Stacked time series by an enum field, series ordered by reference order, folded to 5 + Other. */
function stackedByEnum(from, to, items, dateOf, fieldOf, refList, { tones = true, max = 5 } = {}) {
  const present = refList.filter((s) => items.some((i) => fieldOf(i) === s.value))
  const kept = present.slice(0, max)
  const rest = present.slice(max)
  const series = kept.map((s) => ({ key: s.value, label: s.label, format: 'number', ...(tones ? { tone: s.tone } : {}) }))
  if (rest.length) series.push({ key: '__other', label: 'Other', format: 'number', tone: 'neutral' })
  const restSet = new Set(rest.map((s) => s.value))
  const ts = timeSeries(from, to, items, dateOf, (bucket) => {
    const row = Object.fromEntries(series.map((s) => [s.key, 0]))
    for (const it of bucket) {
      const v = fieldOf(it)
      const k = restSet.has(v) ? '__other' : v
      if (k in row) row[k] += 1
    }
    return row
  })
  return { series, ...ts }
}

/** Donut data by enum field, folded to 5 + Other. `tones=false` uses the categorical palette. */
function donutByEnum(items, fieldOf, refList, { tones = true, max = 5 } = {}) {
  const counts = countBy(items, fieldOf)
  const ordered = refList.filter((s) => counts.has(s.value)).map((s) => ({ label: s.label, value: counts.get(s.value), tone: s.tone }))
  const extra = [...counts.keys()]
    .filter((k) => !refList.some((s) => s.value === k))
    .map((k) => ({ label: humanize(k), value: counts.get(k) }))
  const all = [...ordered, ...extra].sort((a, b) => b.value - a.value)
  const kept = all.slice(0, max).map((x) => (tones ? x : { label: x.label, value: x.value }))
  const rest = all.slice(max)
  if (rest.length) kept.push({ label: 'Other', value: sum(rest, (x) => x.value), tone: 'neutral' })
  return kept
}

const perLabel = (weekly) => (weekly ? 'per week' : 'per day')

export const summaries = {
  'daily-fleet': ({ rows, date }) => {
    const moved = rows.filter((r) => r.distanceKm > 0)
    const workshop = rows.filter((r) => r.status === 'IN_MAINTENANCE')
    const flagged = rows.filter((r) => r.remarks !== 'Normal')
    return {
      kpis: [
        kpi('fleet', 'Vehicles', rows.length, 'number'),
        kpi('moved', 'Moved', moved.length, 'number', { hint: `${rows.length - moved.length} did not move` }),
        kpi('workshop', 'In workshop', workshop.length, 'number', { tone: workshop.length ? 'warning' : undefined }),
        kpi('flagged', 'With remarks', flagged.length, 'number', { tone: flagged.length ? 'warning' : undefined }),
        kpi(
          'distance',
          'Distance',
          sum(rows, (r) => r.distanceKm),
          'km',
        ),
        kpi(
          'trips',
          'Trips',
          sum(rows, (r) => r.trips),
          'number',
        ),
      ],
      charts: [
        {
          key: 'status',
          title: 'Fleet status',
          subtitle: `Vehicles by status on ${format(parseISO(date), 'd MMM yyyy')}`,
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Vehicles', format: 'number' }],
          data: donutByEnum(rows, (r) => r.status, REFERENCE.vehicleStatuses, { tones: false }),
        },
        {
          key: 'distance',
          title: 'Distance by vehicle',
          subtitle: 'Ten vehicles that covered the most ground',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'distanceKm', label: 'Distance', format: 'km' }],
          data: top(rows, 'distanceKm', 10),
        },
      ],
    }
  },

  'fleet-availability': ({ rows }) => ({
    kpis: [
      kpi('fleet', 'Fleet size', rows[0]?.total ?? 0, 'number'),
      kpi('available', 'Avg available', r1(avg(rows, (r) => r.available)), 'number', { hint: 'vehicles per day' }),
      kpi('used', 'Avg used', r1(avg(rows, (r) => r.used)), 'number', { hint: 'vehicles per day' }),
      kpi('workshop', 'Avg in workshop', r1(avg(rows, (r) => r.inWorkshop)), 'number'),
      kpi('utilization', 'Utilization', r1(avg(rows, (r) => r.utilization)), 'percent', { hint: 'average over period' }),
      kpi(
        'trips',
        'Trips',
        sum(rows, (r) => r.trips),
        'number',
      ),
    ],
    charts: [
      {
        key: 'availability',
        title: 'Availability over time',
        subtitle: 'Available, used and in-workshop vehicles per day',
        type: 'line',
        span: 2,
        height: 260,
        x: { key: 'date', format: 'date' },
        series: [
          { key: 'available', label: 'Available', format: 'number' },
          { key: 'used', label: 'Used', format: 'number' },
          { key: 'inWorkshop', label: 'In workshop', format: 'number' },
        ],
        data: rows,
      },
      {
        key: 'utilization',
        title: 'Daily utilization',
        subtitle: 'Share of the operational fleet that moved each day',
        type: 'bar',
        span: 2,
        height: 200,
        x: { key: 'date', format: 'date' },
        series: [{ key: 'utilization', label: 'Utilization', format: 'percent' }],
        data: rows,
      },
    ],
  }),

  trips: ({ rows, from, to }) => {
    const completed = rows.filter((r) => r.status === 'COMPLETED')
    const withDuration = rows.filter((r) => r.durationMin != null)
    const stacked = stackedByEnum(
      from,
      to,
      rows,
      (r) => r.scheduledStartAt,
      (r) => r.status,
      REFERENCE.tripStatuses,
    )
    const byVehicle = [...countBy(rows, (r) => r.plateNumber).entries()].map(([plateNumber, trips]) => ({ plateNumber, trips }))
    return {
      kpis: [
        kpi('trips', 'Trips', rows.length, 'number'),
        kpi('completed', 'Completed', completed.length, 'number', {
          hint: rows.length ? `${Math.round((completed.length / rows.length) * 100)}% of trips` : undefined,
        }),
        kpi('cancelled', 'Cancelled', rows.filter((r) => r.status === 'CANCELLED').length, 'number'),
        kpi(
          'distance',
          'Distance',
          sum(rows, (r) => r.distanceKm),
          'km',
        ),
        kpi('duration', 'Avg duration', withDuration.length ? Math.round(avg(withDuration, (r) => r.durationMin)) : null, 'minutes'),
      ],
      charts: [
        {
          key: 'volume',
          title: `Trips ${perLabel(stacked.weekly)}`,
          subtitle: 'Scheduled trips by status',
          type: 'bar',
          stacked: true,
          span: 2,
          x: { key: 'date', format: 'date' },
          series: stacked.series,
          data: stacked.data,
        },
        {
          key: 'status',
          title: 'Trips by status',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Trips', format: 'number' }],
          data: donutByEnum(rows, (r) => r.status, REFERENCE.tripStatuses),
        },
        {
          key: 'vehicles',
          title: 'Busiest vehicles',
          subtitle: 'Trips per vehicle',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'trips', label: 'Trips', format: 'number' }],
          data: top(byVehicle, 'trips', 8),
        },
      ],
    }
  },

  'vehicle-movement': ({ rows, from, to }) => {
    const ts = timeSeries(
      from,
      to,
      rows,
      (r) => r.date,
      (b) => ({ distanceKm: sum(b, (r) => r.distanceKm), trips: sum(b, (r) => r.trips) }),
    )
    const byVehicle = Object.values(
      rows.reduce((acc, r) => {
        acc[r.plateNumber] ??= { plateNumber: r.plateNumber, distanceKm: 0 }
        acc[r.plateNumber].distanceKm += r.distanceKm
        return acc
      }, {}),
    )
    const flagCounts = countBy(
      rows.flatMap((r) => (r.flags === '—' ? [] : r.flags.split(', '))),
      (f) => f,
    )
    const flagged = rows.filter((r) => r.flags !== '—')
    return {
      kpis: [
        kpi(
          'distance',
          'Distance',
          sum(rows, (r) => r.distanceKm),
          'km',
        ),
        kpi(
          'driving',
          'Driving time',
          sum(rows, (r) => r.drivingMinutes),
          'minutes',
        ),
        kpi('days', 'Vehicle-days', rows.length, 'number', { hint: `${byVehicle.length} vehicles` }),
        kpi('flagged', 'Flagged days', flagged.length, 'number', { tone: flagged.length ? 'warning' : undefined }),
        kpi('speed', 'Top speed', rows.length ? Math.max(...rows.map((r) => r.maxSpeedKph ?? 0)) : null, 'kph'),
      ],
      charts: [
        {
          key: 'distance',
          title: `Fleet distance ${perLabel(ts.weekly)}`,
          type: 'area',
          span: 2,
          x: { key: 'date', format: 'date' },
          series: [{ key: 'distanceKm', label: 'Distance', format: 'km' }],
          data: ts.data,
        },
        {
          key: 'vehicles',
          title: 'Distance by vehicle',
          subtitle: 'Ten highest over the period',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'distanceKm', label: 'Distance', format: 'km' }],
          data: top(byVehicle, 'distanceKm', 10),
        },
        {
          key: 'flags',
          title: 'Exception flags',
          subtitle: 'Vehicle-days carrying each flag',
          type: 'hbar',
          span: 1,
          x: { key: 'flag', format: 'label' },
          series: [{ key: 'count', label: 'Days', format: 'number', tone: 'warning' }],
          data: ['Excessive hours', 'High distance', 'Night driving'].map((flag) => ({ flag, count: flagCounts.get(flag) ?? 0 })),
        },
      ],
    }
  },

  'driver-utilization': ({ rows }) => {
    const active = rows.filter((r) => r.trips > 0)
    const withRate = rows.filter((r) => r.onTimeRate != null)
    return {
      kpis: [
        kpi('drivers', 'Drivers', rows.length, 'number', { hint: `${active.length} active` }),
        kpi(
          'trips',
          'Trips',
          sum(rows, (r) => r.trips),
          'number',
        ),
        kpi(
          'distance',
          'Distance',
          sum(rows, (r) => r.distanceKm),
          'km',
        ),
        kpi('utilization', 'Avg utilization', r1(avg(active, (r) => r.utilization)), 'percent', { hint: 'days worked / days in period' }),
        kpi('ontime', 'On-time rate', withRate.length ? Math.round(avg(withRate, (r) => r.onTimeRate)) : null, 'percent'),
        kpi(
          'incidents',
          'Incidents',
          sum(rows, (r) => r.incidents),
          'number',
          {
            tone: sum(rows, (r) => r.incidents) ? 'danger' : undefined,
          },
        ),
      ],
      charts: [
        {
          key: 'trips',
          title: 'Trips by driver',
          subtitle: 'Ten most active drivers',
          type: 'hbar',
          span: 1,
          x: { key: 'driver', format: 'label' },
          series: [{ key: 'trips', label: 'Trips', format: 'number' }],
          data: top(rows, 'trips', 10),
        },
        {
          key: 'ontime',
          title: 'On-time rate',
          subtitle: 'Same drivers, share of trips started within 10 minutes',
          type: 'hbar',
          span: 1,
          x: { key: 'driver', format: 'label' },
          series: [{ key: 'onTimeRate', label: 'On-time', format: 'percent' }],
          data: top(rows, 'trips', 10).map((r) => ({ driver: r.driver, onTimeRate: r.onTimeRate ?? 0 })),
          domain: [0, 100],
        },
      ],
    }
  },

  maintenance: ({ rows, from, to }) => {
    const completed = rows.filter((r) => r.status === 'COMPLETED')
    const open = rows.filter((r) => !['COMPLETED', 'CANCELLED'].includes(r.status))
    const stacked = stackedByEnum(
      from,
      to,
      rows,
      (r) => r.reportedAt,
      (r) => r.type,
      REFERENCE.maintenanceTypes,
      { tones: false },
    )
    const byWorkshop = Object.values(
      rows.reduce((acc, r) => {
        acc[r.workshop] ??= { workshop: r.workshop, totalCost: 0 }
        acc[r.workshop].totalCost += r.totalCost ?? 0
        return acc
      }, {}),
    )
    return {
      kpis: [
        kpi('jobs', 'Jobs reported', rows.length, 'number'),
        kpi('completed', 'Completed', completed.length, 'number'),
        kpi('open', 'Still open', open.length, 'number', { tone: open.length ? 'warning' : undefined }),
        kpi(
          'cost',
          'Total cost',
          sum(rows, (r) => r.totalCost),
          'currency',
        ),
        kpi('avg', 'Avg per job', rows.length ? Math.round(avg(rows, (r) => r.totalCost)) : null, 'currency'),
      ],
      charts: [
        {
          key: 'volume',
          title: `Jobs reported ${perLabel(stacked.weekly)}`,
          subtitle: 'By maintenance type',
          type: 'bar',
          stacked: true,
          span: 2,
          x: { key: 'date', format: 'date' },
          series: stacked.series,
          data: stacked.data,
        },
        {
          key: 'status',
          title: 'Jobs by status',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Jobs', format: 'number' }],
          data: donutByEnum(rows, (r) => r.status, REFERENCE.maintenanceStatuses, { tones: false }),
        },
        {
          key: 'workshops',
          title: 'Cost by workshop',
          type: 'hbar',
          span: 1,
          x: { key: 'workshop', format: 'label' },
          series: [{ key: 'totalCost', label: 'Cost', format: 'currency' }],
          data: top(byWorkshop, 'totalCost', 8),
        },
      ],
    }
  },

  'maintenance-cost': ({ rows }) => {
    const total = sum(rows, (r) => r.totalCost)
    const parts = sum(rows, (r) => r.partsCost)
    const labour = sum(rows, (r) => r.laborCost)
    const other = sum(rows, (r) => r.otherCost)
    const jobs = sum(rows, (r) => r.jobs)
    return {
      kpis: [
        kpi('total', 'Total cost', total, 'currency'),
        kpi('parts', 'Parts', parts, 'currency', { hint: total ? `${Math.round((parts / total) * 100)}%` : undefined }),
        kpi('labour', 'Labour', labour, 'currency', { hint: total ? `${Math.round((labour / total) * 100)}%` : undefined }),
        kpi('other', 'Other', other, 'currency'),
        kpi('jobs', 'Completed jobs', jobs, 'number', { hint: `${rows.length} vehicles` }),
        kpi('avg', 'Avg per job', jobs ? Math.round(total / jobs) : null, 'currency'),
      ],
      charts: [
        {
          key: 'vehicles',
          title: 'Cost by vehicle',
          subtitle: 'Ten most expensive vehicles, split by cost type',
          type: 'hbar',
          stacked: true,
          span: 2,
          x: { key: 'plateNumber', format: 'label' },
          series: [
            { key: 'partsCost', label: 'Parts', format: 'currency' },
            { key: 'laborCost', label: 'Labour', format: 'currency' },
            { key: 'otherCost', label: 'Other', format: 'currency' },
          ],
          data: top(rows, 'totalCost', 10),
        },
        {
          key: 'split',
          title: 'Cost split',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Cost', format: 'currency' }],
          data: [
            { label: 'Parts', value: parts },
            { label: 'Labour', value: labour },
            { label: 'Other', value: other },
          ].filter((x) => x.value > 0),
        },
        {
          key: 'jobs',
          title: 'Jobs by vehicle',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'jobs', label: 'Jobs', format: 'number' }],
          data: top(rows, 'jobs', 8),
        },
      ],
    }
  },

  'upcoming-service': ({ rows }) => {
    const overdue = rows.filter((r) => r.state === 'OVERDUE')
    const dueSoon = rows.filter((r) => r.state === 'DUE_SOON')
    const withKm = rows.filter((r) => r.kmRemaining != null)
    return {
      kpis: [
        kpi('tasks', 'Tasks due', rows.length, 'number'),
        kpi('overdue', 'Overdue', overdue.length, 'number', { tone: overdue.length ? 'danger' : undefined }),
        kpi('soon', 'Due soon', dueSoon.length, 'number', { tone: dueSoon.length ? 'warning' : undefined }),
        kpi('vehicles', 'Vehicles affected', new Set(rows.map((r) => r.plateNumber)).size, 'number'),
      ],
      charts: [
        {
          key: 'km',
          title: 'Kilometres to next service',
          subtitle: 'Negative values are overdue',
          type: 'diverging',
          span: 2,
          x: { key: 'label', format: 'label' },
          series: [{ key: 'kmRemaining', label: 'Km left', format: 'km', tone: 'success' }],
          negativeTone: 'danger',
          data: [...withKm]
            .sort((a, b) => a.kmRemaining - b.kmRemaining)
            .slice(0, 14)
            .map((r) => ({ label: `${r.plateNumber} · ${r.task}`, kmRemaining: r.kmRemaining })),
        },
        {
          key: 'state',
          title: 'Overdue vs due soon',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Tasks', format: 'number' }],
          data: [
            { label: 'Overdue', value: overdue.length, tone: 'danger' },
            { label: 'Due soon', value: dueSoon.length, tone: 'warning' },
          ].filter((x) => x.value > 0),
        },
        {
          key: 'tasks',
          title: 'Tasks by type',
          type: 'hbar',
          span: 1,
          x: { key: 'task', format: 'label' },
          series: [{ key: 'count', label: 'Tasks', format: 'number' }],
          data: top(
            [...countBy(rows, (r) => r.task).entries()].map(([task, count]) => ({ task, count })),
            'count',
            8,
          ),
        },
      ],
    }
  },

  'fuel-consumption': ({ rows }) => {
    const litres = sum(rows, (r) => r.litres)
    const cost = sum(rows, (r) => r.cost)
    const distance = sum(rows, (r) => r.distanceKm)
    const byLitres = top(rows, 'litres', 10)
    return {
      kpis: [
        kpi('litres', 'Fuel', r1(litres), 'litres'),
        kpi('cost', 'Fuel cost', cost, 'currency'),
        kpi('distance', 'Distance', distance, 'km'),
        kpi('l100', 'Fleet L/100 km', distance ? r1((litres / distance) * 100) : null, 'number'),
        kpi('costkm', 'Cost per km', distance ? Math.round((cost / distance) * 100) / 100 : null, 'currency', { decimals: 2 }),
        kpi(
          'fills',
          'Fills',
          sum(rows, (r) => r.fills),
          'number',
          { hint: `${rows.length} vehicles` },
        ),
      ],
      charts: [
        {
          key: 'cost',
          title: 'Fuel cost by vehicle',
          subtitle: 'Ten highest spenders',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'cost', label: 'Cost', format: 'currency' }],
          data: top(rows, 'cost', 10),
        },
        {
          key: 'efficiency',
          title: 'Consumption vs expected',
          subtitle: 'L/100 km for the ten biggest fuel users',
          type: 'bar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [
            { key: 'l100', label: 'Actual', format: 'number' },
            { key: 'expectedL100', label: 'Expected', format: 'number', tone: 'neutral' },
          ],
          data: byLitres.map((r) => ({ plateNumber: r.plateNumber, l100: r.l100 ?? 0, expectedL100: r.expectedL100 ?? 0 })),
        },
      ],
    }
  },

  'fuel-variance': ({ rows }) => {
    const above = rows.filter((r) => r.variance > 0)
    const below = rows.filter((r) => r.variance < 0)
    const worst = rows.length ? rows.reduce((m, r) => (Math.abs(r.variance) > Math.abs(m.variance) ? r : m), rows[0]) : null
    const byVehicle = [...countBy(rows, (r) => r.plateNumber).entries()].map(([plateNumber, fills]) => ({ plateNumber, fills }))
    return {
      kpis: [
        kpi('fills', 'Fills flagged', rows.length, 'number'),
        kpi('above', 'Above tolerance', above.length, 'number', {
          tone: above.length ? 'danger' : undefined,
          hint: 'burning more than expected',
        }),
        kpi('below', 'Below tolerance', below.length, 'number', {
          tone: below.length ? 'info' : undefined,
          hint: 'possible odometer or fill issue',
        }),
        kpi('worst', 'Largest deviation', worst ? worst.variance : null, 'percent', { hint: worst ? worst.plateNumber : undefined }),
        kpi('litres', 'Litres involved', r1(sum(rows, (r) => r.litres)), 'litres'),
      ],
      charts: [
        {
          key: 'variance',
          title: 'Variance by fill',
          subtitle: 'Fifteen largest deviations from the expected rate',
          type: 'diverging',
          span: 2,
          x: { key: 'label', format: 'label' },
          series: [{ key: 'variance', label: 'Variance', format: 'percent', tone: 'danger' }],
          negativeTone: 'info',
          data: [...rows]
            .sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))
            .slice(0, 15)
            .sort((a, b) => b.variance - a.variance)
            .map((r) => ({ label: `${r.plateNumber} · ${format(parseISO(r.transactedAt), 'd MMM')}`, variance: r.variance })),
        },
        {
          key: 'vehicles',
          title: 'Flagged fills by vehicle',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'fills', label: 'Fills', format: 'number' }],
          data: top(byVehicle, 'fills', 8),
        },
        {
          key: 'direction',
          title: 'Direction of variance',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Fills', format: 'number' }],
          data: [
            { label: 'Above tolerance', value: above.length, tone: 'danger' },
            { label: 'Below tolerance', value: below.length, tone: 'info' },
          ].filter((x) => x.value > 0),
        },
      ],
    }
  },

  'vehicle-cost': ({ rows }) => {
    const total = sum(rows, (r) => r.totalCost)
    const fuel = sum(rows, (r) => r.fuelCost)
    const maintenance = sum(rows, (r) => r.maintenanceCost)
    const incidents = sum(rows, (r) => r.incidentCost)
    const distance = sum(rows, (r) => r.distanceKm)
    return {
      kpis: [
        kpi('total', 'Operating cost', total, 'currency'),
        kpi('fuel', 'Fuel', fuel, 'currency', { hint: total ? `${Math.round((fuel / total) * 100)}%` : undefined }),
        kpi('maintenance', 'Maintenance', maintenance, 'currency', {
          hint: total ? `${Math.round((maintenance / total) * 100)}%` : undefined,
        }),
        kpi('incidents', 'Incidents', incidents, 'currency', { hint: total ? `${Math.round((incidents / total) * 100)}%` : undefined }),
        kpi('distance', 'Distance', distance, 'km'),
        kpi('costkm', 'Cost per km', distance ? Math.round((total / distance) * 100) / 100 : null, 'currency', { decimals: 2 }),
      ],
      charts: [
        {
          key: 'vehicles',
          title: 'Cost by vehicle',
          subtitle: 'Ten most expensive vehicles, split by source',
          type: 'hbar',
          stacked: true,
          span: 2,
          x: { key: 'plateNumber', format: 'label' },
          series: [
            { key: 'fuelCost', label: 'Fuel', format: 'currency' },
            { key: 'maintenanceCost', label: 'Maintenance', format: 'currency' },
            { key: 'incidentCost', label: 'Incidents', format: 'currency' },
          ],
          data: top(rows, 'totalCost', 10),
        },
        {
          key: 'split',
          title: 'Where the money goes',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Cost', format: 'currency' }],
          data: [
            { label: 'Fuel', value: fuel },
            { label: 'Maintenance', value: maintenance },
            { label: 'Incidents', value: incidents },
          ].filter((x) => x.value > 0),
        },
        {
          key: 'costkm',
          title: 'Cost per kilometre',
          subtitle: 'Vehicles with the highest unit cost',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'costPerKm', label: 'Cost/km', format: 'currency', decimals: 2 }],
          data: top(rows, 'costPerKm', 8),
        },
      ],
    }
  },

  incidents: ({ rows, from, to }) => {
    const serious = rows.filter((r) => ['HIGH', 'CRITICAL'].includes(r.severity))
    const open = rows.filter((r) => ['OPEN', 'UNDER_INVESTIGATION'].includes(r.status))
    const stacked = stackedByEnum(
      from,
      to,
      rows,
      (r) => r.occurredAt,
      (r) => r.severity,
      REFERENCE.incidentSeverities,
    )
    const byVehicle = [...countBy(rows, (r) => r.plateNumber).entries()].map(([plateNumber, count]) => ({ plateNumber, count }))
    return {
      kpis: [
        kpi('incidents', 'Incidents', rows.length, 'number'),
        kpi('serious', 'High or critical', serious.length, 'number', { tone: serious.length ? 'danger' : undefined }),
        kpi('open', 'Open', open.length, 'number', { tone: open.length ? 'warning' : undefined, hint: 'open or under investigation' }),
        kpi(
          'cost',
          'Estimated cost',
          sum(rows, (r) => r.estimatedCost),
          'currency',
        ),
        kpi('drivers', 'Drivers involved', new Set(rows.map((r) => r.driver).filter((x) => x && x !== '—')).size, 'number'),
      ],
      charts: [
        {
          key: 'volume',
          title: `Incidents ${perLabel(stacked.weekly)}`,
          subtitle: 'By severity',
          type: 'bar',
          stacked: true,
          span: 2,
          x: { key: 'date', format: 'date' },
          series: stacked.series,
          data: stacked.data,
        },
        {
          key: 'type',
          title: 'Incidents by type',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Incidents', format: 'number' }],
          data: donutByEnum(rows, (r) => r.type, REFERENCE.incidentTypes, { tones: false }),
        },
        {
          key: 'vehicles',
          title: 'Incidents by vehicle',
          type: 'hbar',
          span: 1,
          x: { key: 'plateNumber', format: 'label' },
          series: [{ key: 'count', label: 'Incidents', format: 'number' }],
          data: top(byVehicle, 'count', 8),
        },
      ],
    }
  },

  'expired-documents': ({ rows }) => {
    const expired = rows.filter((r) => r.status === 'EXPIRED')
    const expiring = rows.filter((r) => r.status === 'EXPIRING_SOON')
    const bands = [
      { label: 'Expired', tone: 'danger', test: (d) => d < 0 },
      { label: '0–7 days', tone: 'danger', test: (d) => d >= 0 && d <= 7 },
      { label: '8–14 days', tone: 'warning', test: (d) => d > 7 && d <= 14 },
      { label: '15–30 days', tone: 'warning', test: (d) => d > 14 && d <= 30 },
      { label: '31+ days', tone: 'info', test: (d) => d > 30 },
    ]
    const types = REFERENCE.documentTypes.filter((t) => rows.some((r) => r.type === t.value))
    return {
      kpis: [
        kpi('documents', 'Documents', rows.length, 'number'),
        kpi('expired', 'Expired', expired.length, 'number', { tone: expired.length ? 'danger' : undefined }),
        kpi('expiring', 'Expiring soon', expiring.length, 'number', { tone: expiring.length ? 'warning' : undefined }),
        kpi('vehicle', 'Vehicle documents', rows.filter((r) => r.ownerType === 'VEHICLE').length, 'number'),
        kpi('driver', 'Driver documents', rows.filter((r) => r.ownerType === 'DRIVER').length, 'number'),
      ],
      charts: [
        {
          key: 'timeline',
          title: 'Expiry timeline',
          subtitle: 'Documents by days until expiry',
          type: 'bar',
          span: 2,
          height: 200,
          x: { key: 'band', format: 'label' },
          series: [{ key: 'count', label: 'Documents', format: 'number', tone: 'warning' }],
          data: bands.map((b) => ({ band: b.label, count: rows.filter((r) => b.test(r.daysToExpiry)).length, tone: b.tone })),
          colorByRow: true,
        },
        {
          key: 'types',
          title: 'By document type',
          type: 'hbar',
          stacked: true,
          span: 1,
          x: { key: 'type', format: 'label' },
          series: [
            { key: 'expired', label: 'Expired', format: 'number', tone: 'danger' },
            { key: 'expiring', label: 'Expiring soon', format: 'number', tone: 'warning' },
          ],
          data: types.map((t) => ({
            type: t.label,
            expired: expired.filter((r) => r.type === t.value).length,
            expiring: expiring.filter((r) => r.type === t.value).length,
          })),
        },
        {
          key: 'owners',
          title: 'Vehicle vs driver',
          type: 'donut',
          span: 1,
          series: [{ key: 'value', label: 'Documents', format: 'number' }],
          data: [
            { label: 'Vehicle documents', value: rows.filter((r) => r.ownerType === 'VEHICLE').length },
            { label: 'Driver documents', value: rows.filter((r) => r.ownerType === 'DRIVER').length },
          ].filter((x) => x.value > 0),
        },
      ],
    }
  },
}

export function buildSummary(key, ctx) {
  const build = summaries[key]
  if (!build) return null
  const s = build(ctx)
  return { ...s, charts: s.charts.filter((c) => c.data.length > 0 || c.type !== 'donut') }
}
