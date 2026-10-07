import { Link } from 'react-router'
import Paper from '@mui/material/Paper'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TrendingUpIcon from '@mui/icons-material/TrendingUp'
import TrendingDownIcon from '@mui/icons-material/TrendingDown'
import RemoveIcon from '@mui/icons-material/Remove'
import { formatNumber } from '@/utils/format'
import { Skeleton } from './Feedback'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])
const TONE_COLOR = { success: 'success.main', warning: 'warning.main', danger: 'error.main', info: 'info.main', accent: 'primary.main' }

/**
 * KPI tile. `delta` is a percentage change vs the previous period;
 * `invert` marks metrics where a decrease is good (cost, incidents).
 */
export function Stat({ label, value, unit, delta, invert = false, hint, icon: Icon, to, tone, loading, sx, size = 'md' }) {
  const linkProps = to ? { component: Link, to } : {}
  return (
    <Paper
      variant="outlined"
      {...linkProps}
      sx={[
        {
          display: 'flex',
          flexDirection: 'column',
          p: 2,
          borderRadius: '10px',
          textDecoration: 'none',
          color: 'inherit',
          transition: 'border-color 150ms',
        },
        to && { '&:hover': { borderColor: 'edge.strong' } },
        ...toArray(sx),
      ]}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.muted' }}>
          {label}
        </Typography>
        {Icon ? <Icon sx={{ fontSize: 18, flexShrink: 0, color: tone ? TONE_COLOR[tone] : 'text.faint' }} aria-hidden /> : null}
      </Stack>
      {loading ? (
        <Skeleton height={28} width={96} sx={{ mt: 1 }} />
      ) : (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'baseline', mt: 0.75 }}>
          <Typography
            component="span"
            sx={{ fontSize: size === 'lg' ? 28 : 22, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.2 }}
          >
            {typeof value === 'number' ? formatNumber(value) : (value ?? '—')}
          </Typography>
          {unit ? (
            <Typography component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
              {unit}
            </Typography>
          ) : null}
        </Stack>
      )}
      {!loading && (delta != null || hint) ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.75, fontSize: 12, minWidth: 0 }}>
          {delta != null ? <Delta value={delta} invert={invert} /> : null}
          {hint ? (
            <Typography component="span" noWrap sx={{ fontSize: 'inherit', color: 'text.muted' }}>
              {hint}
            </Typography>
          ) : null}
        </Stack>
      ) : null}
    </Paper>
  )
}

export function Delta({ value, invert = false, suffix = 'vs prev.' }) {
  if (value == null) return null
  const positive = value > 0
  const good = value === 0 ? null : invert ? !positive : positive
  const Icon = value === 0 ? RemoveIcon : positive ? TrendingUpIcon : TrendingDownIcon
  return (
    <Box
      component="span"
      className="tabular"
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        fontWeight: 500,
        flexShrink: 0,
        color: good == null ? 'text.muted' : good ? 'soft.success.fg' : 'soft.danger.fg',
      }}
    >
      <Icon sx={{ fontSize: 14 }} aria-hidden />
      {positive ? '+' : ''}
      {formatNumber(value, 1)}%
      <Box component="span" sx={{ fontWeight: 400, color: 'text.muted' }}>
        {' '}
        {suffix}
      </Box>
    </Box>
  )
}

const GRID = {
  2: { sm: 'repeat(2, minmax(0, 1fr))' },
  3: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  4: { sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(4, minmax(0, 1fr))' },
  5: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(5, minmax(0, 1fr))' },
  6: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' },
}

export function StatGrid({ children, sx, cols = 4 }) {
  return (
    <Box sx={[{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', ...(GRID[cols] ?? GRID[4]) } }, ...toArray(sx)]}>
      {children}
    </Box>
  )
}
