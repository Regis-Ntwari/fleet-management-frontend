import { stripCode, summarize } from './analyze'

/**
 * Chart specs for the profitability analysis, in the same shape the server-side reports use
 * (rendered by ReportChart / ChartGrid), so they look and behave like every other report chart.
 */

const money = (key, label, extra) => ({ key, label, format: 'currencyCompact', ...extra })
const shortVoucher = (v) => v.replace(/^DEPLOYMENT\s+(OF\s+)?/i, '').trim() || v

export function buildCharts(sheets, analysis, { tzsRate = 0 } = {}) {
  const { totals, vehicles, drivers, status, daily } = analysis
  const charts = []

  // 1. Where each franc of revenue goes (KPI 11/19): cost components + what is left as profit.
  const split = [
    { label: 'Owner payments', value: totals.ownersAmount },
    { label: 'Driver missions', value: totals.mission },
    { label: 'Fuel', value: totals.fuel },
    { label: 'Repair & maintenance', value: totals.repair },
    { label: totals.profit >= 0 ? 'Profit' : 'Loss', value: Math.abs(totals.profit) },
  ].filter((d) => d.value > 0)
  charts.push({
    key: 'split',
    title: 'Where the revenue goes',
    subtitle: 'Costs and profit as a share of revenue',
    type: 'donut',
    data: split,
    series: [{ key: 'value', label: 'Revenue', format: 'currency' }],
  })

  // 2. Company-owned vs subcontracted (KPI 22), or per business when several sheets are combined.
  if (sheets.length > 1) {
    charts.push({
      key: 'by-sheet',
      title: 'Revenue, cost and profit by business',
      subtitle: 'One group per worksheet',
      type: 'bar',
      yAxisWidth: 56,
      x: { key: 'label' },
      data: sheets.map((s) => {
        const t = summarize([s], { tzsRate }).totals
        // Short names so the group labels fit under the bars on a phone.
        const label = s.label
          .replace(/\s*\(.*\)/, '')
          .replace(/^Limoz Rwanda /, 'Limoz ')
          .replace(/ Safaris$/, '')
        return { label, revenue: t.revenue, cost: t.cost, profit: t.profit }
      }),
      series: [money('revenue', 'Revenue'), money('cost', 'Operating cost'), money('profit', 'Profit')],
    })
  }
  const groups = [
    ['company', 'Company-owned'],
    ['subcontractor', 'Subcontracted'],
  ]
    .map(([type, label]) => {
      const vs = vehicles.filter((v) => v.ownerType === type)
      const sum = (f) => vs.reduce((s, v) => s + v[f], 0)
      return { label: `${label} (${vs.length})`, revenue: sum('revenue'), cost: sum('cost'), profit: sum('profit'), n: vs.length }
    })
    .filter((g) => g.n)
  if (groups.length)
    charts.push({
      key: 'ownership',
      title: 'Company-owned vs subcontracted vehicles',
      subtitle: 'Number of vehicles in brackets',
      type: 'bar',
      yAxisWidth: 56,
      x: { key: 'label' },
      data: groups,
      series: [money('revenue', 'Revenue'), money('cost', 'Operating cost'), money('profit', 'Profit')],
    })

  // 3. Most and least profitable vehicles (KPI 14 and 16).
  const active = vehicles.filter((v) => v.revenue || v.cost)
  charts.push({
    key: 'top-profit',
    title: 'Top 10 most profitable vehicles',
    subtitle: 'Profit after owner payments, missions, fuel and repairs',
    type: 'hbar',
    x: { key: 'plate' },
    data: [...active]
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 10)
      .map((v) => ({ plate: v.plate, profit: v.profit })),
    series: [money('profit', 'Profit')],
  })
  const worst = [...active].sort((a, b) => a.profit - b.profit).slice(0, 10)
  const losses = active.filter((v) => v.profit < 0).length
  charts.push({
    key: 'least-profit',
    title: 'Least profitable vehicles',
    subtitle: losses
      ? `${losses} vehicle${losses === 1 ? '' : 's'} ran at a loss (red); open a vehicle in the table to see why`
      : 'No vehicle ran at a loss in this selection',
    type: 'diverging',
    x: { key: 'plate' },
    data: worst.map((v) => ({ plate: v.plate, profit: v.profit })),
    series: [money('profit', 'Profit')],
  })

  // 4. Deployment status per voucher type (KPI 10).
  const statusSeries = [
    { key: 'returned', label: 'Returned / delivered', tone: 'success' },
    { key: 'notReturned', label: 'Not returned', tone: 'warning' },
    { key: 'cancelled', label: 'Cancelled', tone: 'danger' },
    { key: 'other', label: 'Other / no comment', tone: 'neutral' },
  ]
  const statusData = status.rows.map((r) => ({
    voucher: shortVoucher(r.voucher),
    returned: r.returned + r.delivered,
    notReturned: r.notReturned,
    cancelled: r.cancelled,
    other: r.other + r.none,
  }))
  charts.push({
    key: 'status',
    title: 'Deployment status by voucher type',
    subtitle: 'Number of deployments',
    type: 'hbar',
    stacked: true,
    x: { key: 'voucher' },
    data: statusData,
    series: statusSeries.filter((s) => statusData.some((d) => d[s.key])),
  })

  // 5. Activity through the month (KPI 29 context).
  charts.push({
    key: 'daily',
    title: 'Deployments per day',
    subtitle: 'Deployments recorded on each date',
    type: 'bar',
    x: { key: 'date', format: 'date' },
    data: daily.filter((d) => d.deployments),
    series: [{ key: 'deployments', label: 'Deployments' }],
  })

  // 6. Drivers with the highest mission totals (KPI 7 / 27).
  charts.push({
    key: 'drivers',
    title: 'Top 10 drivers by mission paid',
    subtitle: 'Mission and mileage-mission amounts',
    type: 'hbar',
    x: { key: 'name' },
    data: drivers
      .filter((d) => d.mission > 0 && d.name !== 'Not recorded')
      .sort((a, b) => b.mission - a.mission)
      .slice(0, 10)
      .map((d) => {
        const name = stripCode(d.name)
        return { name: name.length > 24 ? `${name.slice(0, 23)}…` : name, mission: d.mission }
      }),
    series: [money('mission', 'Mission')],
  })

  // 7. Vehicles with the biggest fuel and repair bills (KPI 8 / 9 / 20 / 21).
  charts.push({
    key: 'fuel-repair',
    title: 'Top 10 vehicles by fuel and repair cost',
    subtitle: 'Stacked: fuel and repair & maintenance',
    type: 'hbar',
    stacked: true,
    x: { key: 'plate' },
    data: [...vehicles]
      .filter((v) => v.fuel + v.repair > 0)
      .sort((a, b) => b.fuel + b.repair - (a.fuel + a.repair))
      .slice(0, 10)
      .map((v) => ({ plate: v.plate, fuel: v.fuel, repair: v.repair })),
    series: [money('fuel', 'Fuel'), money('repair', 'Repair & maintenance')],
  })

  // Half-width charts are ordered in pairs and the wide ones take a full row, so the grid has no gaps.
  const ORDER = ['split', 'ownership', 'by-sheet', 'top-profit', 'least-profit', 'status', 'drivers', 'fuel-repair', 'daily']
  const WIDE = new Set(['by-sheet', 'status', 'daily'])
  return charts.sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key)).map((c) => ({ ...c, span: WIDE.has(c.key) ? 2 : 1 }))
}
