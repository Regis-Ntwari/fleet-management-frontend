import { NavLink, useLocation } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'
import MenuIcon from '@mui/icons-material/Menu'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { MOBILE_NAV_PRIORITY, NAV_GROUPS, navItemVisible } from '@/routes/nav'

export const BOTTOM_NAV_HEIGHT = 60

const isActivePath = (pathname, item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`))

/**
 * Phone and tablet navigation: the four destinations that matter most for this role sit in a
 * fixed bar under the thumb, and "Menu" opens the full drawer. Hidden from the `lg` breakpoint
 * up, where the sidebar takes over.
 */
export function BottomNav({ onOpenMenu, menuOpen }) {
  const { can, status, user } = useAuth()
  const { pathname } = useLocation()
  const alerts = useQuery({
    queryKey: ['alerts', 'summary'],
    queryFn: () => http.get('/alerts/summary'),
    enabled: status === 'authenticated' && can('DASHBOARD_VIEW'),
    refetchInterval: 60_000,
  })
  const alertCount = (alerts.data?.critical ?? 0) + (alerts.data?.warning ?? 0)
  const allowed = NAV_GROUPS.flatMap((g) => g.items).filter((i) => navItemVisible(user, can, i))
  const rank = (i) => {
    const idx = MOBILE_NAV_PRIORITY.indexOf(i.to)
    return idx === -1 ? 999 : idx
  }
  const items = [...allowed].sort((a, b) => rank(a) - rank(b)).slice(0, 4)
  if (!items.length) return null
  const anyActive = items.some((i) => isActivePath(pathname, i))

  return (
    <Box
      component="nav"
      aria-label="Quick navigation"
      className="bottom-nav"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: (t) => t.zIndex.appBar,
        display: { xs: 'grid', lg: 'none' },
        gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))`,
        height: `calc(${BOTTOM_NAV_HEIGHT}px + env(safe-area-inset-bottom))`,
        pb: 'env(safe-area-inset-bottom)',
        bgcolor: 'background.paper',
        borderTop: 1,
        borderColor: 'divider',
      }}
    >
      {items.map((item) => {
        const Icon = item.icon
        const active = isActivePath(pathname, item)
        const count = item.badge === 'alerts' ? alertCount : 0
        return (
          <ButtonBase
            key={item.to}
            component={NavLink}
            to={item.to}
            end={item.end}
            aria-current={active ? 'page' : undefined}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 0.4,
              minWidth: 0,
              px: 0.5,
              color: active ? 'primary.main' : 'text.muted',
              '&:active': { bgcolor: 'background.subtle' },
            }}
          >
            <Box
              component="span"
              sx={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 44,
                height: 26,
                borderRadius: 999,
                bgcolor: active ? 'soft.accent.bg' : 'transparent',
                transition: 'background-color 150ms',
              }}
            >
              <Icon sx={{ fontSize: 22 }} aria-hidden />
              {count > 0 ? (
                <Box
                  component="span"
                  className="tabular"
                  sx={{
                    position: 'absolute',
                    top: -4,
                    right: 2,
                    minWidth: 16,
                    px: 0.5,
                    borderRadius: 999,
                    bgcolor: 'error.main',
                    color: '#fff',
                    fontSize: 10,
                    fontWeight: 600,
                    lineHeight: '16px',
                    textAlign: 'center',
                  }}
                >
                  {count > 99 ? '99+' : count}
                </Box>
              ) : null}
            </Box>
            <Typography
              component="span"
              noWrap
              sx={{ maxWidth: '100%', fontSize: 10.5, fontWeight: active ? 600 : 500, lineHeight: 1.2, letterSpacing: '0.01em' }}
            >
              {item.short ?? item.label}
            </Typography>
          </ButtonBase>
        )
      })}
      <ButtonBase
        onClick={onOpenMenu}
        aria-label="Open navigation"
        aria-expanded={Boolean(menuOpen)}
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.4,
          minWidth: 0,
          px: 0.5,
          color: menuOpen || !anyActive ? 'primary.main' : 'text.muted',
          '&:active': { bgcolor: 'background.subtle' },
        }}
      >
        <Box
          component="span"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 44,
            height: 26,
            borderRadius: 999,
            bgcolor: !anyActive ? 'soft.accent.bg' : 'transparent',
          }}
        >
          <MenuIcon sx={{ fontSize: 22 }} aria-hidden />
        </Box>
        <Typography component="span" sx={{ fontSize: 10.5, fontWeight: 500, lineHeight: 1.2 }}>
          Menu
        </Typography>
      </ButtonBase>
    </Box>
  )
}
