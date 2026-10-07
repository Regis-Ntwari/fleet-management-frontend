import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { Providers } from '@/app/Providers'
import { router } from '@/routes/router'
import { useAuthStore } from '@/auth/authStore'
import { resetDb } from '@/api/mock/db'
import { queryClient } from '@/app/queryClient'
import { http } from '@/api/client'
import { DEMO_PASSWORD } from '@/api/mock/seed'
import { REPORTS } from '@/api/mock/handlers/reports'

async function signInAs(email) {
  const data = await http.post('/auth/login', { email, password: DEMO_PASSWORD }, { skipAuth: true, skipRefresh: true })
  useAuthStore.getState().setSession(data)
}

const renderAt = (path) =>
  render(
    <Providers>
      <RouterProvider router={createMemoryRouter(router.routes, { initialEntries: [path] })} />
    </Providers>,
  )

const CHART_TYPES = new Set(['line', 'area', 'bar', 'hbar', 'donut', 'diverging'])

describe('report visual summary contract', () => {
  beforeEach(async () => {
    localStorage.clear()
    queryClient.clear()
    resetDb()
    await signInAs('fleet@limoz.rw')
  })

  it('every report ships KPIs and well-formed chart specs', async () => {
    for (const def of REPORTS) {
      const params = def.supportsDateRange ? { from: '2026-09-01', to: '2026-10-07' } : { date: '2026-10-06' }
      const r = await http.get(`/reports/${def.key}`, { params })
      expect(r.summary, def.key).toBeTruthy()
      expect(r.summary.kpis.length, `${def.key} kpis`).toBeGreaterThanOrEqual(3)
      for (const k of r.summary.kpis) {
        expect(k.key && k.label && k.format, `${def.key} kpi ${k.key}`).toBeTruthy()
      }
      expect(r.summary.charts.length, `${def.key} charts`).toBeGreaterThanOrEqual(1)
      for (const c of r.summary.charts) {
        expect(CHART_TYPES.has(c.type), `${def.key}/${c.key} type ${c.type}`).toBe(true)
        expect([1, 2]).toContain(c.span)
        expect(Array.isArray(c.data)).toBe(true)
        expect(c.series.length).toBeGreaterThan(0)
        if (c.type === 'donut') {
          for (const d of c.data) expect(typeof d.value === 'number' && d.label, `${def.key}/${c.key}`).toBeTruthy()
        } else {
          expect(c.x?.key, `${def.key}/${c.key} needs a category axis`).toBeTruthy()
          // Stacked and multi-series charts never exceed the categorical palette.
          expect(c.series.length).toBeLessThanOrEqual(6)
          for (const row of c.data) {
            expect(row).toHaveProperty(c.x.key)
            for (const s of c.series) expect(row).toHaveProperty(s.key)
          }
        }
      }
    }
  })

  it('report view renders KPI tiles, charts and the detail table', async () => {
    renderAt('/reports/fleet-availability?from=2026-09-08&to=2026-10-07')
    expect(await screen.findByRole('heading', { name: /fleet availability/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/^Fleet size$/, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/availability over time/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /^detail$/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /preview pdf/i })).toBeInTheDocument()
  })

  it('print preview renders the designed document without the app shell', async () => {
    renderAt('/reports/vehicle-cost/print?from=2026-09-08&to=2026-10-07')
    expect(await screen.findByRole('heading', { level: 1, name: /vehicle cost/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(screen.getByText(/at a glance/i)).toBeInTheDocument()
    expect(screen.getByText(/^Charts$/)).toBeInTheDocument()
    expect(screen.getByText(/prepared by/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save as pdf/i })).toBeInTheDocument()
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  })
})
