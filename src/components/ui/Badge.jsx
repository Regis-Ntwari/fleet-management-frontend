import Chip from '@mui/material/Chip'
import Box from '@mui/material/Box'
import { humanize } from '@/utils/format'
import { useStatusMeta } from '@/app/ReferenceProvider'

const TONES = new Set(['success', 'warning', 'danger', 'info', 'accent', 'neutral'])
const DOT = {
  success: 'success.main',
  warning: 'warning.main',
  danger: 'error.main',
  info: 'info.main',
  accent: 'primary.main',
  neutral: 'text.muted',
}

export function Badge({ tone = 'neutral', dot = false, size = 'md', sx, className, children }) {
  const t = TONES.has(tone) ? tone : 'neutral'
  const small = size === 'sm'
  return (
    <Chip
      size="small"
      className={className}
      label={children}
      icon={
        dot ? (
          <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: DOT[t], flexShrink: 0 }} aria-hidden />
        ) : undefined
      }
      sx={[
        {
          height: small ? 20 : 24,
          fontSize: small ? 11 : 12,
          bgcolor: `soft.${t}.bg`,
          color: `soft.${t}.fg`,
          verticalAlign: 'middle',
          '& .MuiChip-label': { px: small ? 1 : 1.25 },
          '& .MuiChip-icon': { ml: small ? 1 : 1.25, mr: -0.5, color: 'inherit' },
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    />
  )
}

export function Dash() {
  return (
    <Box component="span" sx={{ color: 'text.faint' }}>
      —
    </Box>
  )
}

/**
 * Status badge driven by the reference-data endpoint, so labels and colours
 * are defined once on the backend rather than in each component.
 */
export function StatusBadge({ kind, value, size, dot = true, sx, className }) {
  const meta = useStatusMeta(kind, value)
  if (!value) return <Dash />
  return (
    <Badge tone={meta?.tone ?? 'neutral'} dot={dot} size={size} sx={sx} className={className}>
      {meta?.label ?? humanize(value)}
    </Badge>
  )
}

const severityTone = {
  CRITICAL: 'danger',
  WARNING: 'warning',
  INFO: 'info',
  HIGH: 'warning',
  MEDIUM: 'info',
  LOW: 'neutral',
  OVERDUE: 'danger',
  DUE_SOON: 'warning',
  OK: 'success',
  EXPIRED: 'danger',
  EXPIRING_SOON: 'warning',
  VALID: 'success',
  HEAVY: 'accent',
  NORMAL: 'success',
  IDLE: 'danger',
}

export function ToneBadge({ value, size, sx, className }) {
  if (!value) return <Dash />
  return (
    <Badge tone={severityTone[value] ?? 'neutral'} dot size={size} sx={sx} className={className}>
      {humanize(value)}
    </Badge>
  )
}
