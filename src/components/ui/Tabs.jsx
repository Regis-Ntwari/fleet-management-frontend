import { useSearchParams } from 'react-router'
import MuiTabs from '@mui/material/Tabs'
import Tab from '@mui/material/Tab'
import Box from '@mui/material/Box'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'

/** Horizontal tabs. When `param` is set the active tab is synced to the URL. tabs: [{ key, label, icon, count }] */
export function Tabs({ tabs, value, onChange, param, sx, size = 'md' }) {
  const [params, setParams] = useSearchParams()
  const active = param ? (params.get(param) ?? tabs[0]?.key) : value
  const current = tabs.some((t) => t.key === active) ? active : false
  const select = (key) => {
    if (param) {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (key === tabs[0]?.key) next.delete(param)
          else next.set(param, key)
          return next
        },
        { replace: true },
      )
    }
    onChange?.(key)
  }
  return (
    <MuiTabs
      value={current}
      onChange={(_, key) => select(key)}
      variant="scrollable"
      scrollButtons={false}
      sx={[{ minHeight: size === 'sm' ? 36 : 40 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      {tabs.map((t) => {
        const Icon = t.icon
        const isActive = current === t.key
        return (
          <Tab
            key={t.key}
            value={t.key}
            icon={Icon ? <Icon /> : undefined}
            iconPosition="start"
            sx={{ minHeight: size === 'sm' ? 36 : 40, fontSize: size === 'sm' ? 13 : 13.5 }}
            label={
              <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                {t.label}
                {t.count != null ? (
                  <Box
                    component="span"
                    className="tabular"
                    sx={{
                      borderRadius: 999,
                      px: 0.75,
                      py: '1px',
                      fontSize: 11,
                      bgcolor: isActive ? 'soft.accent.bg' : 'background.muted',
                      color: isActive ? 'soft.accent.fg' : 'text.muted',
                    }}
                  >
                    {t.count}
                  </Box>
                ) : null}
              </Box>
            }
          />
        )
      })}
    </MuiTabs>
  )
}

export function useActiveTab(param, tabs) {
  const [params] = useSearchParams()
  return params.get(param) ?? tabs[0]?.key
}

/** Exclusive toggle group. options: [{ value, label, icon }] */
export function SegmentedControl({ options, value, onChange, size = 'sm', sx, label }) {
  return (
    <ToggleButtonGroup
      exclusive
      value={value}
      onChange={(_, next) => {
        if (next != null) onChange(next)
      }}
      size={size === 'sm' ? 'small' : 'medium'}
      aria-label={label}
      sx={sx}
    >
      {options.map((o) => {
        const Icon = o.icon
        return (
          <ToggleButton key={String(o.value)} value={o.value} aria-label={o.label}>
            {Icon ? <Icon aria-hidden /> : null}
            {o.label}
          </ToggleButton>
        )
      })}
    </ToggleButtonGroup>
  )
}
