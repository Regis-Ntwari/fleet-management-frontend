import { SERIES, STATUS_COLORS } from '@/components/ui/charts'
import { formatCompactNumber, formatCurrency, formatDuration, formatKm, formatLitres, formatNumber, formatPercent } from '@/utils/format'

/* ---------- value formatting shared by KPIs, axes, tooltips and labels ---------- */

export function formatValue(value, format, decimals) {
  if (value == null || value === '') return '—'
  switch (format) {
    case 'currency':
      return decimals === 2 ? `RWF ${formatNumber(value, 2)}` : formatCurrency(value)
    case 'percent':
      return formatPercent(value, Number.isInteger(Number(value)) ? 0 : 1)
    case 'km':
      return formatKm(value)
    case 'litres':
      return formatLitres(value)
    case 'minutes':
      return formatDuration(value)
    case 'kph':
      return `${formatNumber(value)} km/h`
    default:
      return formatNumber(value, decimals ?? (Number.isInteger(Number(value)) ? 0 : 1))
  }
}

/** Short tick labels: "1.2M", "45k", "80%" — units live in the title/tooltip. */
export function tickFormatter(format) {
  switch (format) {
    case 'currency':
      return (v) => formatCurrency(v, { compact: true }).replace('RWF ', '')
    case 'percent':
      return (v) => `${formatNumber(v)}%`
    case 'minutes':
      return (v) => (Math.abs(v) >= 120 ? `${formatNumber(v / 60)}h` : `${formatNumber(v)}m`)
    default:
      return formatCompactNumber
  }
}

export const seriesColor = (s, i) => (s.tone ? STATUS_COLORS[s.tone] : SERIES[i % SERIES.length])
export const legendItems = (chart) =>
  chart.series.map((s, i) => ({ label: s.label, color: seriesColor(s, i), shape: chart.type === 'line' ? 'line' : 'box' }))
export const labelWidth = (data, key) =>
  Math.min(200, Math.max(72, Math.max(0, ...data.map((d) => String(d[key] ?? '').length)) * 7.4 + 16))
