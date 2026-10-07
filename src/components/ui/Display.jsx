import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import LinearProgress from '@mui/material/LinearProgress'
import ButtonBase from '@mui/material/ButtonBase'

const toArray = (sx) => (Array.isArray(sx) ? sx : sx ? [sx] : [])

const GRID_COLUMNS = {
  1: { sm: '1fr' },
  2: { sm: 'repeat(2, minmax(0, 1fr))' },
  3: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' },
  4: { sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' },
}

/** Key/value list used in detail panels. items: [{ label, value, span, mono }] */
export function DescriptionList({ items, sx, columns = 2 }) {
  return (
    <Box
      component="dl"
      sx={[
        { display: 'grid', gridTemplateColumns: { xs: '1fr', ...GRID_COLUMNS[columns] }, columnGap: 3, rowGap: 2, m: 0 },
        ...toArray(sx),
      ]}
    >
      {items.filter(Boolean).map((item) => (
        <Box
          key={item.label}
          sx={{ minWidth: 0, gridColumn: item.span === 2 ? { sm: 'span 2' } : item.span === 'full' ? { sm: '1 / -1' } : undefined }}
        >
          <Typography component="dt" sx={{ fontSize: 12, fontWeight: 500, color: 'text.muted' }}>
            {item.label}
          </Typography>
          <Typography
            component="dd"
            variant={item.mono ? 'mono' : 'body1'}
            sx={{ m: 0, mt: 0.25, overflowWrap: 'anywhere', fontSize: item.mono ? 13 : 13.5, color: 'text.primary' }}
          >
            {item.value ?? (
              <Box component="span" sx={{ color: 'text.faint' }}>
                —
              </Box>
            )}
          </Typography>
        </Box>
      ))}
    </Box>
  )
}

const TONE_SX = {
  success: { bgcolor: 'soft.success.bg', color: 'soft.success.fg' },
  warning: { bgcolor: 'soft.warning.bg', color: 'soft.warning.fg' },
  danger: { bgcolor: 'soft.danger.bg', color: 'soft.danger.fg' },
  info: { bgcolor: 'soft.info.bg', color: 'soft.info.fg' },
  accent: { bgcolor: 'soft.accent.bg', color: 'soft.accent.fg' },
  neutral: { bgcolor: 'soft.neutral.bg', color: 'soft.neutral.fg' },
}

/** Vertical timeline of events. items: [{ id, at, title, description, icon, tone, meta }] */
export function Timeline({ items, renderTime, sx, emptyText = 'No activity yet.' }) {
  if (!items?.length) return <Typography sx={{ py: 3, textAlign: 'center', fontSize: 13, color: 'text.muted' }}>{emptyText}</Typography>
  return (
    <Box
      component="ol"
      sx={[{ position: 'relative', ml: 1.5, pl: 0, my: 0, borderLeft: 1, borderColor: 'divider', listStyle: 'none' }, ...toArray(sx)]}
    >
      {items.map((item) => {
        const Icon = item.icon
        return (
          <Box component="li" key={item.id} sx={{ position: 'relative', pb: 2.5, pl: 3, '&:last-child': { pb: 0 } }}>
            <Box
              sx={[
                {
                  position: 'absolute',
                  left: -13,
                  top: 2,
                  display: 'flex',
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  border: 2,
                  borderColor: 'background.paper',
                },
                TONE_SX[item.tone] ?? TONE_SX.neutral,
              ]}
            >
              {Icon ? (
                <Icon sx={{ fontSize: 12 }} aria-hidden />
              ) : (
                <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: 'currentColor' }} />
              )}
            </Box>
            <Stack direction="row" sx={{ flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 1.5 }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{item.title}</Typography>
              <Typography component="time" className="tabular" dateTime={item.at} sx={{ fontSize: 12, color: 'text.muted' }}>
                {renderTime ? renderTime(item.at) : item.at}
              </Typography>
            </Stack>
            {item.description ? <Typography sx={{ mt: 0.25, fontSize: 13, color: 'text.muted' }}>{item.description}</Typography> : null}
            {item.meta ? <Box sx={{ mt: 0.5 }}>{item.meta}</Box> : null}
          </Box>
        )
      })}
    </Box>
  )
}

/** Toolbar that holds a search box, filter controls and a reset action. */
export function FilterBar({ children, onReset, hasFilters, sx, trailing }) {
  return (
    <Box
      sx={[
        { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, borderBottom: 1, borderColor: 'divider', px: 2, py: 1.5 },
        ...toArray(sx),
      ]}
    >
      {children}
      {hasFilters && onReset ? (
        <ButtonBase
          onClick={onReset}
          sx={{ fontSize: 12.5, fontWeight: 500, color: 'text.muted', px: 0.5, borderRadius: 1, '&:hover': { color: 'text.primary' } }}
        >
          Clear filters
        </ButtonBase>
      ) : null}
      {trailing ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', ml: 'auto' }}>
          {trailing}
        </Stack>
      ) : null}
    </Box>
  )
}

export function Kbd({ children }) {
  return (
    <Box
      component="kbd"
      sx={{
        display: 'inline-flex',
        height: 20,
        minWidth: 20,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px',
        border: 1,
        borderColor: 'divider',
        bgcolor: 'background.subtle',
        px: 0.5,
        fontFamily: (t) => t.typography.fontFamilyMono,
        fontSize: 11,
        fontWeight: 500,
        color: 'text.muted',
      }}
    >
      {children}
    </Box>
  )
}

const BAR_COLOR = { accent: 'primary', success: 'success', warning: 'warning', danger: 'error', info: 'info' }

export function ProgressBar({ value, max = 100, tone = 'accent', sx, label }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100))
  return (
    <LinearProgress
      variant="determinate"
      value={pct}
      color={BAR_COLOR[tone] ?? 'primary'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemax={max}
      sx={[{ width: '100%' }, ...toArray(sx)]}
    />
  )
}
