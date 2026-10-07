import MuiAvatar from '@mui/material/Avatar'
import { initials } from '@/utils/format'

const PALETTE = [
  { bgcolor: 'soft.accent.bg', color: 'soft.accent.fg' },
  { bgcolor: 'soft.info.bg', color: 'soft.info.fg' },
  { bgcolor: 'soft.warning.bg', color: 'soft.warning.fg' },
  { bgcolor: 'soft.neutral.bg', color: 'soft.neutral.fg' },
  { bgcolor: 'soft.danger.bg', color: 'soft.danger.fg' },
]

const SIZES = { xs: [24, 10], sm: [28, 11], md: [32, 12], lg: [40, 14], xl: [56, 18] }

export function Avatar({ name, size = 'md', sx }) {
  const [dim, font] = SIZES[size] ?? SIZES.md
  const idx = Array.from(String(name ?? '')).reduce((s, c) => s + c.charCodeAt(0), 0) % PALETTE.length
  return (
    <MuiAvatar
      aria-hidden
      sx={[
        { width: dim, height: dim, fontSize: font, flexShrink: 0, userSelect: 'none' },
        PALETTE[idx],
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
    >
      {initials(name) || '?'}
    </MuiAvatar>
  )
}
