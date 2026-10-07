import { Navigate, useLocation } from 'react-router'
import { useAuth } from '@/app/AuthProvider'
import { ForbiddenPage } from '@/pages/ErrorPage'

export function RequireAuth({ children }) {
  const { status } = useAuth()
  const location = useLocation()
  if (status !== 'authenticated') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  return children
}

/** Route-level permission gate. The backend enforces the same rule; this just avoids a dead screen. */
export function RequirePermission({ permission, children }) {
  const { can } = useAuth()
  if (!can(permission)) return <ForbiddenPage />
  return children
}
