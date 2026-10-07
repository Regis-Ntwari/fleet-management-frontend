import { formatCurrency, formatDate, formatDateTime, formatNumber, humanize } from './format'

const escape = (value) => {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Builds a CSV string from report-style columns and rows. */
export function toCsv(columns, rows) {
  const header = columns.map((c) => escape(c.label)).join(',')
  const lines = rows.map((row) => columns.map((c) => escape(row[c.key])).join(','))
  return [header, ...lines].join('\n')
}

export function downloadFile(content, fileName, type = 'text/csv;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Formats a cell for display according to a report column definition. */
export function formatCell(value, column) {
  if (value == null || value === '') return '—'
  switch (column.format) {
    case 'number':
      return formatNumber(value, Number.isInteger(Number(value)) ? 0 : 1)
    case 'currency':
      return formatCurrency(value)
    case 'percent':
      return `${formatNumber(value, 1)}%`
    case 'date':
      return formatDate(value)
    case 'datetime':
      return formatDateTime(value)
    case 'status':
      return humanize(value)
    default:
      return String(value)
  }
}

/** Minimal CSV parser (handles quoted fields and CRLF). Returns array of objects keyed by header. */
export function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else field += ch
    } else if (ch === '"') inQuotes = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  if (field.length || row.length) {
    row.push(field)
    rows.push(row)
  }
  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''))
  if (nonEmpty.length === 0) return { headers: [], rows: [] }
  const headers = nonEmpty[0].map((h) => h.trim())
  return { headers, rows: nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? '').trim()]))) }
}
