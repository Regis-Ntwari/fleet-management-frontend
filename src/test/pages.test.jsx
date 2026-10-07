import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { Providers } from '@/app/Providers'
import { router } from '@/routes/router'
import { useAuthStore } from '@/auth/authStore'
import { getDb, resetDb } from '@/api/mock/db'
import { queryClient } from '@/app/queryClient'
import { http } from '@/api/client'
import { DEMO_PASSWORD } from '@/api/mock/seed'

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

describe('key screens mount against the mock API', () => {
  beforeEach(async () => {
    localStorage.clear()
    queryClient.clear()
    resetDb()
    await signInAs('fleet@limoz.rw')
  })

  it('dashboard renders KPIs from the API', async () => {
    renderAt('/')
    expect(await screen.findByRole('heading', { name: /dashboard/i }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/^Total vehicles$/i, {}, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByText(/needs attention/i, {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('vehicle detail renders profile, tabs and telematics', async () => {
    const v = getDb().vehicles[0]
    renderAt(`/vehicles/${v.id}`)
    expect(await screen.findByRole('heading', { name: v.plateNumber }, { timeout: 5000 })).toBeInTheDocument()
    expect(await screen.findByRole('tab', { name: /documents/i })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: /telematics/i }, { timeout: 5000 })).toBeInTheDocument()
  })

  it('dispatch board and reports list load', async () => {
    renderAt('/dispatch')
    expect(await screen.findByText(/current trips/i, {}, { timeout: 5000 })).toBeInTheDocument()
    renderAt('/reports')
    expect(await screen.findByText(/daily fleet report/i, {}, { timeout: 5000 })).toBeInTheDocument()
  })
})
