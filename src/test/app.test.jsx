import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { Providers } from '@/app/Providers'
import { router } from '@/routes/router'
import { useAuthStore } from '@/auth/authStore'
import { resetDb } from '@/api/mock/db'
import { queryClient } from '@/app/queryClient'
import { DEMO_PASSWORD } from '@/api/mock/seed'

function renderApp(initialPath = '/login') {
  const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [initialPath] })
  return render(
    <Providers>
      <RouterProvider router={memoryRouter} />
    </Providers>,
  )
}

describe('application shell', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    queryClient.clear()
    resetDb()
    window.matchMedia = window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
    window.ResizeObserver =
      window.ResizeObserver ||
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
  })

  it('redirects anonymous users to sign in, then shows the dashboard after login', async () => {
    const user = userEvent.setup()
    renderApp('/vehicles')
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    await user.type(screen.getByLabelText(/email/i), 'fleet@limoz.rw')
    await user.type(screen.getByLabelText(/^password/i), DEMO_PASSWORD)
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByRole('heading', { name: /^vehicles$/i }, { timeout: 5000 })).toBeInTheDocument()
    await waitFor(() => expect(screen.getAllByText(/RA[A-Z] \d{3} [A-Z]/).length).toBeGreaterThan(3), { timeout: 5000 })
  })

  it('shows a clear error for wrong credentials', async () => {
    const user = userEvent.setup()
    renderApp('/login')
    await user.type(await screen.findByLabelText(/email/i), 'fleet@limoz.rw')
    await user.type(screen.getByLabelText(/^password/i), 'nope')
    await user.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/email or password you entered is incorrect/i, {}, { timeout: 5000 })).toBeInTheDocument()
  })

  it('renders a 404 page for unknown routes', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'x',
      refreshToken: 'y',
      user: { id: 1, name: 'Regis Ngabo', email: 'admin@limoz.rw', role: 'SUPER_ADMIN', permissions: ['DASHBOARD_VIEW'] },
    })
    renderApp('/this/does/not/exist')
    expect(await screen.findByText(/page not found/i)).toBeInTheDocument()
  })

  it('blocks screens the role cannot access', async () => {
    useAuthStore.getState().setSession({
      accessToken: 'x',
      refreshToken: 'y',
      user: { id: 11, name: 'Grace Uwimana', email: 'viewer@limoz.rw', role: 'VIEWER', permissions: ['DASHBOARD_VIEW'] },
    })
    renderApp('/admin/users')
    expect(await screen.findByText(/you do not have access/i)).toBeInTheDocument()
  })
})
