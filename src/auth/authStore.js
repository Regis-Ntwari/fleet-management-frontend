import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { configureAuth, http } from '@/api/client'

export const SESSION_STORAGE_KEY = 'limoz.session'

const toUser = (u) => (u ? { id: u.id, name: u.name, email: u.email, role: u.role, permissions: u.permissions ?? [] } : null)

/** True when the user holds any of the given permission(s). No permission means "signed in is enough". */
export function hasPermission(user, permission) {
  if (!user) return false
  if (!permission) return true
  const list = Array.isArray(permission) ? permission : [permission]
  return list.some((p) => user.permissions?.includes(p))
}

/**
 * Authentication state. Tokens and the signed-in user persist to localStorage so
 * a reload does not force a new sign-in; everything else is in-memory only.
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      expiredNotice: false,

      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user: toUser(user), expiredNotice: false }),
      setUser: (user) => set({ user: toUser(user) }),
      clearSession: (expired = false) => set({ accessToken: null, refreshToken: null, user: null, expiredNotice: expired }),
      dismissExpiredNotice: () => set({ expiredNotice: false }),

      can: (permission) => hasPermission(get().user, permission),

      login: async (email, password) => {
        const data = await http.post('/auth/login', { email, password }, { skipAuth: true, skipRefresh: true })
        get().setSession(data)
        return get().user
      },

      logout: async () => {
        const { refreshToken } = get()
        try {
          await http.post('/auth/logout', { refreshToken }, { skipRefresh: true })
        } catch {
          /* the session is cleared locally regardless */
        }
        get().clearSession(false)
      },

      /** Re-checks the stored session against the API once on load. */
      revalidate: async () => {
        if (!get().user) return null
        try {
          const me = await http.get('/auth/me')
          get().setUser(me)
          return get().user
        } catch (e) {
          if (e?.isAuth) get().clearSession(true)
          return null
        }
      },
    }),
    {
      name: SESSION_STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
    },
  ),
)

export const selectUser = (s) => s.user
export const selectStatus = (s) => (s.user ? 'authenticated' : 'anonymous')

// The HTTP client stays auth-agnostic; the store tells it where tokens live.
configureAuth({
  getAccessToken: () => useAuthStore.getState().accessToken,
  getRefreshToken: () => useAuthStore.getState().refreshToken,
  onRefreshed: (session) => useAuthStore.getState().setSession(session),
  onSessionExpired: () => useAuthStore.getState().clearSession(true),
})
