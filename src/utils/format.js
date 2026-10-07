import { format as fmt, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'

const TZ = 'Africa/Kigali'
const LOCALE = 'en-RW'

const toDate = (value) => (value instanceof Date ? value : typeof value === 'string' ? parseISO(value) : null)

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  timeZone: TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const dateFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' })
const timeFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false })
const monthFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, month: 'short', year: 'numeric' })
const shortDateFormatter = new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: 'numeric', month: 'short' })

export function formatDateTime(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? dateTimeFormatter.format(d) : '—'
}

export function formatDate(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? dateFormatter.format(d) : '—'
}

export function formatShortDate(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? shortDateFormatter.format(d) : '—'
}

export function formatTime(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? timeFormatter.format(d) : '—'
}

export function formatMonth(value) {
  const d = typeof value === 'string' && value.length === 7 ? parseISO(`${value}-01`) : toDate(value)
  return d && !Number.isNaN(d.getTime()) ? monthFormatter.format(d) : '—'
}

/** "Today 14:20", "Yesterday 09:05", or "12 Mar 10:15". */
export function formatSmartDateTime(value) {
  const d = toDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  if (isToday(d)) return `Today ${timeFormatter.format(d)}`
  if (isYesterday(d)) return `Yesterday ${timeFormatter.format(d)}`
  return `${shortDateFormatter.format(d)} ${timeFormatter.format(d)}`
}

export function formatRelative(value) {
  const d = toDate(value)
  if (!d || Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (Math.abs(diff) < 60_000) return 'just now'
  return `${formatDistanceToNowStrict(d)}${diff > 0 ? ' ago' : ' from now'}`
}

export function toInputDate(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? fmt(d, 'yyyy-MM-dd') : ''
}

export function toInputDateTime(value) {
  const d = toDate(value)
  return d && !Number.isNaN(d.getTime()) ? fmt(d, "yyyy-MM-dd'T'HH:mm") : ''
}

const numberFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 0 })
const decimalFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1, minimumFractionDigits: 0 })
const twoDecimalFormatter = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2, minimumFractionDigits: 2 })

export function formatNumber(value, decimals = 0) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—'
  if (decimals === 2) return twoDecimalFormatter.format(Number(value))
  return (decimals ? decimalFormatter : numberFormatter).format(Number(value))
}

export function formatCurrency(value, { compact = false } = {}) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (compact && Math.abs(n) >= 1_000_000) return `RWF ${decimalFormatter.format(n / 1_000_000)}M`
  if (compact && Math.abs(n) >= 10_000) return `RWF ${numberFormatter.format(Math.round(n / 1000))}k`
  return `RWF ${numberFormatter.format(Math.round(n))}`
}

export function formatCompactNumber(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  const n = Number(value)
  if (Math.abs(n) >= 1_000_000) return `${decimalFormatter.format(n / 1_000_000)}M`
  if (Math.abs(n) >= 10_000) return `${decimalFormatter.format(n / 1000)}k`
  return numberFormatter.format(n)
}

export function formatKm(value, decimals = 0) {
  return value == null ? '—' : `${formatNumber(value, decimals)} km`
}

export function formatLitres(value) {
  return value == null ? '—' : `${formatNumber(value, 1)} L`
}

export function formatPercent(value, decimals = 0) {
  return value == null ? '—' : `${formatNumber(value, decimals)}%`
}

export function formatDuration(minutes) {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

export function formatBytes(bytes) {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** "IN_MAINTENANCE" → "In maintenance" (fallback when reference data is unavailable). */
export function humanize(value) {
  if (!value) return '—'
  const s = String(value).replace(/_/g, ' ').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function initials(name) {
  return String(name ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('')
}

export function pluralize(count, singular, plural = `${singular}s`) {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`
}
