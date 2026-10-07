import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from 'recharts'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import RouteIcon from '@mui/icons-material/Route'
import BuildIcon from '@mui/icons-material/Build'
import SensorsIcon from '@mui/icons-material/Sensors'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PeopleIcon from '@mui/icons-material/People'
import DescriptionIcon from '@mui/icons-material/Description'
import SpeedIcon from '@mui/icons-material/Speed'
import PaymentsIcon from '@mui/icons-material/Payments'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import { useSearchState } from '@/hooks/useSearchState'
import { defaultRange } from '@/components/ui/DateRange'
import { PageHeader } from '@/components/ui/PageHeader'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import {
  CHART_BG,
  CHART_CURSOR,
  ChartFrame,
  ChartLegend,
  ChartTooltip,
  SERIES,
  STATUS_COLORS,
  axisProps,
  gridProps,
} from '@/components/ui/charts'
import { Badge, StatusBadge, ToneBadge } from '@/components/ui/Badge'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import {
  formatCompactNumber,
  formatCurrency,
  formatDate,
  formatKm,
  formatNumber,
  formatPercent,
  formatRelative,
  formatShortDate,
} from '@/utils/format'
import { DashboardFilters } from './DashboardFilters'
import {
  useAvailabilityTrend,
  useCostByVehicle,
  useDashboardAlerts,
  useDashboardSummary,
  useDistanceTrend,
  useFleetStatus,
  useFuelTrend,
  useMaintenanceOverview,
  useUtilization,
} from './api'

const DEFAULTS = defaultRange('30d')

const SEVERITY_DOT = { CRITICAL: 'error.main', WARNING: 'warning.main' }

/** Small muted caption above a list or chart inside a card. */
function SectionLabel({ children }) {
  return <Typography sx={{ mb: 1, fontSize: 12, fontWeight: 500, color: 'text.muted' }}>{children}</Typography>
}

/** Centred muted placeholder text used when a card has nothing to show. */
function EmptyText({ children, sx }) {
  return (
    <Typography sx={[{ py: 5, textAlign: 'center', fontSize: 13, color: 'text.muted' }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}>
      {children}
    </Typography>
  )
}

const truncate = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

export default function DashboardPage() {
  const [state, update, reset] = useSearchState(DEFAULTS)
  const params = useMemo(
    () => ({
      from: state.from,
      to: state.to,
      categoryId: state.categoryId,
      department: state.department,
      status: state.status,
      vehicleId: state.vehicleId,
      driverId: state.driverId,
    }),
    [state],
  )

  const summary = useDashboardSummary(params)
  const s = summary.data

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Dashboard"
        description={
          s
            ? `Fleet position for ${formatDate(s.period.from)} – ${formatDate(s.period.to)} · ${s.period.days} days`
            : 'Operational position of the LIMOZ fleet.'
        }
        actions={
          <Button to="/daily-position" icon={SpeedIcon}>
            Daily position
          </Button>
        }
      >
        <DashboardFilters state={state} update={update} reset={reset} />
      </PageHeader>

      {summary.isError ? <ErrorState error={summary.error} onRetry={summary.refetch} /> : null}

      <StatGrid cols={6}>
        <Stat
          label="Total vehicles"
          value={s?.totalVehicles}
          icon={DirectionsCarIcon}
          loading={summary.isLoading}
          to="/vehicles"
          hint={s ? `${s.inactiveVehicles} inactive` : null}
        />
        <Stat
          label="Available"
          value={s?.availableVehicles}
          icon={CheckCircleIcon}
          tone="success"
          loading={summary.isLoading}
          to="/vehicles?status=AVAILABLE"
          hint={s ? `${s.assignedVehicles} assigned · ${s.reservedVehicles} reserved` : null}
        />
        <Stat
          label="On trip now"
          value={s?.onTripVehicles}
          icon={RouteIcon}
          tone="accent"
          loading={summary.isLoading}
          to="/trips?status=IN_PROGRESS"
          hint={s ? `${s.tripsToday} trips scheduled today` : null}
        />
        <Stat
          label="In workshop"
          value={s?.inWorkshopVehicles}
          icon={BuildIcon}
          tone="warning"
          loading={summary.isLoading}
          to="/maintenance?open=true"
          hint={s ? `${s.outOfServiceVehicles} out of service` : null}
        />
        <Stat
          label="GPS problems"
          value={s?.gpsProblemVehicles}
          icon={SensorsIcon}
          tone={s?.gpsProblemVehicles ? 'danger' : undefined}
          loading={summary.isLoading}
          to="/vehicles?gpsStatus=OFFLINE"
          hint={s ? `${s.fuelSensorProblemVehicles} fuel sensor faults` : null}
        />
        <Stat
          label="Not moved today"
          value={s?.idleVehicles}
          icon={SpeedIcon}
          tone={s?.idleVehicles ? 'warning' : undefined}
          loading={summary.isLoading}
          to="/daily-position"
          hint={s ? `${formatKm(s.distanceTodayKm)} driven today` : null}
        />
      </StatGrid>

      <StatGrid cols={6}>
        <Stat
          label="Trips completed"
          value={s?.tripsInPeriod}
          delta={s?.deltas.tripsInPeriod}
          loading={summary.isLoading}
          to="/trips?status=COMPLETED"
        />
        <Stat
          label="Distance"
          value={s ? formatCompactNumber(s.distanceInPeriodKm) : null}
          unit="km"
          delta={s?.deltas.distanceInPeriodKm}
          loading={summary.isLoading}
        />
        <Stat
          label="Fuel"
          value={s ? formatCurrency(s.fuelCost, { compact: true }) : null}
          delta={s?.deltas.fuelCost}
          invert
          loading={summary.isLoading}
          to="/fuel"
          hint={s ? `${formatNumber(s.fuelConsumedLitres)} L` : null}
        />
        <Stat
          label="Maintenance cost"
          value={s ? formatCurrency(s.maintenanceCost, { compact: true }) : null}
          delta={s?.deltas.maintenanceCost}
          invert
          loading={summary.isLoading}
          to="/maintenance"
          hint={s ? `${s.openMaintenance} open jobs` : null}
        />
        <Stat
          label="Cost per km"
          value={s?.costPerKm != null ? `RWF ${formatNumber(s.costPerKm)}` : '—'}
          icon={PaymentsIcon}
          loading={summary.isLoading}
          to="/reports/vehicle-cost"
          hint="fuel + maintenance"
        />
        <Stat
          label="Utilization"
          value={s ? formatPercent(s.utilizationPercent) : null}
          loading={summary.isLoading}
          to="/reports/fleet-availability"
          hint="vehicles used ÷ operational fleet"
        />
      </StatGrid>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <AlertsCard />
        <StatGrid cols={2} sx={{ gridColumn: { xl: 'span 2' }, gridTemplateColumns: { xl: 'repeat(2, minmax(0, 1fr))' } }}>
          <Stat
            label="Active drivers"
            value={s?.activeDrivers}
            icon={PeopleIcon}
            loading={summary.isLoading}
            to="/drivers"
            hint={s ? `${s.driversOnTrip} on trip` : null}
          />
          <Stat
            label="Upcoming bookings (7 days)"
            value={s?.upcomingBookings}
            icon={EventAvailableIcon}
            loading={summary.isLoading}
            to="/bookings?upcoming=true"
            hint={s ? `${s.unassignedBookings} need a vehicle` : null}
            tone={s?.unassignedBookings ? 'warning' : undefined}
          />
          <Stat
            label="Service due"
            value={s?.vehiclesDueForService}
            icon={BuildIcon}
            loading={summary.isLoading}
            to="/maintenance/schedules?state=DUE_SOON"
            hint={s ? `${s.overdueMaintenance} overdue` : null}
            tone={s?.overdueMaintenance ? 'danger' : 'warning'}
          />
          <Stat
            label="Expired documents"
            value={s?.expiredDocuments}
            icon={DescriptionIcon}
            loading={summary.isLoading}
            to="/documents?status=EXPIRED"
            hint={s ? `${s.expiringDocuments} expiring soon` : null}
            tone={s?.expiredDocuments ? 'danger' : undefined}
          />
          <Stat
            label="Active incidents"
            value={s?.activeIncidents}
            icon={WarningAmberIcon}
            loading={summary.isLoading}
            to="/incidents?status=OPEN,UNDER_INVESTIGATION"
            tone={s?.activeIncidents ? 'danger' : undefined}
          />
          <Stat
            label="Fuel sensor faults"
            value={s?.fuelSensorProblemVehicles}
            icon={LocalGasStationIcon}
            loading={summary.isLoading}
            to="/vehicles"
            tone={s?.fuelSensorProblemVehicles ? 'warning' : undefined}
          />
        </StatGrid>
      </Box>

      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { lg: 'repeat(2, minmax(0, 1fr))' } }}>
        <DistanceTrendCard params={params} />
        <FleetStatusCard params={params} />
        <AvailabilityCard params={params} />
        <FuelTrendCard params={params} />
        <MaintenanceCard params={params} />
        <CostByVehicleCard params={params} />
      </Box>

      <UtilizationCard params={params} />
    </Stack>
  )
}

function AlertsCard() {
  const alerts = useDashboardAlerts({ limit: 6 })
  const d = alerts.data
  return (
    <Card sx={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader
        title="Needs attention"
        description={d ? `${d.critical} critical · ${d.warning} warnings` : null}
        actions={
          <Button size="xs" variant="ghost" to="/alerts" iconRight={ArrowForwardIcon}>
            Alert centre
          </Button>
        }
      />
      <CardBody flush sx={{ flex: 1 }}>
        {alerts.isLoading ? (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} height={36} />
            ))}
          </Stack>
        ) : alerts.isError ? (
          <ErrorState error={alerts.error} onRetry={alerts.refetch} compact />
        ) : d?.items.length === 0 ? (
          <EmptyText sx={{ px: 2.5 }}>No open alerts. Nice.</EmptyText>
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
            {d.items.map((a) => (
              <Box component="li" key={a.id}>
                <Box
                  component={RouterLink}
                  to={alertLink(a)}
                  sx={{
                    display: 'flex',
                    gap: 1.5,
                    px: 2,
                    py: 1.25,
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background-color 150ms, color 150ms',
                    '&:hover': { bgcolor: 'background.subtle' },
                  }}
                >
                  <Box
                    component="span"
                    sx={{
                      mt: 0.75,
                      width: 8,
                      height: 8,
                      flexShrink: 0,
                      borderRadius: '50%',
                      bgcolor: SEVERITY_DOT[a.severity] ?? 'info.main',
                    }}
                    aria-hidden
                  />
                  <Box component="span" sx={{ minWidth: 0, flex: 1 }}>
                    <Box component="span" sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 1 }}>
                      <Box component="span" sx={{ ...truncate, fontSize: 13, fontWeight: 500, color: 'text.primary' }}>
                        {a.title}
                      </Box>
                      <Box component="span" sx={{ flexShrink: 0, fontSize: 11, color: 'text.muted' }}>
                        {formatRelative(a.raisedAt)}
                      </Box>
                    </Box>
                    <Box
                      component="span"
                      sx={{
                        mt: 0.25,
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        fontSize: 12.5,
                        color: 'text.muted',
                      }}
                    >
                      {a.message}
                    </Box>
                  </Box>
                </Box>
              </Box>
            ))}
          </Box>
        )}
      </CardBody>
    </Card>
  )
}

export function alertLink(a) {
  switch (a.entityType) {
    case 'VEHICLE':
      return `/vehicles/${a.entityId}`
    case 'DOCUMENT':
      return `/documents?q=${encodeURIComponent(a.entityLabel)}`
    case 'INCIDENT':
      return `/incidents/${a.entityId}`
    case 'MAINTENANCE':
      return `/maintenance/${a.entityId}`
    case 'BOOKING':
      return `/bookings/${a.entityId}`
    case 'FUEL':
      return `/fuel?anomaly=true`
    case 'TRIP':
      return `/trips/${a.entityId}`
    case 'DRIVER':
      return `/drivers/${a.entityId}`
    default:
      return '/alerts'
  }
}

function DistanceTrendCard({ params }) {
  const trend = useDistanceTrend(params)
  const data = trend.data ?? []
  const total = data.reduce((s, d) => s + d.distanceKm, 0)
  const trips = data.reduce((s, d) => s + d.trips, 0)
  return (
    <Card>
      <CardHeader
        title="Daily distance"
        description={trend.data ? `${formatKm(total)} over ${data.length} days · ${formatNumber(trips)} trips` : null}
      />
      <CardBody>
        <ChartFrame loading={trend.isLoading} empty={!trend.isLoading && total === 0}>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="distFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES[0]} stopOpacity={0.18} />
                <stop offset="100%" stopColor={SERIES[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={formatShortDate} minTickGap={28} />
            <YAxis {...axisProps} tickFormatter={formatCompactNumber} width={44} />
            <Tooltip
              content={
                <ChartTooltip
                  labelFormatter={formatDate}
                  names={{ distanceKm: 'Distance', trips: 'Trips' }}
                  format={{ distanceKm: (v) => formatKm(v), trips: (v) => formatNumber(v) }}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="distanceKm"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#distFill)"
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_BG }}
            />
          </AreaChart>
        </ChartFrame>
      </CardBody>
    </Card>
  )
}

function FleetStatusCard({ params }) {
  const status = useFleetStatus(params)
  const rows = (status.data ?? []).filter((r) => r.count > 0)
  const total = rows.reduce((s, r) => s + r.count, 0)
  return (
    <Card>
      <CardHeader
        title="Fleet status"
        description={status.data ? `${total} vehicles in scope` : null}
        actions={
          <Button size="xs" variant="ghost" to="/vehicles" iconRight={ArrowForwardIcon}>
            Vehicles
          </Button>
        }
      />
      <CardBody>
        {status.isLoading ? (
          <Stack spacing={1.5}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={24} />
            ))}
          </Stack>
        ) : rows.length === 0 ? (
          <EmptyText>No vehicles match these filters.</EmptyText>
        ) : (
          <>
            <Box
              sx={{ display: 'flex', height: 12, width: '100%', gap: 0.25, overflow: 'hidden', borderRadius: 999 }}
              role="img"
              aria-label="Fleet status distribution"
            >
              {rows.map((r) => (
                <Box
                  key={r.status}
                  style={{ width: `${(r.count / total) * 100}%`, background: STATUS_COLORS[r.tone] }}
                  title={`${r.label}: ${r.count}`}
                />
              ))}
            </Box>
            <Stack component="ul" spacing={1} sx={{ listStyle: 'none', m: 0, p: 0, mt: 2 }}>
              {rows.map((r) => (
                <Box component="li" key={r.status}>
                  <Box
                    component={RouterLink}
                    to={`/vehicles?status=${r.status}`}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 1.5,
                      borderRadius: '4px',
                      fontSize: 13,
                      textDecoration: 'none',
                      color: 'inherit',
                      '&:hover': { bgcolor: 'background.subtle' },
                    }}
                  >
                    <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'text.secondary' }}>
                      <Box
                        component="span"
                        sx={{ width: 10, height: 10, borderRadius: '4px' }}
                        style={{ background: STATUS_COLORS[r.tone] }}
                        aria-hidden
                      />
                      {r.label}
                    </Box>
                    <Box component="span" className="tabular">
                      <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                        {r.count}
                      </Box>
                      <Box component="span" sx={{ ml: 1, color: 'text.muted' }}>
                        {formatPercent((r.count / total) * 100)}
                      </Box>
                    </Box>
                  </Box>
                </Box>
              ))}
            </Stack>
          </>
        )}
      </CardBody>
    </Card>
  )
}

function AvailabilityCard({ params }) {
  const trend = useAvailabilityTrend(params)
  const data = trend.data ?? []
  return (
    <Card>
      <CardHeader title="Availability & use" description="Vehicles available, in the workshop and actually used each day" />
      <CardBody>
        <ChartLegend
          sx={{ mb: 1.5 }}
          items={[
            { label: 'Available', color: SERIES[0], shape: 'line' },
            { label: 'Used', color: SERIES[1], shape: 'line' },
            { label: 'In workshop', color: SERIES[2], shape: 'line' },
          ]}
        />
        <ChartFrame height={212} loading={trend.isLoading} empty={!trend.isLoading && data.length === 0}>
          <LineChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={formatShortDate} minTickGap={28} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            <Tooltip
              content={
                <ChartTooltip labelFormatter={formatDate} names={{ available: 'Available', used: 'Used', inWorkshop: 'In workshop' }} />
              }
            />
            <Line type="monotone" dataKey="available" stroke={SERIES[0]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="used" stroke={SERIES[1]} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="inWorkshop" stroke={SERIES[2]} strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      </CardBody>
    </Card>
  )
}

function FuelTrendCard({ params }) {
  const trend = useFuelTrend(params)
  const series = trend.data?.series ?? []
  const litres = series.reduce((s, d) => s + d.litres, 0)
  const cost = series.reduce((s, d) => s + d.cost, 0)
  return (
    <Card>
      <CardHeader
        title="Fuel consumption"
        description={trend.data ? `${formatNumber(litres)} L · ${formatCurrency(cost)} · per ${trend.data.granularity}` : null}
        actions={
          <Button size="xs" variant="ghost" to="/fuel" iconRight={ArrowForwardIcon}>
            Fuel
          </Button>
        }
      />
      <CardBody>
        <ChartFrame loading={trend.isLoading} empty={!trend.isLoading && litres === 0}>
          <BarChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barCategoryGap={series.length > 20 ? 2 : 6}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="date" {...axisProps} tickFormatter={formatShortDate} minTickGap={28} />
            <YAxis {...axisProps} tickFormatter={formatCompactNumber} width={44} />
            <Tooltip
              cursor={{ fill: CHART_CURSOR }}
              content={
                <ChartTooltip
                  labelFormatter={(l) => (trend.data?.granularity === 'week' ? `Week of ${formatDate(l)}` : formatDate(l))}
                  names={{ litres: 'Litres', cost: 'Cost' }}
                  format={{ litres: (v) => `${formatNumber(v, 1)} L`, cost: formatCurrency }}
                />
              }
            />
            <Bar dataKey="litres" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ChartFrame>
      </CardBody>
    </Card>
  )
}

function MaintenanceCard({ params }) {
  const m = useMaintenanceOverview(params)
  const trend = m.data?.trend ?? []
  return (
    <Card>
      <CardHeader
        title="Maintenance"
        description="Jobs reported and completed per month, last six months"
        actions={
          <Button size="xs" variant="ghost" to="/maintenance" iconRight={ArrowForwardIcon}>
            Workshop
          </Button>
        }
      />
      <CardBody>
        <ChartLegend
          sx={{ mb: 1.5 }}
          items={[
            { label: 'Reported', color: SERIES[0] },
            { label: 'Completed', color: SERIES[1] },
          ]}
        />
        <ChartFrame height={170} loading={m.isLoading} empty={!m.isLoading && trend.length === 0}>
          <BarChart data={trend} margin={{ top: 4, right: 8, left: -18, bottom: 0 }} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="month" {...axisProps} tickFormatter={(v) => formatShortDate(`${v}-01`).replace(/^\d+\s/, '')} />
            <YAxis {...axisProps} allowDecimals={false} width={40} />
            <Tooltip
              cursor={{ fill: CHART_CURSOR }}
              content={
                <ChartTooltip names={{ reported: 'Reported', completed: 'Completed', cost: 'Cost' }} format={{ cost: formatCurrency }} />
              }
            />
            <Bar dataKey="reported" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={20} />
            <Bar dataKey="completed" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ChartFrame>
        {m.data?.upcomingService?.length ? (
          <Box sx={{ mt: 2, borderTop: 1, borderColor: 'divider', pt: 1.5 }}>
            <SectionLabel>Service due</SectionLabel>
            <Stack component="ul" spacing={0.75} sx={{ listStyle: 'none', m: 0, p: 0 }}>
              {m.data.upcomingService.slice(0, 4).map((s) => (
                <Box
                  component="li"
                  key={s.id}
                  sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, fontSize: 13 }}
                >
                  <Box
                    component={RouterLink}
                    to={`/vehicles/${s.vehicleId}?tab=maintenance`}
                    sx={{
                      display: 'flex',
                      minWidth: 0,
                      alignItems: 'center',
                      gap: 1,
                      textDecoration: 'none',
                      color: 'inherit',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {s.vehiclePlate}
                    </Box>
                    <Box component="span" sx={{ ...truncate, color: 'text.muted' }}>
                      {s.task}
                    </Box>
                  </Box>
                  <Box
                    component="span"
                    className="tabular"
                    sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1, color: 'text.muted' }}
                  >
                    {s.kmRemaining != null
                      ? `${s.kmRemaining < 0 ? '−' : ''}${formatNumber(Math.abs(s.kmRemaining))} km`
                      : `${s.daysRemaining} d`}
                    <ToneBadge value={s.state} size="sm" />
                  </Box>
                </Box>
              ))}
            </Stack>
          </Box>
        ) : null}
      </CardBody>
    </Card>
  )
}

function CostByVehicleCard({ params }) {
  const cost = useCostByVehicle({ ...params, limit: 8 })
  const rows = cost.data ?? []
  return (
    <Card>
      <CardHeader
        title="Highest operating cost"
        description="Fuel and completed maintenance in the period"
        actions={
          <Button size="xs" variant="ghost" to="/reports/vehicle-cost" iconRight={ArrowForwardIcon}>
            Full report
          </Button>
        }
      />
      <CardBody>
        <ChartLegend
          sx={{ mb: 1.5 }}
          items={[
            { label: 'Fuel', color: SERIES[0] },
            { label: 'Maintenance', color: SERIES[1] },
          ]}
        />
        <ChartFrame height={Math.max(160, rows.length * 30)} loading={cost.isLoading} empty={!cost.isLoading && rows.length === 0}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 16, left: 8, bottom: 0 }} barCategoryGap={6}>
            <CartesianGrid {...gridProps} horizontal={false} vertical />
            <XAxis type="number" {...axisProps} tickFormatter={(v) => formatCurrency(v, { compact: true }).replace('RWF ', '')} />
            <YAxis type="category" dataKey="plateNumber" {...axisProps} width={76} tick={{ fontSize: 11.5, fontWeight: 500 }} />
            <Tooltip
              cursor={{ fill: CHART_CURSOR }}
              content={
                <ChartTooltip
                  names={{ fuelCost: 'Fuel', maintenanceCost: 'Maintenance' }}
                  format={{ fuelCost: formatCurrency, maintenanceCost: formatCurrency }}
                />
              }
            />
            <Bar dataKey="fuelCost" stackId="c" fill={SERIES[0]} maxBarSize={18} />
            <Bar dataKey="maintenanceCost" stackId="c" fill={SERIES[1]} radius={[0, 4, 4, 0]} maxBarSize={18} />
          </BarChart>
        </ChartFrame>
      </CardBody>
    </Card>
  )
}

function UtilizationCard({ params }) {
  const u = useUtilization(params)
  const rows = u.data?.rows ?? []
  const heavy = rows.filter((r) => r.band === 'HEAVY').slice(0, 5)
  const low = rows
    .filter((r) => r.band === 'LOW' || r.band === 'IDLE')
    .slice(-5)
    .reverse()
  return (
    <Card>
      <CardHeader
        title="Fleet utilization"
        description="Share of days each vehicle moved during the period"
        actions={
          <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
            {(u.data?.bands ?? []).map((b) => (
              <Badge key={b.band} tone={{ HEAVY: 'accent', NORMAL: 'success', LOW: 'warning', IDLE: 'danger' }[b.band]} size="sm">
                {b.band.toLowerCase()} {b.count}
              </Badge>
            ))}
          </Stack>
        }
      />
      <CardBody>
        <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { lg: 'repeat(3, minmax(0, 1fr))' } }}>
          <Box sx={{ gridColumn: { lg: 'span 1' } }}>
            <SectionLabel>By category</SectionLabel>
            <ChartFrame
              height={Math.max(150, (u.data?.byCategory?.length ?? 0) * 26)}
              loading={u.isLoading}
              empty={!u.isLoading && !u.data?.byCategory?.length}
            >
              <BarChart
                data={u.data?.byCategory ?? []}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                barCategoryGap={5}
              >
                <XAxis type="number" {...axisProps} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <YAxis type="category" dataKey="category" {...axisProps} width={96} />
                <Tooltip
                  cursor={{ fill: CHART_CURSOR }}
                  content={<ChartTooltip names={{ utilization: 'Utilization' }} format={{ utilization: (v) => formatPercent(v, 1) }} />}
                />
                <Bar dataKey="utilization" fill={SERIES[0]} radius={[0, 4, 4, 0]} maxBarSize={16} />
              </BarChart>
            </ChartFrame>
          </Box>
          <UtilList title="Most used" rows={heavy} loading={u.isLoading} />
          <UtilList title="Underutilized" rows={low} loading={u.isLoading} />
        </Box>
      </CardBody>
    </Card>
  )
}

function UtilList({ title, rows, loading }) {
  return (
    <Box>
      <SectionLabel>{title}</SectionLabel>
      {loading ? (
        <Stack spacing={1}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={28} />
          ))}
        </Stack>
      ) : rows.length === 0 ? (
        <EmptyText sx={{ py: 3 }}>None in this period.</EmptyText>
      ) : (
        <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
          {rows.map((r) => (
            <Box
              component="li"
              key={r.vehicleId}
              sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1.5, py: 0.75, fontSize: 13 }}
            >
              <Box
                component={RouterLink}
                to={`/vehicles/${r.vehicleId}`}
                sx={{
                  display: 'flex',
                  minWidth: 0,
                  alignItems: 'center',
                  gap: 1,
                  textDecoration: 'none',
                  color: 'inherit',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                  {r.plateNumber}
                </Box>
                <Box component="span" sx={{ ...truncate, color: 'text.muted' }}>
                  {r.categoryName}
                </Box>
              </Box>
              <Box
                component="span"
                className="tabular"
                sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1.5, color: 'text.muted' }}
              >
                <span>{formatKm(r.distanceKm)}</span>
                <Box component="span" sx={{ width: 48, textAlign: 'right', fontWeight: 500, color: 'text.primary' }}>
                  {formatPercent(r.utilizationPercent)}
                </Box>
                <StatusBadge kind="vehicle" value={r.status} size="sm" dot={false} sx={{ display: { xs: 'none', sm: 'inline-flex' } }} />
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  )
}
