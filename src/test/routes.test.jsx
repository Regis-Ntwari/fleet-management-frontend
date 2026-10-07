import { beforeEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { Providers } from '@/app/Providers'
import { router } from '@/routes/router'
import { useAuthStore } from '@/auth/authStore'
import { getDb, resetDb } from '@/api/mock/db'
import { queryClient } from '@/app/queryClient'
import { DEMO_PASSWORD } from '@/api/mock/seed'

/** Every screen mounts against the mock API without hitting the page error boundary. */
const SCREENS = (db) => [
  ['/', /dashboard/i],
  ['/alerts', /alert centre/i],
  ['/dispatch', /^dispatch$/i],
  ['/daily-position', /daily position/i],
  ['/vehicles', /^vehicles$/i],
  ['/vehicles/new', /add vehicle/i],
  [`/vehicles/${db.vehicles[0].id}`, db.vehicles[0].plateNumber],
  [`/vehicles/${db.vehicles[0].id}/edit`, /^edit /i],
  ['/drivers', /^drivers$/i],
  ['/drivers/new', /add driver/i],
  [`/drivers/${db.drivers[0].id}`, db.drivers[0].fullName],
  ['/assignments', /vehicle assignments/i],
  ['/documents', /documents/i],
  ['/trips', /^trips$/i],
  ['/trips/new', /plan trip/i],
  [`/trips/${db.trips[0].id}`, db.trips[0].tripNumber],
  ['/bookings', /^bookings$/i],
  ['/bookings/new', /new booking/i],
  [`/bookings/${db.bookings[0].id}`, db.bookings[0].bookingNumber],
  ['/fuel', /^fuel$/i],
  ['/fuel/new', /record fuel/i],
  ['/incidents', /^incidents$/i],
  ['/incidents/new', /report incident/i],
  [`/incidents/${db.incidents[0].id}`, db.incidents[0].incidentNumber],
  ['/maintenance', /^maintenance$/i],
  ['/maintenance/new', /report maintenance/i],
  ['/maintenance/schedules', /service schedules/i],
  [`/maintenance/${db.maintenance[0].id}`, db.maintenance[0].maintenanceNumber],
  ['/parts', /spare parts/i],
  ['/reports', /^reports$/i],
  ['/reports/daily-fleet', /daily fleet/i],
  ['/admin/users', /^users$/i],
  ['/admin/audit', /audit log/i],
  ['/admin/imports', /import data/i],
  ['/settings', /^settings$/i],
]

describe('every screen renders on MUI', () => {
  beforeEach(async () => {
    localStorage.clear()
    queryClient.clear()
    resetDb()
    await useAuthStore.getState().login('admin@limoz.rw', DEMO_PASSWORD)
  })

  it('mounts all routes as an administrator without a page crash', async () => {
    const db = getDb()
    expect(db.vehicles.length).toBeGreaterThan(0)
    for (const [path, heading] of SCREENS(db)) {
      const view = render(
        <Providers>
          <RouterProvider router={createMemoryRouter(router.routes, { initialEntries: [path] })} />
        </Providers>,
      )
      await waitFor(
        () => expect(screen.getAllByRole('heading', { name: heading }).length, `heading ${heading} on ${path}`).toBeGreaterThan(0),
        { timeout: 8000 },
      )
      expect(screen.queryByText(/this page crashed/i), path).not.toBeInTheDocument()
      expect(screen.queryByText(/page not found/i), path).not.toBeInTheDocument()
      view.unmount()
      queryClient.clear()
    }
  }, 120_000)
})
