import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { Providers } from '@/app/Providers'
import { buildCharts } from '@/features/reports/profitability/profitCharts'
import ProfitabilityAnalysisPage from '@/features/reports/profitability/ProfitabilityAnalysisPage'
import { readWorkbook } from '@/features/reports/profitability/xlsx'
import { parseDate, parseSheet, parseWorkbook, plateKey, reconcile, summarize } from '@/features/reports/profitability/analyze'

const header = [
  'DATE',
  'VOUCHER TYPE',
  'DRIVER NAME',
  'PLATE No',
  'NUMBER OF DAY',
  'OWNER',
  'INSTITUTION AMOUNT',
  'OWNERS AMOUNT',
  'MISSION',
  'FUEL',
  'REPAIR & MAINTENANCE',
  'DEPLOYMENT COMMENT',
  'TECHNICAL COMMENT',
  'Fuel COMMENT',
]
const sheet = {
  name: 'GLProfit Report',
  rows: [
    ['PROFITABILITY REPORT'],
    ['From:', '1-Oct-26', 'To', '31-Oct-26'],
    header,
    ['1-Oct-26', 'DEPLOYMENT GSL 1', 'ANNE', 'RAB 372H', 10, 'Gsl(Gorilland)', 1000, null, 100, null, null, 'Returned'],
    ['5-Oct-26', 'DEPLOYMENT GSL 2', 'BOB', 'RAB372H', 4, '421515 FLEEZ Ltd', 800, 600, null, null, null, 'NOT RETURNED'],
    ['6-Oct-26', 'DEPLOYMENT GSL 2', 'BOB', 'RAC 1', null, '421515 FLEEZ Ltd', null, null, null, null, null, 'CANCELLED'],
    ['7-Oct-26', 'FUEL REPORT', null, 'RAB 372 H', null, 'Gsl(Gorilland)', null, null, null, 150, null],
    ['8-Oct-26', 'TECHNICAL REPORT', null, 'RAB372H', null, null, null, null, null, null, 50, null, 'Brakes'],
    ['TOTAL AMT', null, null, null, null, null, '1,800.00', '600.00', '100.00', '150.00', '50.00'],
  ],
}

describe('profitability analysis', () => {
  it('parses dates and plates', () => {
    expect(parseDate('1-Oct-26')).toBe('2026-10-01')
    expect(parseDate(46296)).toBe('2026-10-01')
    expect(plateKey('RAB 372 H')).toBe(plateKey('RAB372H'))
  })

  it('aggregates per vehicle, driver and status', () => {
    const s = parseSheet(sheet)
    expect(s.period).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(s.records).toHaveLength(5)
    expect(reconcile(s).every((r) => r.ok)).toBe(true)

    const a = summarize([s])
    const v = a.vehicles.find((x) => x.plateKey === 'RAB372H')
    expect(v).toMatchObject({
      voucherTypeCount: 4,
      deployments: 2,
      days: 14,
      revenue: 1800,
      ownersAmount: 600,
      ownersAmountGsl2: 600,
      mission: 100,
      fuel: 150,
      repair: 50,
      profit: 900,
      ownerName: 'Gsl(Gorilland)',
    })
    expect(v.timeline.map((t) => t.driver)).toEqual(['ANNE', 'BOB'])
    expect(a.drivers.find((d) => d.name === 'ANNE').mission).toBe(100)
    expect(a.status.totals).toMatchObject({ returned: 1, notReturned: 1, cancelled: 1, total: 3 })
    expect(a.ongoing[0]).toMatchObject({ plateKey: 'RAB372H', daysSince: 26 })
  })

  const file = resolve(process.cwd(), 'LMZ GSL TRUCK REPORT OCTOBER.xlsx')
  it.skipIf(!existsSync(file))('reads the October workbook and matches its TOTAL rows', async () => {
    const buf = readFileSync(file)
    const sheets = await readWorkbook(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
    const wb = parseWorkbook(sheets)
    expect(wb.sheets.map((s) => s.records.length)).toEqual([39, 753, 179])
    for (const s of wb.sheets) expect(reconcile(s).filter((r) => !r.ok)).toEqual([])
    const a = summarize(wb.sheets)
    expect(Math.round(a.totals.revenue)).toBe(436509741)
    expect(a.status.totals).toMatchObject({ returned: 432, delivered: 28, notReturned: 82, cancelled: 8 })
    const charts = buildCharts(wb.sheets, a)
    expect(charts.map((c) => c.key)).toEqual([
      'split',
      'ownership',
      'by-sheet',
      'top-profit',
      'least-profit',
      'status',
      'drivers',
      'fuel-repair',
      'daily',
    ])
    expect(charts.every((c) => c.data.length > 0)).toBe(true)
    expect(charts.find((c) => c.key === 'least-profit').data[0].profit).toBeLessThan(0)
  })

  it.skipIf(!existsSync(file))(
    'renders the analysis after a workbook is dropped in',
    async () => {
      const user = userEvent.setup()
      render(
        <Providers>
          <MemoryRouter>
            <ProfitabilityAnalysisPage />
          </MemoryRouter>
        </Providers>,
      )
      const input = document.querySelector('input[type="file"]')
      await user.upload(input, new File([readFileSync(file)], 'LMZ GSL TRUCK REPORT OCTOBER.xlsx'))
      expect(await screen.findByText('Net profit')).toBeInTheDocument()
      expect(screen.getAllByText('RAF 964 W').length).toBeGreaterThan(0)
    },
    30000,
  )
})
