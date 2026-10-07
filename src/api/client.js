import axios from 'axios'
import { config } from '@/config/env'

const BASE_URL = `${config.apiBaseUrl}/api/v1`

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 20_000,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
})

if (config.useMockApi) {
  const { mockAdapter } = await import('./mock')
  api.defaults.adapter = mockAdapter
}

export const isMockApi = config.useMockApi

/**
 * The client does not own the session. The auth store registers these handlers
 * so tokens can be read and rotated without the client importing React state.
 */
let auth = {
  getAccessToken: () => null,
  getRefreshToken: () => null,
  onRefreshed: () => {},
  onSessionExpired: () => {},
}
export function configureAuth(handlers) {
  auth = { ...auth, ...handlers }
}

api.interceptors.request.use((cfg) => {
  const token = auth.getAccessToken()
  if (token && !cfg.skipAuth) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

let refreshing = null

async function refreshSession() {
  if (!refreshing) {
    const refreshToken = auth.getRefreshToken()
    if (!refreshToken) throw new Error('No refresh token')
    refreshing = api
      .post('/auth/refresh', { refreshToken }, { skipAuth: true, skipRefresh: true })
      .then(({ data }) => {
        auth.onRefreshed({ accessToken: data.accessToken, refreshToken: data.refreshToken, user: data.user })
        return data.accessToken
      })
      .finally(() => {
        refreshing = null
      })
  }
  return refreshing
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config: cfg, response } = error
    if (response?.status === 401 && cfg && !cfg.skipRefresh && !cfg._retried && auth.getRefreshToken()) {
      cfg._retried = true
      try {
        const token = await refreshSession()
        cfg.headers.Authorization = `Bearer ${token}`
        return api(cfg)
      } catch {
        auth.onSessionExpired()
      }
    }
    return Promise.reject(normaliseError(error))
  },
)

/**
 * Converts any Axios failure into a predictable shape the UI can render:
 * { status, message, fieldErrors, code, isNetwork, isAuth, isForbidden, isNotFound }
 */
export function normaliseError(error) {
  if (error?.normalised) return error
  const status = error?.response?.status ?? 0
  const body = error?.response?.data
  const isNetwork = !error?.response && (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error')
  const isTimeout = error?.code === 'ECONNABORTED'
  const message = isNetwork
    ? 'We could not reach the server. Check your connection and try again.'
    : isTimeout
      ? 'The server took too long to respond. Please try again.'
      : (body?.message ??
        (status >= 500 ? 'The server ran into a problem. Please try again shortly.' : (error?.message ?? 'Something went wrong.')))
  const fieldErrors = Array.isArray(body?.fieldErrors) ? body.fieldErrors : []
  const normalised = Object.assign(new Error(message), {
    normalised: true,
    status,
    code: error?.code,
    title: body?.error ?? (isNetwork ? 'Connection problem' : 'Request failed'),
    fieldErrors,
    fieldErrorMap: Object.fromEntries(fieldErrors.map((f) => [f.field, f.message])),
    isNetwork,
    isTimeout,
    isCanceled: error?.code === 'ERR_CANCELED',
    isAuth: status === 401,
    isForbidden: status === 403,
    isNotFound: status === 404,
    isConflict: status === 409,
    isValidation: status === 400 || status === 422,
    original: error,
  })
  return normalised
}

/** Convenience wrappers that unwrap `data`. */
export const http = {
  get: (url, config) => api.get(url, config).then((r) => r.data),
  post: (url, body, config) => api.post(url, body, config).then((r) => r.data),
  put: (url, body, config) => api.put(url, body, config).then((r) => r.data),
  patch: (url, body, config) => api.patch(url, body, config).then((r) => r.data),
  delete: (url, config) => api.delete(url, config).then((r) => r.data),
}
