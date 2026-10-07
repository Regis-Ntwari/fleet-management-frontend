import { forbidden } from './core'
const routes = []
function compile(path) {
  const keys = []
  const source = path.replace(/\//g, '\\/').replace(/:(\w+)/g, (_, key) => {
    keys.push(key)
    return '([^\\/]+)'
  })
  return { pattern: new RegExp(`^${source}\\/?$`), keys }
}
export function route(method, path, handler, options = {}) {
  const { pattern, keys } = compile(path)
  routes.push({ method: method.toUpperCase(), pattern, keys, handler, ...options })
}
export const get = (path, handler, options) => route('GET', path, handler, options)
export const post = (path, handler, options) => route('POST', path, handler, options)
export const put = (path, handler, options) => route('PUT', path, handler, options)
export const patch = (path, handler, options) => route('PATCH', path, handler, options)
export const del = (path, handler, options) => route('DELETE', path, handler, options)
export function resolve(method, path) {
  for (const r of routes) {
    if (r.method !== method.toUpperCase()) continue
    const m = r.pattern.exec(path)
    if (!m) continue
    const params = {}
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])))
    return { route: r, params }
  }
  return null
}
export function assertPermission(user, permissions, required) {
  if (!required) return
  const needed = Array.isArray(required) ? required : [required]
  if (!needed.some((p) => permissions.includes(p))) {
    throw forbidden(`Your role (${user?.role ?? 'unknown'}) does not allow this action. Required: ${needed.join(' or ')}.`)
  }
}
