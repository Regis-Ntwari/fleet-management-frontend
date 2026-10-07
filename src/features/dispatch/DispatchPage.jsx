import { useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { addDays, format } from 'date-fns'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ButtonBase from '@mui/material/ButtonBase'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import AddIcon from '@mui/icons-material/Add'
import RefreshIcon from '@mui/icons-material/Refresh'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import SensorsIcon from '@mui/icons-material/Sensors'
import BuildIcon from '@mui/icons-material/Build'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import RouteIcon from '@mui/icons-material/Route'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { StatusBadge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Field'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { formatDate, formatRelative, formatTime, formatSmartDateTime } from '@/utils/format'
import { AssignDriverDialog } from '@/features/assignments/AssignDriverDialog'

const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

/** Full-width clickable lane row (old `flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-subtle`). */
const rowButtonSx = {
  display: 'flex',
  width: '100%',
  alignItems: 'center',
  justifyContent: 'flex-start',
  gap: 1.5,
  px: 2,
  py: 1.25,
  textAlign: 'left',
  fontFamily: 'inherit',
  '&:hover': { bgcolor: 'background.subtle' },
}

/** Compact lane link row (old `flex items-center justify-between gap-2 px-4 py-2 hover:bg-surface-subtle`). */
const rowLinkSx = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 1,
  px: 2,
  py: 1,
  textDecoration: 'none',
  color: 'inherit',
  '&:hover': { bgcolor: 'background.subtle' },
}

export default function DispatchPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [state, update] = useSearchState({ date: today })
  const { can } = useAuth()
  const navigate = useNavigate()
  const [assignOpen, setAssignOpen] = useState(false)
  const board = useQuery({
    queryKey: ['dispatch', 'board', state.date],
    queryFn: () => http.get('/dispatch/board', { params: { date: state.date } }),
    refetchInterval: 60_000,
  })
  const b = board.data
  const shift = (days) => update({ date: format(addDays(new Date(state.date), days), 'yyyy-MM-dd') })

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Dispatch"
        description={`Departures, returns, running trips and the resources available on ${formatDate(state.date)}.`}
        actions={
          <>
            <Button icon={RefreshIcon} variant="ghost" onClick={() => board.refetch()} loading={board.isFetching && !board.isLoading}>
              Refresh
            </Button>
            {can('ASSIGNMENT_MANAGE') ? (
              <Button icon={PersonAddIcon} onClick={() => setAssignOpen(true)}>
                Assign driver
              </Button>
            ) : null}
            {can('TRIP_MANAGE') ? (
              <Button variant="primary" icon={AddIcon} to="/trips/new">
                Plan trip
              </Button>
            ) : null}
          </>
        }
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
          <IconButton label="Previous day" icon={ChevronLeftIcon} size="sm" variant="secondary" onClick={() => shift(-1)} />
          <Input
            type="date"
            value={state.date}
            onChange={(e) => update({ date: e.target.value || today })}
            fullWidth={false}
            sx={{ height: 32, width: 'auto', '& .MuiInputBase-input': { py: '5px' } }}
            aria-label="Date"
          />
          <IconButton label="Next day" icon={ChevronRightIcon} size="sm" variant="secondary" onClick={() => shift(1)} />
          {state.date !== today ? (
            <Button size="xs" variant="ghost" onClick={() => update({ date: today })}>
              Today
            </Button>
          ) : null}
          {b ? (
            <Typography component="span" sx={{ ml: 1, fontSize: 12, color: 'text.muted' }}>
              Updated {formatRelative(board.dataUpdatedAt)}
            </Typography>
          ) : null}
        </Box>
      </PageHeader>

      {board.isError ? <ErrorState error={board.error} onRetry={board.refetch} /> : null}

      <StatGrid cols={6}>
        <Stat label="Departures" value={b?.departures.length} icon={RouteIcon} loading={board.isLoading} />
        <Stat label="On the road now" value={b?.counts.vehiclesOnTrip} icon={SensorsIcon} tone="accent" loading={board.isLoading} />
        <Stat label="Expected returns" value={b?.expectedReturns.length} loading={board.isLoading} />
        <Stat
          label="Vehicles available"
          value={b?.availableVehicles.length}
          tone="success"
          loading={board.isLoading}
          hint={b ? `${b.counts.vehiclesInWorkshop} in workshop` : null}
        />
        <Stat label="Drivers available" value={b?.availableDrivers.length} tone="success" loading={board.isLoading} />
        <Stat
          label="Bookings without vehicle"
          value={b?.counts.unassignedBookings}
          icon={EventAvailableIcon}
          tone={b?.counts.unassignedBookings ? 'warning' : undefined}
          loading={board.isLoading}
          to="/bookings?status=REQUESTED,CONFIRMED&upcoming=true"
        />
      </StatGrid>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
          <Lane
            title="Current trips"
            description="In progress right now"
            loading={board.isLoading}
            items={b?.currentTrips}
            empty="No trips in progress."
            render={(t) => <TripRow trip={t} onClick={() => navigate(`/trips/${t.id}`)} timeLabel={`since ${formatTime(t.startedAt)}`} />}
          />
          <Lane
            title="Departures"
            description={`Scheduled on ${formatDate(state.date)}`}
            loading={board.isLoading}
            items={b?.departures}
            empty="No departures scheduled."
            render={(t) => <TripRow trip={t} onClick={() => navigate(`/trips/${t.id}`)} timeLabel={formatTime(t.scheduledStartAt)} />}
          />
          <Lane
            title="Upcoming bookings"
            description="Next three days, not yet completed"
            loading={board.isLoading}
            items={b?.upcomingBookings}
            empty="No upcoming bookings."
            render={(bk) => (
              <ButtonBase onClick={() => navigate(`/bookings/${bk.id}`)} sx={rowButtonSx}>
                <Box component="span" className="tabular" sx={{ width: 96, flexShrink: 0, fontSize: 12.5, color: 'text.muted' }}>
                  {formatSmartDateTime(bk.pickupAt)}
                </Box>
                <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                  <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>
                    {bk.company ?? bk.customerName}{' '}
                    <Box component="span" sx={{ fontWeight: 400, color: 'text.muted' }}>
                      · {bk.bookingNumber}
                    </Box>
                  </Box>
                  <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 12.5, color: 'text.muted' }}>
                    {bk.pickupLocation} → {bk.dropoffLocation} · {bk.requestedCategoryName}
                  </Box>
                </Box>
                <Box component="span" sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 12.5, color: 'text.secondary' }}>
                  {bk.vehiclePlate ?? (
                    <Box component="span" sx={{ color: 'soft.warning.fg' }}>
                      needs vehicle
                    </Box>
                  )}
                </Box>
                <StatusBadge kind="booking" value={bk.status} size="sm" />
              </ButtonBase>
            )}
          />
        </Stack>
        <Stack spacing={2}>
          <Lane
            title="Vehicles available"
            description="Assigned vehicles can still be dispatched with their driver"
            loading={board.isLoading}
            items={b?.availableVehicles}
            empty="No vehicles available."
            compact
            render={(v) => (
              <Box component={RouterLink} to={`/vehicles/${v.id}`} sx={rowLinkSx}>
                <Box component="span" sx={{ minWidth: 0 }}>
                  <Box component="span" sx={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'text.primary' }}>
                    {v.plateNumber}
                  </Box>
                  <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 12, color: 'text.muted' }}>
                    {v.make} {v.model} · {v.categoryName}
                  </Box>
                </Box>
                <StatusBadge kind="vehicle" value={v.status} size="sm" dot={false} />
              </Box>
            )}
          />
          <Lane
            title="Drivers available"
            loading={board.isLoading}
            items={b?.availableDrivers}
            empty="No drivers available."
            compact
            render={(d) => (
              <Box component={RouterLink} to={`/drivers/${d.id}`} sx={rowLinkSx}>
                <Box component="span" sx={{ minWidth: 0 }}>
                  <Box component="span" sx={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'text.primary' }}>
                    {d.fullName}
                  </Box>
                  <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 12, color: 'text.muted' }}>
                    {d.currentVehiclePlate ? `with ${d.currentVehiclePlate}` : 'no vehicle'} · {d.phone}
                  </Box>
                </Box>
                <StatusBadge kind="driver" value={d.status} size="sm" dot={false} />
              </Box>
            )}
          />
          <Card>
            <CardHeader
              title="In workshop"
              compact
              actions={
                <Button size="xs" variant="ghost" to="/maintenance?open=true" icon={BuildIcon}>
                  Open jobs
                </Button>
              }
            />
            <CardBody sx={{ p: 2, fontSize: 13, color: 'text.muted' }}>
              {board.isLoading ? (
                <Skeleton height={20} width={160} />
              ) : (
                `${b?.counts.vehiclesInWorkshop ?? 0} vehicle(s) unavailable for dispatch.`
              )}
            </CardBody>
          </Card>
        </Stack>
      </Box>
      <AssignDriverDialog open={assignOpen} onClose={() => setAssignOpen(false)} />
    </Stack>
  )
}

function Lane({ title, description, items, loading, empty, render, compact = false }) {
  return (
    <Card>
      <CardHeader
        title={title}
        description={description}
        compact={compact}
        actions={
          items ? (
            <Box component="span" className="tabular" sx={{ fontSize: 12, color: 'text.muted' }}>
              {items.length}
            </Box>
          ) : null
        }
      />
      {loading ? (
        <Stack spacing={1} sx={{ p: 2 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} height={36} />
          ))}
        </Stack>
      ) : !items?.length ? (
        <Typography sx={{ px: 2, py: 3, textAlign: 'center', fontSize: 13, color: 'text.muted' }}>{empty}</Typography>
      ) : (
        <Box
          component="ul"
          className={compact ? 'scrollbar-thin' : undefined}
          sx={[
            { listStyle: 'none', m: 0, p: 0, '& > * + *': { borderTop: 1, borderColor: 'divider' } },
            compact && { maxHeight: 320, overflowY: 'auto' },
          ]}
        >
          {items.map((item) => (
            <Box component="li" key={item.id}>
              {render(item)}
            </Box>
          ))}
        </Box>
      )}
    </Card>
  )
}

function TripRow({ trip: t, onClick, timeLabel }) {
  return (
    <ButtonBase onClick={onClick} sx={rowButtonSx}>
      <Box component="span" className="tabular" sx={{ width: 96, flexShrink: 0, fontSize: 12.5, color: 'text.muted' }}>
        {timeLabel}
      </Box>
      <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
        <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>
          {t.vehiclePlate}{' '}
          <Box component="span" sx={{ fontWeight: 400, color: 'text.muted' }}>
            · {t.driverName}
          </Box>
        </Box>
        <Box component="span" sx={{ display: 'block', ...truncate, fontSize: 12.5, color: 'text.muted' }}>
          {t.startLocation} → {t.destination}
          {t.customerName ? ` · ${t.customerName}` : ''}
        </Box>
      </Box>
      <StatusBadge kind="trip" value={t.status} size="sm" />
    </ButtonBase>
  )
}
