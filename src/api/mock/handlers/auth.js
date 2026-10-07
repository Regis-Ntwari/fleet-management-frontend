import { get, post } from '../router'
import { getDb, persist } from '../db'
import { badRequest, ROLE_PERMISSIONS, unauthorized } from '../core'
import { recordAudit, toUser } from '../mappers'
const ACCESS_TTL_SECONDS = 30 * 60
const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60
const revoked = new Set()
export function issueToken(kind, userId) {
  const ttl = kind === 'access' ? ACCESS_TTL_SECONDS : REFRESH_TTL_SECONDS
  const exp = Math.floor(Date.now() / 1000) + ttl
  const nonce = Math.random().toString(36).slice(2, 10)
  // Shaped like a JWT so the frontend treats it exactly as it will treat the real one.
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
  const payload = btoa(JSON.stringify({ sub: userId, kind, exp, jti: nonce }))
  return `${header}.${payload}.mock`
}
export function parseToken(token) {
  if (!token) return null
  try {
    const [, payload] = token.split('.')
    const parsed = JSON.parse(atob(payload))
    if (revoked.has(parsed.jti)) return null
    if (parsed.exp * 1000 < Date.now()) return null
    return { userId: parsed.sub, kind: parsed.kind, exp: parsed.exp, jti: parsed.jti }
  } catch {
    return null
  }
}
export function toAuthUser(u) {
  return { id: u.id, name: `${u.firstName} ${u.lastName}`, email: u.email, role: u.role, permissions: ROLE_PERMISSIONS[u.role] }
}
function buildLogin(u) {
  return {
    accessToken: issueToken('access', u.id),
    refreshToken: issueToken('refresh', u.id),
    expiresIn: ACCESS_TTL_SECONDS,
    user: toAuthUser(u),
  }
}
post(
  '/auth/login',
  ({ body }) => {
    const { email, password } = body ?? {}
    if (!email || !password)
      throw badRequest('Email and password are required.', [
        ...(!email ? [{ field: 'email', message: 'Email is required.' }] : []),
        ...(!password ? [{ field: 'password', message: 'Password is required.' }] : []),
      ])
    const u = getDb().users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase())
    if (!u || u.password !== password) throw unauthorized('The email or password you entered is incorrect.')
    if (!u.active) throw unauthorized('This account has been deactivated. Contact your IT administrator.')
    u.lastLoginAt = new Date().toISOString()
    recordAudit({
      userId: u.id,
      userName: `${u.firstName} ${u.lastName}`,
      action: 'LOGIN',
      entityType: 'SESSION',
      entityId: null,
      entityLabel: null,
      changes: null,
    })
    persist()
    return buildLogin(u)
  },
  { public: true },
)
post(
  '/auth/refresh',
  ({ body }) => {
    const { refreshToken } = body ?? {}
    const parsed = parseToken(refreshToken)
    if (!parsed || parsed.kind !== 'refresh') throw unauthorized('Your session has expired. Please sign in again.')
    const u = getDb().users.find((x) => x.id === parsed.userId)
    if (!u || !u.active) throw unauthorized('Your session is no longer valid.')
    revoked.add(parsed.jti)
    return buildLogin(u)
  },
  { public: true },
)
post(
  '/auth/logout',
  ({ headers, body }) => {
    const access = parseToken(headers.authorization?.replace(/^Bearer\s+/i, ''))
    if (access) revoked.add(access.jti)
    const { refreshToken } = body ?? {}
    const refresh = parseToken(refreshToken)
    if (refresh) revoked.add(refresh.jti)
    return null
  },
  { public: true },
)
get('/auth/me', ({ user }) => {
  if (!user) throw unauthorized()
  return { ...toAuthUser(user), profile: toUser(user) }
})
post('/auth/change-password', ({ user, body }) => {
  if (!user) throw unauthorized()
  const { currentPassword, newPassword } = body ?? {}
  if (user.password !== currentPassword)
    throw badRequest('Current password is incorrect.', [{ field: 'currentPassword', message: 'Incorrect password.' }])
  if (!newPassword || newPassword.length < 10)
    throw badRequest('New password must be at least 10 characters.', [{ field: 'newPassword', message: 'Use at least 10 characters.' }])
  user.password = newPassword
  user.updatedAt = new Date().toISOString()
  persist()
  return null
})
