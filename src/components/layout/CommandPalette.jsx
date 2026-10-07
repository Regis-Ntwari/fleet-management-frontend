import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Dialog from '@mui/material/Dialog'
import Box from '@mui/material/Box'
import InputBase from '@mui/material/InputBase'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListSubheader from '@mui/material/ListSubheader'
import Typography from '@mui/material/Typography'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import PeopleIcon from '@mui/icons-material/People'
import RouteIcon from '@mui/icons-material/Route'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import BuildIcon from '@mui/icons-material/Build'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import BusinessIcon from '@mui/icons-material/Business'
import SearchIcon from '@mui/icons-material/Search'
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn'
import AddIcon from '@mui/icons-material/Add'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useDebouncedValue } from '@/hooks/useDebounce'
import { NAV_GROUPS } from '@/routes/nav'
import { Spinner } from '@/components/ui/Feedback'
import { Kbd } from '@/components/ui/Display'

const TYPE_ICON = {
  VEHICLE: DirectionsCarIcon,
  DRIVER: PeopleIcon,
  TRIP: RouteIcon,
  BOOKING: EventAvailableIcon,
  MAINTENANCE: BuildIcon,
  INCIDENT: ReportProblemIcon,
  CUSTOMER: BusinessIcon,
}
const TYPE_LABEL = {
  VEHICLE: 'Vehicle',
  DRIVER: 'Driver',
  TRIP: 'Trip',
  BOOKING: 'Booking',
  MAINTENANCE: 'Maintenance',
  INCIDENT: 'Incident',
  CUSTOMER: 'Customer',
}

const QUICK_ACTIONS = [
  { label: 'New trip', to: '/trips/new', permission: 'TRIP_MANAGE' },
  { label: 'New booking', to: '/bookings/new', permission: 'BOOKING_MANAGE' },
  { label: 'Record fuel', to: '/fuel/new', permission: 'FUEL_MANAGE' },
  { label: 'Report maintenance', to: '/maintenance/new', permission: 'MAINTENANCE_MANAGE' },
  { label: 'Report incident', to: '/incidents/new', permission: 'INCIDENT_MANAGE' },
  { label: 'Add vehicle', to: '/vehicles/new', permission: 'VEHICLE_CREATE' },
  { label: 'Add driver', to: '/drivers/new', permission: 'DRIVER_MANAGE' },
]

/** Mounted only while open so every opening starts with fresh state. */
export function CommandPalette({ open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-label="Search"
      fullWidth
      maxWidth={false}
      sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: '12vh' } }}
      slotProps={{ paper: { sx: { width: '100%', maxWidth: 576, m: 2, overflow: 'hidden' } } }}
    >
      {open ? <Palette onClose={onClose} /> : null}
    </Dialog>
  )
}

function Palette({ onClose }) {
  const [query, setQuery] = useState('')
  const [rawIndex, setIndex] = useState(0)
  const navigate = useNavigate()
  const { can } = useAuth()
  const inputRef = useRef(null)
  const debounced = useDebouncedValue(query, 200)

  const search = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => http.get('/search', { params: { q: debounced } }),
    enabled: debounced.trim().length >= 2,
  })

  const navItems = useMemo(() => NAV_GROUPS.flatMap((g) => g.items).filter((i) => can(i.permission)), [can])
  const actions = useMemo(() => QUICK_ACTIONS.filter((a) => can(a.permission)), [can])

  const items = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 2) {
      return [
        ...actions.map((a) => ({ kind: 'action', label: a.label, to: a.to, icon: AddIcon })),
        ...navItems.map((n) => ({ kind: 'nav', label: n.label, to: n.to, icon: n.icon })),
      ]
    }
    const nav = navItems
      .filter((n) => n.label.toLowerCase().includes(q))
      .map((n) => ({ kind: 'nav', label: n.label, to: n.to, icon: n.icon }))
    const act = actions
      .filter((a) => a.label.toLowerCase().includes(q))
      .map((a) => ({ kind: 'action', label: a.label, to: a.to, icon: AddIcon }))
    const hits = (search.data ?? []).map((h) => ({
      kind: 'hit',
      type: h.type,
      label: h.title,
      description: h.subtitle,
      to: h.link,
      icon: TYPE_ICON[h.type] ?? SearchIcon,
    }))
    return [...hits, ...act, ...nav]
  }, [query, navItems, actions, search.data])

  const index = Math.min(rawIndex, Math.max(0, items.length - 1))

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const go = (item) => {
    onClose()
    navigate(item.to)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex((i) => Math.min(items.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter' && items[index]) {
      e.preventDefault()
      go(items[index])
    }
  }

  const grouped = [
    { key: 'hit', label: 'Results', items: items.filter((i) => i.kind === 'hit') },
    { key: 'action', label: 'Quick actions', items: items.filter((i) => i.kind === 'action') },
    { key: 'nav', label: 'Go to', items: items.filter((i) => i.kind === 'nav') },
  ].filter((g) => g.items.length)

  let runningIndex = -1

  return (
    <>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: 1, borderColor: 'divider', px: 2 }}>
        <SearchIcon sx={{ fontSize: 18, flexShrink: 0, color: 'text.muted' }} aria-hidden />
        <InputBase
          inputRef={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setIndex(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search plates, drivers, trips, bookings, incidents…"
          fullWidth
          sx={{ height: 48, fontSize: 14 }}
          inputProps={{
            role: 'combobox',
            'aria-expanded': true,
            'aria-controls': 'palette-list',
            'aria-autocomplete': 'list',
            'aria-label': 'Search',
          }}
        />
        {search.isFetching ? <Spinner size="sm" /> : <Kbd>Esc</Kbd>}
      </Box>
      <Box id="palette-list" role="listbox" className="scrollbar-thin" sx={{ maxHeight: '50vh', overflowY: 'auto', p: 1 }}>
        {items.length === 0 ? (
          <Typography sx={{ px: 1.5, py: 4, textAlign: 'center', fontSize: 13, color: 'text.muted' }}>
            {search.isFetching ? 'Searching…' : `No results for “${query}”.`}
          </Typography>
        ) : (
          grouped.map((g) => (
            <List key={g.key} sx={{ mb: 0.5 }} subheader={<ListSubheader sx={{ pt: 1, px: 1.25 }}>{g.label}</ListSubheader>}>
              {g.items.map((item) => {
                runningIndex += 1
                const i = runningIndex
                const Icon = item.icon
                return (
                  <ListItemButton
                    key={`${item.kind}-${item.to}-${item.label}`}
                    role="option"
                    aria-selected={i === index}
                    selected={i === index}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => go(item)}
                    sx={{
                      gap: 1.5,
                      px: 1.25,
                      py: 1,
                      '&.Mui-selected': { bgcolor: 'background.muted', color: 'text.primary' },
                      '&.Mui-selected:hover': { bgcolor: 'background.muted' },
                    }}
                  >
                    <Box
                      component="span"
                      sx={{
                        display: 'flex',
                        width: 28,
                        height: 28,
                        flexShrink: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 1,
                        bgcolor: 'background.subtle',
                        color: 'text.muted',
                      }}
                    >
                      <Icon sx={{ fontSize: 18 }} aria-hidden />
                    </Box>
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography noWrap sx={{ fontSize: 13.5 }}>
                        {item.label}
                      </Typography>
                      {item.description ? (
                        <Typography noWrap sx={{ fontSize: 12, color: 'text.muted' }}>
                          {item.description}
                        </Typography>
                      ) : null}
                    </Box>
                    {item.type ? <Typography sx={{ fontSize: 11, color: 'text.muted' }}>{TYPE_LABEL[item.type]}</Typography> : null}
                    <KeyboardReturnIcon sx={{ fontSize: 14, color: i === index ? 'text.faint' : 'transparent' }} aria-hidden />
                  </ListItemButton>
                )
              })}
            </List>
          ))
        )}
      </Box>
    </>
  )
}
