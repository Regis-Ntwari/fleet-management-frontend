import { useNavigate } from 'react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Popover from '@mui/material/Popover'
import Box from '@mui/material/Box'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import Typography from '@mui/material/Typography'
import NotificationsOffIcon from '@mui/icons-material/NotificationsOff'
import DoneAllIcon from '@mui/icons-material/DoneAll'
import { http } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Feedback'
import { formatRelative } from '@/utils/format'

export function NotificationsPanel({ open, anchorEl, onClose }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const list = useQuery({
    queryKey: ['notifications', 'panel'],
    queryFn: () => http.get('/notifications', { params: { size: 12 } }),
    enabled: open,
  })
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  const markRead = useMutation({ mutationFn: (id) => http.patch(`/notifications/${id}/read`), onSuccess: invalidate })
  const markAll = useMutation({ mutationFn: () => http.post('/notifications/read-all'), onSuccess: invalidate })

  const items = list.data?.content ?? []
  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      slotProps={{ paper: { sx: { width: 360, maxWidth: 'calc(100vw - 24px)', mt: 0.5 }, role: 'dialog', 'aria-label': 'Notifications' } }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: 1,
          borderColor: 'divider',
          px: 1.75,
          py: 1.25,
        }}
      >
        <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>Notifications</Typography>
        <Button
          size="xs"
          variant="ghost"
          icon={DoneAllIcon}
          onClick={() => markAll.mutate()}
          loading={markAll.isPending}
          disabled={!list.data?.unreadCount}
        >
          Mark all read
        </Button>
      </Box>
      <Box className="scrollbar-thin" sx={{ maxHeight: 420, overflowY: 'auto' }}>
        {list.isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 5 }}>
            <Spinner />
          </Box>
        ) : items.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', py: 5, color: 'text.muted' }}>
            <NotificationsOffIcon sx={{ mb: 1, fontSize: 20 }} aria-hidden />
            <Typography sx={{ fontSize: 13 }}>You're all caught up.</Typography>
          </Box>
        ) : (
          <List disablePadding>
            {items.map((n) => (
              <ListItem key={n.id} disablePadding sx={{ borderBottom: 1, borderColor: 'divider', '&:last-child': { borderBottom: 0 } }}>
                <ListItemButton
                  onClick={() => {
                    if (!n.readAt) markRead.mutate(n.id)
                    onClose()
                    if (n.link) navigate(n.link)
                  }}
                  sx={{
                    alignItems: 'flex-start',
                    gap: 1.5,
                    borderRadius: 0,
                    px: 1.75,
                    py: 1.5,
                    bgcolor: n.readAt ? 'transparent' : 'soft.accent.bg',
                    '&:hover': { bgcolor: 'background.subtle' },
                  }}
                >
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      mt: 0.75,
                      width: 8,
                      height: 8,
                      flexShrink: 0,
                      borderRadius: '50%',
                      bgcolor: n.readAt ? 'transparent' : n.kind === 'ALERT' ? 'error.main' : 'primary.main',
                    }}
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                      <Typography
                        noWrap
                        sx={{ fontSize: 13, fontWeight: n.readAt ? 400 : 600, color: n.readAt ? 'text.secondary' : 'text.primary' }}
                      >
                        {n.title}
                      </Typography>
                      <Typography sx={{ flexShrink: 0, fontSize: 11, color: 'text.muted' }}>{formatRelative(n.createdAt)}</Typography>
                    </Box>
                    <Typography
                      sx={{
                        mt: 0.25,
                        fontSize: 12.5,
                        color: 'text.muted',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}
                    >
                      {n.body}
                    </Typography>
                  </Box>
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Popover>
  )
}
