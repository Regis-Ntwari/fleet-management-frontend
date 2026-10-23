import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/components/layout/AppShell'
import { LoginPage } from '@/pages/LoginPage'
import { NotFoundPage, RouteErrorPage, ForbiddenPage } from '@/pages/ErrorPage'
import { RequireAuth, RequirePermission } from './guards'
import { PageSpinner } from '@/components/ui/Feedback'
import { useAuth } from '@/app/AuthProvider'
import { DRIVER_WORKSPACE_PERMISSIONS } from './nav'

const page = (loader, permission) => {
  const Component = lazy(loader)
  const element = (
    <Suspense fallback={<PageSpinner />}>
      <Component />
    </Suspense>
  )
  return permission ? <RequirePermission permission={permission}>{element}</RequirePermission> : element
}

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))

/** The landing page depends on the role: office staff get the dashboard, drivers their workspace. */
function Home() {
  const { can, user } = useAuth()
  if (can('DASHBOARD_VIEW'))
    return (
      <Suspense fallback={<PageSpinner />}>
        <DashboardPage />
      </Suspense>
    )
  if (can(DRIVER_WORKSPACE_PERMISSIONS) && user?.driverId) return <Navigate to="/my-trips" replace />
  if (can('GATE_RECORD')) return <Navigate to="/gate" replace />
  if (can('ORDER_READ')) return <Navigate to="/commerce" replace />
  return <ForbiddenPage />
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage />, errorElement: <RouteErrorPage /> },
  {
    // Printable report document: no app shell so the page prints as a clean A4 sheet.
    path: '/reports/:key/print',
    element: <RequireAuth>{page(() => import('@/features/reports/ReportPrintPage'), 'REPORT_VIEW')}</RequireAuth>,
    errorElement: <RouteErrorPage />,
  },
  {
    // Printable road map: no app shell so it prints as the company's A4 form.
    path: '/deployments/:id/road-map',
    element: <RequireAuth>{page(() => import('@/features/deployments/RoadMapPage'), ['DEPLOYMENT_READ', 'DEPLOYMENT_START'])}</RequireAuth>,
    errorElement: <RouteErrorPage />,
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Home /> },
      { path: 'my-trips', element: page(() => import('@/features/driver/MyDayPage'), DRIVER_WORKSPACE_PERMISSIONS) },
      { path: 'my-day', element: <Navigate to="/my-trips" replace /> },
      { path: 'gate', element: page(() => import('@/features/gate/GatePage'), ['GATE_RECORD', 'DEPLOYMENT_MANAGE']) },
      { path: 'alerts', element: page(() => import('@/features/alerts/AlertsPage'), 'DASHBOARD_VIEW') },
      { path: 'dispatch', element: page(() => import('@/features/dispatch/DispatchPage'), 'DISPATCH_VIEW') },
      { path: 'daily-position', element: page(() => import('@/features/dashboard/DailyPositionPage'), 'DASHBOARD_VIEW') },

      { path: 'vehicles', element: page(() => import('@/features/vehicles/VehiclesPage'), 'VEHICLE_READ') },
      { path: 'vehicles/new', element: page(() => import('@/features/vehicles/VehicleFormPage'), 'VEHICLE_CREATE') },
      { path: 'vehicles/:id', element: page(() => import('@/features/vehicles/VehicleDetailPage'), 'VEHICLE_READ') },
      { path: 'vehicles/:id/edit', element: page(() => import('@/features/vehicles/VehicleFormPage'), 'VEHICLE_UPDATE') },

      { path: 'drivers', element: page(() => import('@/features/drivers/DriversPage'), 'DRIVER_READ') },
      { path: 'drivers/new', element: page(() => import('@/features/drivers/DriverFormPage'), 'DRIVER_MANAGE') },
      { path: 'drivers/:id', element: page(() => import('@/features/drivers/DriverDetailPage'), 'DRIVER_READ') },
      { path: 'drivers/:id/edit', element: page(() => import('@/features/drivers/DriverFormPage'), 'DRIVER_MANAGE') },

      { path: 'assignments', element: page(() => import('@/features/assignments/AssignmentsPage'), 'VEHICLE_READ') },
      { path: 'documents', element: page(() => import('@/features/documents/DocumentsPage'), 'DOCUMENT_READ') },

      { path: 'deployments', element: page(() => import('@/features/deployments/DeploymentsPage'), 'DEPLOYMENT_READ') },
      { path: 'deployments/new', element: page(() => import('@/features/deployments/DeploymentFormPage'), 'DEPLOYMENT_MANAGE') },
      {
        path: 'deployments/:id',
        element: page(() => import('@/features/deployments/DeploymentDetailPage'), ['DEPLOYMENT_READ', 'DEPLOYMENT_START']),
      },
      { path: 'deployments/:id/edit', element: page(() => import('@/features/deployments/DeploymentFormPage'), 'DEPLOYMENT_MANAGE') },

      { path: 'commerce', element: page(() => import('@/features/commerce/PurchaseOrdersPage'), ['ORDER_READ', 'ORDER_MANAGE']) },
      { path: 'commerce/new', element: page(() => import('@/features/commerce/PurchaseOrderFormPage'), 'ORDER_MANAGE') },
      { path: 'commerce/:id', element: page(() => import('@/features/commerce/PurchaseOrderDetailPage'), ['ORDER_READ', 'ORDER_MANAGE']) },
      { path: 'commerce/:id/edit', element: page(() => import('@/features/commerce/PurchaseOrderFormPage'), 'ORDER_MANAGE') },

      { path: 'bookings', element: page(() => import('@/features/bookings/BookingsPage'), 'BOOKING_READ') },
      { path: 'bookings/new', element: page(() => import('@/features/bookings/BookingFormPage'), 'BOOKING_MANAGE') },
      { path: 'bookings/:id', element: page(() => import('@/features/bookings/BookingDetailPage'), 'BOOKING_READ') },
      { path: 'bookings/:id/edit', element: page(() => import('@/features/bookings/BookingFormPage'), 'BOOKING_MANAGE') },

      { path: 'fuel', element: page(() => import('@/features/fuel/FuelPage'), 'FUEL_READ') },
      { path: 'fuel/new', element: page(() => import('@/features/fuel/FuelFormPage'), 'FUEL_MANAGE') },
      {
        path: 'fuel/allocations/:id',
        element: page(() => import('@/features/fuel/FuelAllocationDetailPage'), ['FUEL_READ', 'FUEL_SUBMIT']),
      },
      { path: 'fuel/:id/edit', element: page(() => import('@/features/fuel/FuelFormPage'), 'FUEL_MANAGE') },

      { path: 'incidents', element: page(() => import('@/features/incidents/IncidentsPage'), 'INCIDENT_READ') },
      { path: 'incidents/new', element: page(() => import('@/features/incidents/IncidentFormPage'), 'INCIDENT_MANAGE') },
      { path: 'incidents/:id', element: page(() => import('@/features/incidents/IncidentDetailPage'), 'INCIDENT_READ') },
      { path: 'incidents/:id/edit', element: page(() => import('@/features/incidents/IncidentFormPage'), 'INCIDENT_MANAGE') },

      { path: 'maintenance', element: page(() => import('@/features/maintenance/MaintenancePage'), 'MAINTENANCE_READ') },
      { path: 'maintenance/new', element: page(() => import('@/features/maintenance/MaintenanceFormPage'), 'MAINTENANCE_MANAGE') },
      { path: 'maintenance/schedules', element: page(() => import('@/features/maintenance/SchedulesPage'), 'MAINTENANCE_READ') },
      { path: 'maintenance/:id', element: page(() => import('@/features/maintenance/MaintenanceDetailPage'), 'MAINTENANCE_READ') },
      { path: 'maintenance/:id/edit', element: page(() => import('@/features/maintenance/MaintenanceFormPage'), 'MAINTENANCE_MANAGE') },
      { path: 'parts', element: page(() => import('@/features/maintenance/PartsPage'), 'MAINTENANCE_READ') },

      { path: 'reports', element: page(() => import('@/features/reports/ReportsPage'), 'REPORT_VIEW') },
      { path: 'reports/:key', element: page(() => import('@/features/reports/ReportViewPage'), 'REPORT_VIEW') },

      { path: 'admin/users', element: page(() => import('@/features/admin/UsersPage'), 'USER_MANAGE') },
      { path: 'admin/roles', element: page(() => import('@/features/admin/RolesPage'), 'ROLE_MANAGE') },
      { path: 'admin/departments', element: page(() => import('@/features/admin/DepartmentsPage'), 'DEPARTMENT_MANAGE') },
      { path: 'admin/reference', element: page(() => import('@/features/admin/ReferenceDataPage'), 'REFERENCE_MANAGE') },
      { path: 'admin/audit', element: page(() => import('@/features/admin/AuditPage'), 'AUDIT_VIEW') },
      {
        path: 'admin/imports',
        element: page(() => import('@/features/admin/ImportsPage'), ['VEHICLE_CREATE', 'DRIVER_MANAGE', 'FUEL_MANAGE']),
      },
      { path: 'settings', element: page(() => import('@/features/settings/SettingsPage')) },

      { path: 'admin', element: <Navigate to="/admin/users" replace /> },
      { path: '403', element: <ForbiddenPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
