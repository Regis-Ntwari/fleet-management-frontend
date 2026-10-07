import { useCallback, useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'
import { useAuthStore, hasPermission, selectStatus } from '@/auth/authStore'

/**
 * Session bootstrap. State itself lives in the Zustand store; this component
 * only revalidates the stored session once and clears cached queries on sign-out.
 */
export function AuthProvider({ children }) {
  const queryClient = useQueryClient()

  useEffect(() => {
    useAuthStore.getState().revalidate()
  }, [])

  useEffect(
    () =>
      useAuthStore.subscribe((state, prev) => {
        if (prev.user && !state.user) queryClient.clear()
      }),
    [queryClient],
  )

  return children
}

/** { user, status, login, logout, can, expiredNotice, dismissExpiredNotice } */
export function useAuth() {
  const { user, expiredNotice, login, logout, dismissExpiredNotice } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      expiredNotice: s.expiredNotice,
      login: s.login,
      logout: s.logout,
      dismissExpiredNotice: s.dismissExpiredNotice,
    })),
  )
  const status = useAuthStore(selectStatus)
  const can = useCallback((permission) => hasPermission(user, permission), [user])
  return { user, status, login, logout, can, expiredNotice, dismissExpiredNotice }
}

/** Renders children only when the current user holds the permission. */
export function Can({ permission, children, fallback = null }) {
  const allowed = useAuthStore((s) => hasPermission(s.user, permission))
  return allowed ? children : fallback
}
