import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import BuildIcon from '@mui/icons-material/Build'
import RouteIcon from '@mui/icons-material/Route'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import BadgeIcon from '@mui/icons-material/Badge'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import PlaceIcon from '@mui/icons-material/Place'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList } from '@/components/ui/Display'
import { Badge, StatusBadge, ToneBadge } from '@/components/ui/Badge'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, ErrorState, InlineAlert, LinkText, Skeleton } from '@/components/ui/Feedback'
import { formatCurrency, formatDate, formatKm, formatLitres, formatSmartDateTime, formatTime } from '@/utils/format'
import { TripTransitionDialog } from '@/features/trips/TripTransitionDialog'
import { FuelSubmitDialog } from '@/features/fuel/FuelSubmitDialog'
import { ReportProblemDialog } from '@/features/maintenance/ReportProblemDialog'

const OPEN_ALLOCATION = ['PENDING', 'RETURNED', 'SUBMITTED']

/**
 * The driver's workspace. Everything a driver does lives here: start and complete the trips
 * they are dispatched on, fill up against fuel allocations and submit the receipt, and report
 * the vehicle for maintenance. Scope comes from the driver profile linked to the account.
 */
export default function MyDayPage() {
  const { can } = useAuth()
  const ws = useQuery({ queryKey: ['me', 'workspace'], queryFn: () => http.get('/me/workspace'), refetchInterval: 60_000 })
  const [tripDialog, setTripDialog] = useState(null) // { trip, status }
  const [fuelDialog, setFuelDialog] = useState(null) // allocation
  const [reporting, setReporting] = useState(false)

  if (ws.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={200} />
        <Skeleton height={96} />
        <Skeleton height={320} />
      </Stack>
    )
  if (ws.isError) return <ErrorState error={ws.error} onRetry={ws.refetch} />
  const w = ws.data
  const driver = w.driver
  const vehicle = w.vehicle

  if (!driver)
    return (
      <Stack spacing={2.5}>
        <PageHeader title="My day" description="Your trips, fuel allocations and vehicle for today." />
        <InlineAlert tone="warning" title="No driver profile linked to your account">
          Your sign-in is not linked to a driver profile, so there is nothing to show here yet. Ask IT to link your account to your driver
          record under Administration → Users.
        </InlineAlert>
      </Stack>
    )

  const active = w.trips.active
  const upcoming = w.trips.upcoming
  const openAllocations = w.fuelAllocations.filter((a) => OPEN_ALLOCATION.includes(a.status))
  const closedAllocations = w.fuelAllocations.filter((a) => !OPEN_ALLOCATION.includes(a.status))
  const litresToCollect = openAllocations.filter((a) => a.status !== 'SUBMITTED').reduce((s, a) => s + a.litresAllocated, 0)
  const todayCount =
    upcoming.filter((t) => t.scheduledStartAt.slice(0, 10) === new Date().toISOString().slice(0, 10)).length + (active ? 1 : 0)
  const canStart = can('TRIP_START')
  const canFuel = can('FUEL_SUBMIT')
  const canReport = can('MAINTENANCE_REPORT') && Boolean(vehicle)
  const licenceTone = w.licence?.status === 'EXPIRED' ? 'danger' : w.licence?.status === 'EXPIRING_SOON' ? 'warning' : undefined

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="My day"
        description={`${driver.fullName} · ${driver.employeeNumber}${vehicle ? ` · driving ${vehicle.plateNumber}` : ' · no vehicle assigned'}`}
        actions={
          canReport ? (
            <Button variant="primary" icon={BuildIcon} onClick={() => setReporting(true)}>
              Report a problem
            </Button>
          ) : null
        }
      />
      {w.licence?.status === 'EXPIRED' ? (
        <InlineAlert tone="danger" title="Your driving licence has expired">
          Trips cannot be started until a renewed licence is on file. Speak to the fleet office.
        </InlineAlert>
      ) : w.licence?.status === 'EXPIRING_SOON' ? (
        <InlineAlert tone="warning" title={`Your driving licence expires in ${w.licence.days} day${w.licence.days === 1 ? '' : 's'}`}>
          Renew it and hand the new licence to the fleet office so dispatch is not blocked.
        </InlineAlert>
      ) : null}
      {active ? (
        <InlineAlert
          tone="info"
          title={`On trip ${active.tripNumber} to ${active.destination}`}
          action={
            canStart ? (
              <Button size="sm" variant="primary" icon={StopIcon} onClick={() => setTripDialog({ trip: active, status: 'COMPLETED' })}>
                Complete trip
              </Button>
            ) : null
          }
        >
          Started {formatSmartDateTime(active.startedAt)} at {formatKm(active.startOdometer)}. Complete the trip when you arrive and enter
          the odometer.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="Vehicle"
          value={vehicle?.plateNumber ?? '—'}
          icon={DirectionsCarIcon}
          hint={vehicle ? `${vehicle.make} ${vehicle.model}` : 'Nothing assigned'}
        />
        <Stat
          label="Trips today"
          value={todayCount}
          icon={RouteIcon}
          hint={active ? 'One in progress' : upcoming[0] ? `Next ${formatTime(upcoming[0].scheduledStartAt)}` : 'Nothing scheduled'}
        />
        <Stat
          label="Fuel to collect"
          value={litresToCollect ? formatLitres(litresToCollect) : '—'}
          icon={LocalGasStationIcon}
          tone={litresToCollect ? 'warning' : undefined}
          hint={
            openAllocations.length
              ? `${openAllocations.length} open allocation${openAllocations.length === 1 ? '' : 's'}`
              : 'Nothing allocated'
          }
        />
        <Stat
          label="Licence"
          value={w.licence?.status === 'EXPIRED' ? 'Expired' : w.licence?.status === 'EXPIRING_SOON' ? `${w.licence.days} days` : 'Valid'}
          icon={BadgeIcon}
          tone={licenceTone}
          hint={`Until ${formatDate(driver.licenseExpiry)}`}
        />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
          <Card>
            <CardHeader
              title="Trips"
              description="Dispatched trips can be started from here. Planned trips wait for the office to dispatch them."
            />
            {!active && !upcoming.length ? (
              <EmptyState
                icon={RouteIcon}
                title="No trips coming up"
                description="Trips the office assigns to you over the next three days appear here."
                compact
              />
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {[active, ...upcoming].filter(Boolean).map((t) => (
                  <TripRow
                    key={t.id}
                    trip={t}
                    action={
                      canStart && t.status === 'DISPATCHED' && !active ? (
                        <Button
                          size="sm"
                          variant="primary"
                          icon={PlayArrowIcon}
                          onClick={() => setTripDialog({ trip: t, status: 'IN_PROGRESS' })}
                        >
                          Start trip
                        </Button>
                      ) : canStart && t.status === 'IN_PROGRESS' ? (
                        <Button size="sm" variant="primary" icon={StopIcon} onClick={() => setTripDialog({ trip: t, status: 'COMPLETED' })}>
                          Complete
                        </Button>
                      ) : t.status === 'DISPATCHED' && active ? (
                        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>Finish the current trip first</Typography>
                      ) : t.status === 'PLANNED' ? (
                        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>Awaiting dispatch</Typography>
                      ) : null
                    }
                  />
                ))}
              </Stack>
            )}
          </Card>
          <Card>
            <CardHeader
              title="Fuel allocations"
              description="Fill up as allocated, then submit the receipt. The fleet officer verifies it and the fuel is recorded."
            />
            {!openAllocations.length && !closedAllocations.length ? (
              <EmptyState
                icon={LocalGasStationIcon}
                title="No fuel allocated"
                description="When the fleet officer allocates fuel for your vehicle it shows up here."
                compact
              />
            ) : (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {openAllocations.map((a) => (
                  <AllocationRow
                    key={a.id}
                    allocation={a}
                    action={
                      canFuel && ['PENDING', 'RETURNED'].includes(a.status) ? (
                        <Button size="sm" variant="primary" icon={ReceiptLongIcon} onClick={() => setFuelDialog(a)}>
                          {a.status === 'RETURNED' ? 'Fix and resubmit' : 'Submit receipt'}
                        </Button>
                      ) : a.status === 'SUBMITTED' ? (
                        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>Waiting for verification</Typography>
                      ) : null
                    }
                  />
                ))}
                {closedAllocations.map((a) => (
                  <AllocationRow key={a.id} allocation={a} muted />
                ))}
              </Stack>
            )}
          </Card>
        </Stack>
        <Stack spacing={2}>
          <Card>
            <CardHeader title="My vehicle" />
            <CardBody>
              {vehicle ? (
                <DescriptionList
                  columns={1}
                  items={[
                    {
                      label: 'Plate',
                      value: (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          <Box component="span" sx={{ fontWeight: 600 }}>
                            {vehicle.plateNumber}
                          </Box>
                          <StatusBadge kind="vehicle" value={vehicle.status} size="sm" />
                        </Box>
                      ),
                    },
                    { label: 'Vehicle', value: `${vehicle.make} ${vehicle.model} · ${vehicle.year} · ${vehicle.color}` },
                    { label: 'Odometer', value: formatKm(vehicle.odometerKm) },
                    { label: 'Fuel', value: vehicle.fuelType.charAt(0) + vehicle.fuelType.slice(1).toLowerCase() },
                    {
                      label: 'Next service',
                      value: (
                        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 1 }}>
                          {vehicle.nextServiceKm ? formatKm(vehicle.nextServiceKm) : 'Not scheduled'}
                          <ToneBadge value={vehicle.maintenanceStatus} size="sm" />
                        </Box>
                      ),
                    },
                  ]}
                />
              ) : (
                <EmptyState
                  icon={DirectionsCarIcon}
                  title="No vehicle assigned"
                  description="The fleet office assigns vehicles to drivers."
                  compact
                />
              )}
              {canReport ? (
                <Button icon={BuildIcon} onClick={() => setReporting(true)} sx={{ mt: 2 }} fullWidth>
                  Report a problem with {vehicle.plateNumber}
                </Button>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Reported problems" description="What you have sent to the workshop and where it stands." />
            {w.maintenance.length ? (
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {w.maintenance.map((m) => (
                  <Box
                    component="li"
                    key={m.id}
                    sx={{
                      display: 'flex',
                      gap: 1.5,
                      alignItems: 'flex-start',
                      px: 2.5,
                      py: 1.5,
                      borderBottom: 1,
                      borderColor: 'divider',
                      '&:last-child': { borderBottom: 0 },
                    }}
                  >
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>{m.complaint}</Typography>
                      <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
                        {m.maintenanceNumber} · {m.vehiclePlate} · {formatSmartDateTime(m.reportedAt)}
                        {m.workshop ? ` · ${m.workshop}` : ''}
                      </Typography>
                    </Box>
                    <StatusBadge kind="maintenance" value={m.status} size="sm" />
                  </Box>
                ))}
              </Stack>
            ) : (
              <EmptyState
                icon={BuildIcon}
                title="Nothing reported"
                description="Report brakes, lights, noises or anything that feels wrong."
                compact
              />
            )}
          </Card>
          {w.trips.recent.length ? (
            <Card>
              <CardHeader title="Recent trips" />
              <Stack component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {w.trips.recent.map((t) => (
                  <TripRow key={t.id} trip={t} compact />
                ))}
              </Stack>
            </Card>
          ) : null}
        </Stack>
      </Box>
      <TripTransitionDialog
        trip={tripDialog?.trip}
        status={tripDialog?.status ?? null}
        vehicle={vehicle}
        onClose={() => setTripDialog(null)}
        onDone={() => ws.refetch()}
      />
      <FuelSubmitDialog
        open={Boolean(fuelDialog)}
        allocation={fuelDialog}
        onClose={() => setFuelDialog(null)}
        onDone={() => ws.refetch()}
      />
      <ReportProblemDialog open={reporting} vehicle={vehicle} onClose={() => setReporting(false)} onDone={() => ws.refetch()} />
    </Stack>
  )
}

function TripRow({ trip: t, action, compact = false }) {
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
        bgcolor: t.status === 'IN_PROGRESS' ? 'soft.accent.bg' : 'transparent',
      }}
    >
      <Box className="tabular" sx={{ width: 56, flexShrink: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600, lineHeight: 1.2 }}>{formatTime(t.scheduledStartAt)}</Typography>
        <Typography sx={{ fontSize: 11.5, color: 'text.muted' }}>{formatDate(t.scheduledStartAt)}</Typography>
      </Box>
      <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
          <PlaceIcon sx={{ fontSize: 14, color: 'text.muted', flexShrink: 0 }} aria-hidden />
          <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {t.startLocation} → {t.destination}
          </Box>
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
          <LinkText to={`/trips/${t.id}`}>{t.tripNumber}</LinkText> · {t.purpose}
          {t.customerName ? ` · ${t.customerName}` : ''} · {t.passengers} pax
          {t.distanceKm != null ? ` · ${formatKm(t.distanceKm)}` : ''}
        </Typography>
      </Box>
      <StatusBadge kind="trip" value={t.status} size="sm" />
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  )
}

function AllocationRow({ allocation: a, action, muted = false }) {
  return (
    <Box
      component="li"
      sx={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 1.5,
        px: 2.5,
        py: muted ? 1.25 : 1.75,
        borderBottom: 1,
        borderColor: 'divider',
        '&:last-child': { borderBottom: 0 },
        opacity: muted ? 0.75 : 1,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          width: 40,
          height: 40,
          flexShrink: 0,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: a.status === 'RETURNED' ? 'soft.danger.bg' : a.status === 'VERIFIED' ? 'soft.success.bg' : 'soft.warning.bg',
          color: a.status === 'RETURNED' ? 'soft.danger.fg' : a.status === 'VERIFIED' ? 'soft.success.fg' : 'soft.warning.fg',
        }}
      >
        <LocalGasStationIcon sx={{ fontSize: 20 }} aria-hidden />
      </Box>
      <Box sx={{ minWidth: 0, flex: '1 1 220px' }}>
        <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>
          {formatLitres(a.litresAllocated)} for {a.vehiclePlate}
          {a.station ? ` at ${a.station}` : ''}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
          <LinkText to={`/fuel/allocations/${a.id}`}>{a.requestNumber}</LinkText>
          {a.purpose ? ` · ${a.purpose}` : ''}
          {a.dueAt && ['PENDING', 'RETURNED'].includes(a.status) ? (
            <Box component="span" sx={a.overdue ? { color: 'soft.danger.fg', fontWeight: 500 } : undefined}>
              {' '}
              · fill up by {formatSmartDateTime(a.dueAt)}
              {a.overdue ? ' (overdue)' : ''}
            </Box>
          ) : null}
          {a.submission && a.status !== 'PENDING'
            ? ` · receipt ${formatLitres(a.submission.litres)} · ${formatCurrency(a.submission.totalAmount)}`
            : ''}
        </Typography>
        {a.status === 'RETURNED' && a.reviewNote ? (
          <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'soft.danger.fg' }}>Returned: {a.reviewNote}</Typography>
        ) : null}
        {a.notes && a.status === 'PENDING' ? (
          <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'text.secondary' }}>{a.notes}</Typography>
        ) : null}
      </Box>
      {muted ? (
        <StatusBadge kind="fuelRequest" value={a.status} size="sm" />
      ) : a.status === 'SUBMITTED' ? (
        <Badge tone="info" size="sm" dot>
          Submitted
        </Badge>
      ) : null}
      {action ? <Box sx={{ flexShrink: 0 }}>{action}</Box> : null}
    </Box>
  )
}
