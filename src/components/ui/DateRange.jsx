import { useState } from 'react'
import { format, startOfMonth, subDays, subMonths, endOfMonth } from 'date-fns'
import Popover from '@mui/material/Popover'
import MenuList from '@mui/material/MenuList'
import MenuItem from '@mui/material/MenuItem'
import ListItemText from '@mui/material/ListItemText'
import Divider from '@mui/material/Divider'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import CheckIcon from '@mui/icons-material/Check'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import { formatShortDate } from '@/utils/format'
import { Button } from './Button'
import { Input } from './Field'

const day = (d) => format(d, 'yyyy-MM-dd')

export const RANGE_PRESETS = [
  { key: '7d', label: 'Last 7 days', range: () => ({ from: day(subDays(new Date(), 6)), to: day(new Date()) }) },
  { key: '30d', label: 'Last 30 days', range: () => ({ from: day(subDays(new Date(), 29)), to: day(new Date()) }) },
  { key: '90d', label: 'Last 90 days', range: () => ({ from: day(subDays(new Date(), 89)), to: day(new Date()) }) },
  { key: 'mtd', label: 'Month to date', range: () => ({ from: day(startOfMonth(new Date())), to: day(new Date()) }) },
  {
    key: 'lastMonth',
    label: 'Last month',
    range: () => ({ from: day(startOfMonth(subMonths(new Date(), 1))), to: day(endOfMonth(subMonths(new Date(), 1))) }),
  },
]

export function defaultRange(key = '30d') {
  return RANGE_PRESETS.find((p) => p.key === key).range()
}

/** Preset list with a custom range behind it. Value is { from, to } in yyyy-MM-dd. */
export function DateRangePicker({ value, onChange, sx, align = 'start' }) {
  const [anchor, setAnchor] = useState(null)
  const [custom, setCustom] = useState({ from: value?.from ?? '', to: value?.to ?? '' })
  const open = Boolean(anchor)
  const activePreset = RANGE_PRESETS.find((p) => {
    const r = p.range()
    return r.from === value?.from && r.to === value?.to
  })

  const [prevValue, setPrevValue] = useState(value)
  if (value?.from !== prevValue?.from || value?.to !== prevValue?.to) {
    setPrevValue(value)
    setCustom({ from: value?.from ?? '', to: value?.to ?? '' })
  }

  const close = () => setAnchor(null)
  const label = activePreset
    ? activePreset.label
    : value?.from && value?.to
      ? `${formatShortDate(value.from)} – ${formatShortDate(value.to)}`
      : 'Select range'
  const customValid = custom.from && custom.to && custom.from <= custom.to
  const horizontal = align === 'end' ? 'right' : 'left'

  return (
    <>
      <Button
        icon={CalendarMonthIcon}
        iconRight={KeyboardArrowDownIcon}
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-expanded={open}
        aria-haspopup="listbox"
        sx={[
          { minWidth: 160, justifyContent: 'space-between', '& .MuiButton-endIcon': { ml: 'auto' } },
          ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
        ]}
      >
        <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
          {label}
        </Box>
      </Button>
      <Popover
        open={open}
        anchorEl={anchor}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal }}
        transformOrigin={{ vertical: 'top', horizontal }}
        slotProps={{ paper: { sx: { width: 288, mt: 0.5 } } }}
      >
        <MenuList role="listbox" dense sx={{ p: 0.5 }}>
          {RANGE_PRESETS.map((p) => {
            const active = activePreset?.key === p.key
            return (
              <MenuItem
                key={p.key}
                role="option"
                aria-selected={active}
                selected={active}
                onClick={() => {
                  onChange(p.range())
                  close()
                }}
                sx={{ fontWeight: active ? 600 : 400 }}
              >
                <ListItemText slotProps={{ primary: { fontSize: 13 } }}>{p.label}</ListItemText>
                {active ? <CheckIcon sx={{ fontSize: 16, color: 'primary.main' }} aria-hidden /> : null}
              </MenuItem>
            )
          })}
        </MenuList>
        <Divider />
        <Box sx={{ p: 1.5 }}>
          <Typography variant="overline" component="p" sx={{ mb: 1, color: 'text.muted' }}>
            Custom range
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
            <Input
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
              aria-label="From"
            />
            <Input
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
              aria-label="To"
            />
          </Box>
          <Button
            size="sm"
            variant="primary"
            fullWidth
            sx={{ mt: 1 }}
            disabled={!customValid}
            onClick={() => {
              onChange({ from: custom.from, to: custom.to })
              close()
            }}
          >
            Apply
          </Button>
        </Box>
      </Popover>
    </>
  )
}
