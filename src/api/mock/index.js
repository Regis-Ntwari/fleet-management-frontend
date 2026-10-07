import { AxiosError, AxiosHeaders } from 'axios'
import { getDb } from './db'
import { MockHttpError, ROLE_PERMISSIONS, unauthorized } from './core'
import { assertPermission, resolve } from './router'
import { parseToken } from './handlers/auth'
import { config } from '@/config/env'

// Registering the handler modules populates the router.
import './handlers/reference'
import './handlers/users'
import './handlers/system'
import './handlers/vehicles'
import './handlers/drivers'
import './handlers/assignments'
import './handlers/trips'
import './handlers/bookings'
import './handlers/fuel'
import './handlers/maintenance'
import './handlers/incidents'
import './handlers/documents'
import './handlers/dashboard'
import './handlers/reports'
import './handlers/imports'

const OFFLINE_FLAG = 'limoz.mock.offline'
const latencyMin = config.mockLatency.min
const latencyMax = config.mockLatency.max

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function isMockOffline() {
  try {
    return localStorage.getItem(OFFLINE_FLAG) === '1'
  } catch {
    return false
  }
}

export function setMockOffline(value) {
  try {
    if (value) localStorage.setItem(OFFLINE_FLAG, '1')
    else localStorage.removeItem(OFFLINE_FLAG)
  } catch {
    /* ignore */
  }
}

function parseQuery(url, params) {
  const query = {}
  const q = url.includes('?') ? url.slice(url.indexOf('?') + 1) : ''
  for (const [k, v] of new URLSearchParams(q)) query[k] = v
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined && v !== null && v !== '') query[k] = String(v)
  return query
}

function toHeaders(raw) {
  const out = {}
  const h = raw instanceof AxiosHeaders ? raw.toJSON() : (raw ?? {})
  for (const [k, v] of Object.entries(h)) if (v != null) out[k.toLowerCase()] = String(v)
  return out
}

function respond(config, status, data, statusText = 'OK') {
  return { data, status, statusText, headers: { 'content-type': 'application/json' }, config, request: {} }
}

function reject(config, status, body) {
  const response = respond(config, status, body, body.error)
  const err = new AxiosError(body.message, status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST, config, {}, response)
  return Promise.reject(err)
}

/**
 * Axios adapter that routes requests to the in-memory handlers.
 * Request/response shapes match the Spring Boot API, so swapping to the real
 * backend only requires turning the adapter off.
 */
export async function mockAdapter(config) {
  const base = (config.baseURL ?? '').replace(/\/$/, '')
  let url = config.url ?? ''
  if (base && url.startsWith(base)) url = url.slice(base.length)
  url = url.replace(/^\/api\/v1/, '')
  const path = url.split('?')[0]
  const method = (config.method ?? 'get').toUpperCase()

  await sleep(latencyMin + Math.random() * Math.max(0, latencyMax - latencyMin))

  if (config.signal?.aborted) {
    const err = new AxiosError('canceled', AxiosError.ERR_CANCELED, config)
    return Promise.reject(err)
  }

  if (isMockOffline()) {
    return Promise.reject(new AxiosError('Network Error', AxiosError.ERR_NETWORK, config, {}))
  }

  const match = resolve(method, path)
  if (!match) {
    return reject(config, 404, {
      timestamp: new Date().toISOString(),
      status: 404,
      error: 'Not Found',
      message: `No endpoint for ${method} ${path}`,
      path,
    })
  }

  const headers = toHeaders(config.headers)
  const token = headers.authorization?.replace(/^Bearer\s+/i, '')
  const parsed = parseToken(token)
  const user = parsed && parsed.kind === 'access' ? (getDb().users.find((u) => u.id === parsed.userId) ?? null) : null

  let body = config.data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      /* keep as-is */
    }
  }

  try {
    if (!match.route.public) {
      if (!user) throw unauthorized(token ? 'Your session has expired. Please sign in again.' : 'Authentication is required.')
      if (!user.active) throw unauthorized('This account has been deactivated.')
      assertPermission(user, ROLE_PERMISSIONS[user.role], match.route.permission)
    }
    const result = await match.route.handler({
      method,
      path,
      params: match.params,
      query: parseQuery(url, config.params),
      body,
      user,
      headers,
    })
    if (result === null || result === undefined) return respond(config, method === 'POST' ? 204 : 204, null, 'No Content')
    // Deep-clone so handlers' internal objects can't be mutated by the UI.
    return respond(
      config,
      method === 'POST' && !path.includes('/auth/') ? 201 : 200,
      JSON.parse(JSON.stringify(result)),
      method === 'POST' ? 'Created' : 'OK',
    )
  } catch (e) {
    if (e instanceof MockHttpError) return reject(config, e.status, e.toBody(`/api/v1${path}`))
    console.error('[mock-api] unhandled error', e)
    return reject(config, 500, {
      timestamp: new Date().toISOString(),
      status: 500,
      error: 'Internal Server Error',
      message: 'Something went wrong while processing the request.',
      path: `/api/v1${path}`,
    })
  }
}
