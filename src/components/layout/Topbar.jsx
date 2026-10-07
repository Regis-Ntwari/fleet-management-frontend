import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Badge from '@mui/material/Badge'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import MenuIcon from '@mui/icons-material/Menu'
import SearchIcon from '@mui/icons-material/Search'
import NotificationsIcon from '@mui/icons-material/Notifications'
import LightModeIcon from '@mui/icons-material/LightMode'
import DarkModeIcon from '@mui/icons-material/DarkMode'
import BrightnessAutoIcon from '@mui/icons-material/BrightnessAuto'
import PersonIcon from '@mui/icons-material/Person'
import KeyIcon from '@mui/icons-material/Key'
import LogoutIcon from '@mui/icons-material/Logout'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useTheme } from '@/app/ThemeProvider'
import { useStatusMeta } from '@/app/ReferenceProvider'
import { TOPBAR_HEIGHT } from '@/app/theme'
import { IconButton } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Avatar } from '@/components/ui/Avatar'
import { Kbd } from '@/components/ui/Display'
import { NotificationsPanel } from './NotificationsPanel'

export function Topbar({ onOpenMobileNav, onOpenSearch }) {
  const { user, logout } = useAuth()
  const { theme, setTheme, resolved } = useTheme()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const roleMeta = useStatusMeta('role', user?.role)
  const [notifAnchor, setNotifAnchor] = useState(null)

  const notifications = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => http.get('/notifications', { params: { size: 1, unread: true } }),
    refetchInterval: 60_000,
  })
  const unread = notifications.data?.unreadCount ?? 0

  const signOut = useMutation({
    mutationFn: logout,
    onSuccess: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  const themeItems = [
    { label: 'Light', icon: LightModeIcon, onSelect: () => setTheme('light'), hint: theme === 'light' ? '✓' : undefined },
    { label: 'Dark', icon: DarkModeIcon, onSelect: () => setTheme('dark'), hint: theme === 'dark' ? '✓' : undefined },
    { label: 'System', icon: BrightnessAutoIcon, onSelect: () => setTheme('system'), hint: theme === 'system' ? '✓' : undefined },
  ]

  return (
    <AppBar position="sticky" sx={{ zIndex: (t) => t.zIndex.appBar }}>
      <Toolbar disableGutters sx={{ height: TOPBAR_HEIGHT, gap: 1, px: { xs: 1.5, sm: 2.5 } }}>
        <IconButton label="Open navigation" icon={MenuIcon} sx={{ display: { lg: 'none' } }} onClick={onOpenMobileNav} />
        <ButtonBase
          onClick={onOpenSearch}
          sx={{
            display: 'flex',
            height: 36,
            width: '100%',
            maxWidth: 448,
            alignItems: 'center',
            gap: 1,
            borderRadius: 1,
            border: 1,
            borderColor: 'edge.main',
            bgcolor: 'background.subtle',
            px: 1.5,
            fontSize: 13,
            color: 'text.muted',
            justifyContent: 'flex-start',
            transition: 'border-color 150ms, color 150ms',
            '&:hover': { borderColor: 'edge.strong', color: 'text.primary' },
          }}
        >
          <SearchIcon sx={{ fontSize: 18 }} aria-hidden />
          <Box component="span" sx={{ flex: 1, textAlign: 'left' }}>
            Search plates, drivers, trips, bookings…
          </Box>
          <Stack direction="row" spacing={0.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </Stack>
        </ButtonBase>
        <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', ml: 'auto' }}>
          <Dropdown
            trigger={<IconButton label="Theme" icon={resolved === 'dark' ? DarkModeIcon : LightModeIcon} />}
            items={themeItems}
            width={160}
          />
          <Badge variant="dot" color="error" invisible={unread === 0} overlap="circular" sx={{ '& .MuiBadge-badge': { top: 8, right: 8 } }}>
            <IconButton
              label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
              icon={NotificationsIcon}
              onClick={(e) => setNotifAnchor((a) => (a ? null : e.currentTarget))}
              aria-expanded={Boolean(notifAnchor)}
              aria-haspopup="dialog"
            />
          </Badge>
          <NotificationsPanel anchorEl={notifAnchor} open={Boolean(notifAnchor)} onClose={() => setNotifAnchor(null)} />
          <Dropdown
            width={240}
            trigger={
              <ButtonBase
                aria-label="Account menu"
                sx={{
                  ml: 0.5,
                  display: 'flex',
                  height: 36,
                  alignItems: 'center',
                  gap: 1,
                  borderRadius: 1,
                  px: 0.75,
                  '&:hover': { bgcolor: 'background.muted' },
                }}
              >
                <Avatar name={user?.name} size="sm" />
                <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0, textAlign: 'left' }}>
                  <Typography noWrap sx={{ maxWidth: 140, fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>
                    {user?.name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, lineHeight: 1.2, color: 'text.muted' }}>{roleMeta?.label ?? user?.role}</Typography>
                </Box>
              </ButtonBase>
            }
            items={[
              { heading: user?.email },
              { label: 'My profile', icon: PersonIcon, onSelect: () => navigate('/settings?tab=profile') },
              { label: 'Change password', icon: KeyIcon, onSelect: () => navigate('/settings?tab=profile') },
              { separator: true },
              { label: 'Sign out', icon: LogoutIcon, onSelect: () => signOut.mutate(), tone: 'danger' },
            ]}
          />
        </Stack>
      </Toolbar>
    </AppBar>
  )
}
