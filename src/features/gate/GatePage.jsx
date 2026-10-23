import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import RefreshIcon from '@mui/icons-material/Refresh'
import LogoutIcon from '@mui/icons-material/Logout'
import LoginIcon from '@mui/icons-material/Login'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader } from '@/components/ui/Card'
import { SearchInput } from '@/components/ui/SearchInput'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, LinkText, Skeleton } from '@/components/ui/Feedback'
import { formatKm, formatRelative, formatSmartDateTime, formatTime } from '@/utils/format'
import { DeploymentTransitionDialog } from '@/features/deployments/DeploymentTransitionDialog'

/**
 * The gatekeeper's screen: dispatched vehicles about to leave and vehicles currently out.
 * Each row shows the deployment number, plate, driver and status so the right one is picked;
 * departure requires the start odometer, return the end odometer.
 */
export default function GatePage() {
  const { can } = useAuth()
  const board = useQuery({ queryKey: ['gate', 'board'], queryFn: () => http.get('/gate/board'), refetchInterval: 30_000 })
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState(null) // { deployment, status }
  const vehicle = useQuery({
    queryKey: ['vehicles', 'detail', String(dialog?.deployment?.vehicleId)],
    queryFn: () => http.get(`/vehicles/${dialog.deployment.vehicleId}`),
    enabled: Boolean(dialog?.deployment) && dialog?.status === 'IN_PROGRESS' && can('VEHICLE_READ'),
  })
  const b = board.data
  const matches = (t) => {
    const s = q.trim().toLowerCase()
    if (!s) return true
    return [t.deploymentNumber, t.vehiclePlate, t.driverName, t.institution, t.destination].some((v) => v?.toLowerCase().includes(s))
  }
  const todayKey = new Date().toISOString().slice(0, 10)
  const departures = (b?.departures ?? []).filter(matches)
  const out = (b?.out ?? []).filter(matches)
  const dueToday = (b?.departures ?? []).filter((t) => t.scheduledStartAt <= `${todayKey}T23:59:59`)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Gate"
        description="Record the odometer as each vehicle leaves and when it returns to Kacyiru. Pick the deployment by its number, plate and driver."
        actions={
          <Button icon={RefreshIcon} variant="ghost" onClick={() => board.refetch()} loading={board.isFetching && !board.isLoading}>
            Refresh
          </Button>
        }
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <SearchInput value={q} onChange={setQ} placeholder="Plate, deployment no., driver…" sx={{ width: { xs: '100%', sm: 300 } }} />
          {b ? (
            <Typography component="span" sx={{ fontSize: 12, color: 'text.muted' }}>
              Updated {formatRelative(board.dataUpdatedAt)}
            </Typography>
          ) : null}
        </Box>
      </PageHeader>
      {board.isError ? <ErrorState error={board.error} onRetry={board.refetch} /> : null}
      <StatGrid cols={4}>
        <Stat
          label="Due to leave today"
          value={b ? dueToday.length : null}
          icon={LogoutIcon}
          loading={board.isLoading}
          tone={dueToday.length ? 'warning' : undefined}
        />
        <Stat label="Vehicles out" value={b?.out.length} icon={DirectionsCarIcon} loading={board.isLoading} tone="accent" />
        <Stat label="Departed today" value={b?.departedToday} icon={PlayArrowIcon} loading={board.isLoading} />
        <Stat label="Returned today" value={b?.returnedToday.length} icon={LoginIcon} loading={board.isLoading} />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}>
        <Card>
          <CardHeader title="Leaving" description="Dispatched deployments waiting for the departure reading." />
          {board.isLoading ? (
            <Box sx={{ p: 2 }}>
              <Skeleton height={160} />
            </Box>
          ) : !departures.length ? (
            <EmptyState icon={LogoutIcon} title="Nothing waiting to leave" description="Dispatched deployments appear here." compact />
          ) : (
            <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {departures.map((t) => (
                <GateRow
                  key={t.id}
                  t={t}
                  time={formatSmartDateTime(t.scheduledStartAt)}
                  overdue={t.scheduledStartAt < new Date().toISOString()}
                  action={
                    <Button
                      size="sm"
                      variant="primary"
                      icon={PlayArrowIcon}
                      onClick={() => setDialog({ deployment: t, status: 'IN_PROGRESS' })}
                    >
                      Record departure
                    </Button>
                  }
                />
              ))}
            </Stack>
          )}
        </Card>
        <Card>
          <CardHeader title="Out" description="Vehicles on the road. Record the return reading when they are back." />
          {board.isLoading ? (
            <Box sx={{ p: 2 }}>
              <Skeleton height={160} />
            </Box>
          ) : !out.length ? (
            <EmptyState icon={DirectionsCarIcon} title="No vehicles out" description="Every deployed vehicle is back." compact />
          ) : (
            <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {out.map((t) => (
                <GateRow
                  key={t.id}
                  t={t}
                  time={`Departed ${formatSmartDateTime(t.startedAt)} at ${formatKm(t.startOdometer)}`}
                  action={
                    <Button size="sm" variant="primary" icon={StopIcon} onClick={() => setDialog({ deployment: t, status: 'COMPLETED' })}>
                      Record return
                    </Button>
                  }
                />
              ))}
            </Stack>
          )}
        </Card>
      </Box>
      {b?.returnedToday.length ? (
        <Card>
          <CardHeader title="Returned today" />
          <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {b.returnedToday.map((t) => (
              <GateRow
                key={t.id}
                t={t}
                compact
                time={`Returned ${formatTime(t.endedAt)} at ${formatKm(t.endOdometer)} · ${formatKm(t.distanceKm)}`}
                action={<CheckCircleOutlinedIcon sx={{ color: 'soft.success.fg' }} aria-hidden />}
              />
            ))}
          </Stack>
        </Card>
      ) : null}
      <DeploymentTransitionDialog
        deployment={dialog?.deployment}
        status={dialog?.status ?? null}
        vehicle={vehicle.data}
        onClose={() => setDialog(null)}
        onDone={() => board.refetch()}
      />
    </Stack>
  )
}

function GateRow({ t, time, action, overdue = false, compact = false }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: compact ? 1.25 : 1.75,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
      }}
    >
      <Box sx={{ minWidth: 0, flex: '1 1 240px' }}>
        <Typography
          sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
        >
          {t.vehiclePlate}
          <StatusBadge kind="deployment" value={t.status} size="sm" />
        </Typography>
        <Typography sx={{ fontSize: 12.5, color: 'text.muted', mt: 0.25 }}>
          <LinkText to={`/deployments/${t.id}`} sx={{ fontFamily: (th) => th.typography.fontFamilyMono }}>
            {t.deploymentNumber}
          </LinkText>
          {' · '}
          {t.driverName}
          {t.institution ? ` · ${t.institution}` : ''} · to {t.destination}
        </Typography>
        <Typography sx={{ fontSize: 12, color: overdue ? 'soft.danger.fg' : 'text.muted', fontWeight: overdue ? 500 : 400 }}>
          {overdue ? 'Overdue · ' : ''}
          {time}
        </Typography>
      </Box>
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  )
}
