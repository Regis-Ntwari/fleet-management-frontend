import { useEffect, useState } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import WifiOffIcon from '@mui/icons-material/WifiOff'
import ScienceIcon from '@mui/icons-material/Science'
import { useLocalStorage } from '@/hooks/useLocalStorage'
import { useOnline } from '@/hooks/useOnline'
import { isMockApi } from '@/api/client'
import { SIDEBAR_WIDTH, SIDEBAR_WIDTH_COLLAPSED } from '@/app/theme'
import { Sidebar, MobileSidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { RouteErrorBoundary } from '@/pages/ErrorPage'

export function AppShell() {
  const [collapsed, setCollapsed] = useLocalStorage('limoz.sidebar.collapsed', false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const online = useOnline()
  const location = useLocation()

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <ButtonBase
        href="#main"
        component="a"
        sx={{
          position: 'fixed',
          left: 12,
          top: 12,
          zIndex: (t) => t.zIndex.tooltip,
          px: 1.5,
          py: 1,
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          fontWeight: 500,
          transform: 'translateY(-200%)',
          '&:focus-visible': { transform: 'none' },
        }}
      >
        Skip to content
      </ButtonBase>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />
      <Box
        sx={{
          display: 'flex',
          minHeight: '100dvh',
          flexDirection: 'column',
          pl: { lg: `${collapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH}px` },
          transition: 'padding-left 200ms',
        }}
      >
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        {!online ? (
          <Stack
            role="status"
            direction="row"
            spacing={1}
            sx={{
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: 'soft.warning.bg',
              color: 'soft.warning.fg',
              px: 2,
              py: 0.75,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            <WifiOffIcon sx={{ fontSize: 14 }} aria-hidden />
            <span>You are offline. Data shown may be out of date and changes cannot be saved.</span>
          </Stack>
        ) : null}
        <Box component="main" id="main" sx={{ mx: 'auto', width: '100%', maxWidth: 1480, flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: 2.5 }}>
          <RouteErrorBoundary key={location.pathname}>
            <Outlet />
          </RouteErrorBoundary>
        </Box>
        <Box
          component="footer"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1,
            borderTop: 1,
            borderColor: 'divider',
            px: { xs: 2, sm: 3, lg: 4 },
            py: 1.5,
            fontSize: 11.5,
            color: 'text.muted',
          }}
        >
          <span>LIMOZ Rwanda Ltd · Fleet Operations</span>
          {isMockApi ? (
            <Typography
              component="span"
              title="The app is running against the in-browser mock API. Set VITE_USE_MOCK_API=false to use the Spring Boot backend."
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, fontSize: 'inherit', color: 'inherit' }}
            >
              <ScienceIcon sx={{ fontSize: 14 }} aria-hidden /> Demo data · Africa/Kigali
            </Typography>
          ) : (
            <span>Africa/Kigali</span>
          )}
        </Box>
      </Box>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ScrollRestoration />
    </Box>
  )
}
