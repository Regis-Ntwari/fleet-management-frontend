import { NavLink, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import Divider from '@mui/material/Divider'
import Tooltip from '@mui/material/Tooltip'
import Badge from '@mui/material/Badge'
import Typography from '@mui/material/Typography'
import MenuOpenIcon from '@mui/icons-material/MenuOpen'
import MenuIcon from '@mui/icons-material/Menu'
import CloseIcon from '@mui/icons-material/Close'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED, TOPBAR_HEIGHT } from '@/app/theme'
import { NAV_GROUPS } from '@/routes/nav'
import { IconButton } from '@/components/ui/Button'

export function Logo({ collapsed = false }) {
  return (
    <Box
      sx={{
        display: 'flex',
        height: TOPBAR_HEIGHT,
        flexShrink: 0,
        alignItems: 'center',
        gap: 1.25,
        borderBottom: 1,
        borderColor: 'divider',
        px: collapsed ? 0 : 1.5,
        justifyContent: collapsed ? 'center' : 'flex-start',
      }}
    >
      <Box
        component="span"
        sx={{
          display: 'flex',
          width: 32,
          height: 32,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 15h2.5a2.5 2.5 0 0 0 5 0h3a2.5 2.5 0 0 0 5 0H21v-3.3l-2.6-.9-1.6-2.8H3z" />
        </svg>
      </Box>
      {!collapsed ? (
        <Box sx={{ minWidth: 0, lineHeight: 1.2 }}>
          <Typography noWrap sx={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
            LIMOZ Fleet
          </Typography>
          <Typography noWrap sx={{ fontSize: 11, color: 'text.muted' }}>
            Operations · Rwanda
          </Typography>
        </Box>
      ) : null}
    </Box>
  )
}

const isActivePath = (pathname, item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))

export function SidebarNav({ collapsed = false, onNavigate }) {
  const { can, status } = useAuth()
  const { pathname } = useLocation()
  const alerts = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: () => http.get('/alerts/summary'),
    enabled: status === 'authenticated' && can('DASHBOARD_VIEW'),
    refetchInterval: 60_000,
  })
  const badges = { alerts: (alerts.data?.critical ?? 0) + (alerts.data?.warning ?? 0) }

  return (
    <Box
      component="nav"
      aria-label="Main"
      className="scrollbar-thin"
      sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', px: 1, py: 1.5 }}
    >
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((i) => can(i.permission))
        if (!items.length) return null
        return (
          <Box key={group.label} sx={{ mb: 2 }}>
            {!collapsed ? <ListSubheader component="p">{group.label}</ListSubheader> : <Divider sx={{ mx: 1, mb: 1 }} />}
            <List sx={{ display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              {items.map((item) => {
                const Icon = item.icon
                const count = item.badge ? badges[item.badge] : 0
                const active = isActivePath(pathname, item)
                const button = (
                  <ListItemButton
                    component={NavLink}
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    selected={active}
                    aria-current={active ? 'page' : undefined}
                    sx={collapsed ? { justifyContent: 'center', px: 0 } : undefined}
                  >
                    <ListItemIcon>
                      {collapsed && count > 0 ? (
                        <Badge badgeContent={count > 99 ? '99+' : count} color="error" overlap="circular">
                          <Icon />
                        </Badge>
                      ) : (
                        <Icon />
                      )}
                    </ListItemIcon>
                    {!collapsed ? <ListItemText primary={item.label} slotProps={{ primary: { noWrap: true } }} /> : null}
                    {!collapsed && count > 0 ? (
                      <Box
                        component="span"
                        className="tabular"
                        sx={{
                          borderRadius: 999,
                          bgcolor: 'error.main',
                          color: '#fff',
                          px: 0.75,
                          fontSize: 10.5,
                          fontWeight: 600,
                          lineHeight: '16px',
                        }}
                      >
                        {count > 99 ? '99+' : count}
                      </Box>
                    ) : null}
                  </ListItemButton>
                )
                return (
                  <ListItem key={item.to} disablePadding>
                    {collapsed ? (
                      <Tooltip title={item.label} placement="right">
                        {button}
                      </Tooltip>
                    ) : (
                      button
                    )}
                  </ListItem>
                )
              })}
            </List>
          </Box>
        )
      })}
    </Box>
  )
}

export function Sidebar({ collapsed, onToggle }) {
  const width = collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH
  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', lg: 'block' },
        width,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width,
          boxSizing: 'border-box',
          borderRight: 1,
          borderColor: 'divider',
          overflowX: 'hidden',
          transition: 'width 200ms',
        },
      }}
    >
      <Logo collapsed={collapsed} />
      <SidebarNav collapsed={collapsed} />
      <Box sx={{ display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', borderTop: 1, borderColor: 'divider', p: 1 }}>
        <IconButton
          label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          icon={collapsed ? MenuIcon : MenuOpenIcon}
          size="sm"
          onClick={onToggle}
        />
      </Box>
    </Drawer>
  )
}

export function MobileSidebar({ open, onClose }) {
  return (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      ModalProps={{ keepMounted: false }}
      aria-label="Navigation"
      sx={{ display: { lg: 'none' }, '& .MuiDrawer-paper': { width: 280, maxWidth: '85vw' } }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        <Box sx={{ flex: 1 }}>
          <Logo />
        </Box>
        <IconButton label="Close navigation" icon={CloseIcon} size="sm" onClick={onClose} />
      </Box>
      <SidebarNav onNavigate={onClose} />
    </Drawer>
  )
}
