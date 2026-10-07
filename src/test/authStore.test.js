import { beforeEach, describe, expect, it } from 'vitest'
import { http } from '@/api/client'
import { hasPermission, selectStatus, SESSION_STORAGE_KEY, useAuthStore } from '@/auth/authStore'
import { resetDb } from '@/api/mock/db'
import { DEMO_PASSWORD } from '@/api/mock/seed'

describe('auth store', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.getState().clearSession()
    resetDb()
  })

  it('starts anonymous and becomes authenticated after login', async () => {
    expect(selectStatus(useAuthStore.getState())).toBe('anonymous')
    const user = await useAuthStore.getState().login('fleet@limoz.rw', DEMO_PASSWORD)
    expect(user.role).toBe('FLEET_MANAGER')
    const state = useAuthStore.getState()
    expect(selectStatus(state)).toBe('authenticated')
    expect(state.accessToken).toBeTruthy()
    expect(state.refreshToken).toBeTruthy()
    expect(state.can('VEHICLE_CREATE')).toBe(true)
    expect(state.can('USER_MANAGE')).toBe(false)
    expect(state.can(['USER_MANAGE', 'VEHICLE_READ'])).toBe(true)
  })

  it('rejects bad credentials and leaves the session untouched', async () => {
    await expect(useAuthStore.getState().login('fleet@limoz.rw', 'wrong')).rejects.toMatchObject({ status: 401 })
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('persists only tokens and the user to localStorage', async () => {
    await useAuthStore.getState().login('admin@limoz.rw', DEMO_PASSWORD)
    const raw = JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY))
    expect(Object.keys(raw.state).sort()).toEqual(['accessToken', 'refreshToken', 'user'])
    expect(raw.state.user.email).toBe('admin@limoz.rw')
    expect(raw.state).not.toHaveProperty('expiredNotice')
  })

  it('attaches the token to requests and clears everything on logout', async () => {
    await useAuthStore.getState().login('viewer@limoz.rw', DEMO_PASSWORD)
    const me = await http.get('/auth/me')
    expect(me.email).toBe('viewer@limoz.rw')
    await useAuthStore.getState().logout()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.expiredNotice).toBe(false)
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).not.toContain('viewer@limoz.rw')
    await expect(http.get('/auth/me')).rejects.toMatchObject({ status: 401 })
  })

  it('flags an expired session when the refresh token is no longer valid', async () => {
    await useAuthStore.getState().login('dispatch@limoz.rw', DEMO_PASSWORD)
    useAuthStore.setState({ accessToken: 'eyJ.e30.bad', refreshToken: 'not-a-refresh-token' })
    await expect(http.get('/auth/me')).rejects.toMatchObject({ status: 401 })
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.expiredNotice).toBe(true)
    state.dismissExpiredNotice()
    expect(useAuthStore.getState().expiredNotice).toBe(false)
  })

  it('revalidates a stored session against the API', async () => {
    await useAuthStore.getState().login('finance@limoz.rw', DEMO_PASSWORD)
    useAuthStore.setState({ user: { ...useAuthStore.getState().user, name: 'Stale Name' } })
    const user = await useAuthStore.getState().revalidate()
    expect(user.name).not.toBe('Stale Name')
    expect(useAuthStore.getState().user.email).toBe('finance@limoz.rw')
  })

  it('hasPermission treats no requirement as "signed in is enough"', () => {
    const user = { permissions: ['A'] }
    expect(hasPermission(null, undefined)).toBe(false)
    expect(hasPermission(user, undefined)).toBe(true)
    expect(hasPermission(user, 'A')).toBe(true)
    expect(hasPermission(user, ['B', 'A'])).toBe(true)
    expect(hasPermission(user, 'B')).toBe(false)
  })
})
