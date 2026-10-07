import { ResponsiveContainer } from 'recharts'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Skeleton } from './Feedback'

/** Series colours come from the theme's CSS variables so they follow the active colour scheme. */
export const SERIES = [
  'var(--limoz-palette-chart-s1)',
  'var(--limoz-palette-chart-s2)',
  'var(--limoz-palette-chart-s3)',
  'var(--limoz-palette-chart-s4)',
  'var(--limoz-palette-chart-s5)',
]
export const STATUS_COLORS = {
  success: 'var(--limoz-palette-success-main)',
  warning: 'var(--limoz-palette-warning-main)',
  danger: 'var(--limoz-palette-error-main)',
  info: 'var(--limoz-palette-info-main)',
  accent: 'var(--limoz-palette-primary-main)',
  neutral: 'var(--limoz-palette-chart-muted)',
}
export const CHART_BG = 'var(--limoz-palette-background-default)'
export const CHART_CURSOR = 'var(--limoz-palette-background-subtle)'

export const axisProps = { tickLine: false, axisLine: false, tick: { fontSize: 11.5 }, stroke: 'var(--limoz-palette-chart-muted)' }
export const gridProps = { vertical: false, strokeDasharray: '0', stroke: 'var(--limoz-palette-chart-grid)' }

/** Consistent tooltip surface for Recharts. `format` maps series key → (value) => string. */
export function ChartTooltip({ active, payload, label, labelFormatter, format = {}, names = {} }) {
  if (!active || !payload?.length) return null
  return (
    <Paper
      variant="outlined"
      sx={{ minWidth: 140, px: 1.5, py: 1, fontSize: 12.5, bgcolor: 'background.elevated', boxShadow: (t) => t.vars.palette.shadow.md }}
    >
      {label != null ? (
        <Typography sx={{ mb: 0.75, fontSize: 12.5, fontWeight: 500 }}>{labelFormatter ? labelFormatter(label) : label}</Typography>
      ) : null}
      <Stack component="ul" spacing={0.5} sx={{ listStyle: 'none', m: 0, p: 0 }}>
        {payload.map((p) => (
          <Stack
            key={p.dataKey ?? p.name}
            component="li"
            direction="row"
            spacing={2}
            sx={{ alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'text.muted' }}>
              <Box component="span" sx={{ width: 8, height: 8, borderRadius: '2px', background: p.color ?? p.fill }} aria-hidden />
              <span>{names[p.dataKey] ?? p.name}</span>
            </Stack>
            <Box component="span" className="tabular" sx={{ fontWeight: 500 }}>
              {format[p.dataKey] ? format[p.dataKey](p.value, p.payload) : p.value}
            </Box>
          </Stack>
        ))}
      </Stack>
    </Paper>
  )
}

export function ChartLegend({ items, sx }) {
  if (!items?.length) return null
  return (
    <Stack
      component="ul"
      direction="row"
      sx={[
        { flexWrap: 'wrap', alignItems: 'center' },
        { listStyle: 'none', m: 0, p: 0, columnGap: 2, rowGap: 0.5, fontSize: 12, color: 'text.muted' },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {items.map((it) => (
        <Stack key={it.label} component="li" direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
          <Box
            component="span"
            sx={{
              display: 'inline-block',
              width: it.shape === 'line' ? 12 : 10,
              height: it.shape === 'line' ? 2 : 10,
              borderRadius: it.shape === 'line' ? 0 : '2px',
              background: it.color,
            }}
            aria-hidden
          />
          {it.label}
        </Stack>
      ))}
    </Stack>
  )
}

export function ChartFrame({ height = 240, loading, empty, children, sx }) {
  if (loading) return <Skeleton height={height} width="100%" sx={sx} />
  if (empty)
    return (
      <Box
        sx={[
          { display: 'flex', alignItems: 'center', justifyContent: 'center', height, fontSize: 13, color: 'text.muted' },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      >
        No data for this period.
      </Box>
    )
  return (
    <Box sx={[{ height }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </Box>
  )
}
