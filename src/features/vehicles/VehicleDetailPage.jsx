import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditIcon from '@mui/icons-material/Edit'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ArchiveIcon from '@mui/icons-material/Archive'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import BuildIcon from '@mui/icons-material/Build'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import DescriptionIcon from '@mui/icons-material/Description'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import RouteIcon from '@mui/icons-material/Route'
import AssignmentIcon from '@mui/icons-material/Assignment'
import HistoryIcon from '@mui/icons-material/History'
import PaymentsIcon from '@mui/icons-material/Payments'
import DashboardIcon from '@mui/icons-material/Dashboard'
import AddIcon from '@mui/icons-material/Add'
import SpeedIcon from '@mui/icons-material/Speed'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import RefreshIcon from '@mui/icons-material/Refresh'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { useSearchState } from '@/hooks/useSearchState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Tabs, useActiveTab } from '@/components/ui/Tabs'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList, Timeline, ProgressBar } from '@/components/ui/Display'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { Badge, StatusBadge, ToneBadge } from '@/components/ui/Badge'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { ErrorState, NotFoundInline, Skeleton, EmptyState, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { Field, Select, Textarea } from '@/components/ui/Field'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { ChartFrame, ChartLegend, ChartTooltip, CHART_CURSOR, SERIES, axisProps, gridProps } from '@/components/ui/charts'
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDuration,
  formatKm,
  formatLitres,
  formatMonth,
  formatNumber,
  formatRelative,
  formatSmartDateTime,
  humanize,
} from '@/utils/format'
import { GpsDot } from './GpsDot'
import { AssignDriverDialog, EndAssignmentDialog } from '@/features/assignments/AssignDriverDialog'
import { DocumentFormDialog } from '@/features/documents/DocumentFormDialog'
import { alertLink } from '@/features/dashboard/DashboardPage'

const TABS = [
  { key: 'overview', label: 'Overview', icon: DashboardIcon },
  { key: 'trips', label: 'Trips', icon: RouteIcon },
  { key: 'fuel', label: 'Fuel', icon: LocalGasStationIcon },
  { key: 'maintenance', label: 'Maintenance', icon: BuildIcon },
  { key: 'drivers', label: 'Drivers', icon: AssignmentIcon },
  { key: 'documents', label: 'Documents', icon: DescriptionIcon },
  { key: 'incidents', label: 'Incidents', icon: WarningAmberIcon },
  { key: 'costs', label: 'Costs', icon: PaymentsIcon },
  { key: 'activity', label: 'Activity', icon: HistoryIcon },
]

export default function VehicleDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const tab = useActiveTab('tab', TABS)
  const vehicle = useQuery({ queryKey: ['vehicles', 'detail', id], queryFn: () => http.get(`/vehicles/${id}`) })
  const [assignOpen, setAssignOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)

  const archive = useApiMutation({
    mutationFn: () => http.delete(`/vehicles/${id}`),
    invalidate: [['vehicles'], ['dashboard']],
    success: 'Vehicle archived',
    onSuccess: () => navigate('/vehicles'),
  })

  if (vehicle.isLoading) return <DetailSkeleton />
  if (vehicle.isError)
    return vehicle.error.isNotFound ? (
      <NotFoundInline what="vehicle" backTo="/vehicles" backLabel="Back to vehicles" />
    ) : (
      <ErrorState error={vehicle.error} onRetry={vehicle.refetch} />
    )
  const v = vehicle.data
  const activeAssignment = v.currentDriverId ? { id: null } : null

  const menu = [
    can('ASSIGNMENT_MANAGE') && !v.currentDriverId && { label: 'Assign driver', icon: PersonAddIcon, onSelect: () => setAssignOpen(true) },
    can('ASSIGNMENT_MANAGE') &&
      v.currentDriverId && { label: 'End driver assignment', icon: PersonRemoveIcon, onSelect: () => setEndOpen(true) },
    can('VEHICLE_UPDATE') && { label: 'Change status', icon: SwapHorizIcon, onSelect: () => setStatusOpen(true) },
    can('TRIP_MANAGE') && { label: 'Plan a trip', icon: RouteIcon, onSelect: () => navigate(`/trips/new?vehicleId=${v.id}`) },
    can('FUEL_MANAGE') && { label: 'Record fuel', icon: LocalGasStationIcon, onSelect: () => navigate(`/fuel/new?vehicleId=${v.id}`) },
    can('MAINTENANCE_MANAGE') && {
      label: 'Report maintenance',
      icon: BuildIcon,
      onSelect: () => navigate(`/maintenance/new?vehicleId=${v.id}`),
    },
    can('INCIDENT_MANAGE') && {
      label: 'Report incident',
      icon: WarningAmberIcon,
      onSelect: () => navigate(`/incidents/new?vehicleId=${v.id}`),
    },
    can('VEHICLE_DELETE') && { separator: true },
    can('VEHICLE_DELETE') && { label: 'Archive vehicle', icon: ArchiveIcon, tone: 'danger', onSelect: () => setArchiveOpen(true) },
  ].filter(Boolean)

  return (
    <div>
      <PageHeader
        title={v.plateNumber}
        documentTitle={`${v.plateNumber} · ${v.make} ${v.model}`}
        breadcrumbs={[{ label: 'Vehicles', to: '/vehicles' }, { label: v.plateNumber }]}
        meta={
          <>
            <StatusBadge kind="vehicle" value={v.status} />
            <ToneBadge value={v.maintenanceStatus} />
          </>
        }
        description={`${v.make} ${v.model} ${v.year} · ${v.categoryName} · ${v.fleetNumber}${v.department ? ` · ${v.department}` : ''}`}
        actions={
          <>
            {can('VEHICLE_UPDATE') ? (
              <Button icon={EditIcon} to={`/vehicles/${v.id}/edit`}>
                Edit
              </Button>
            ) : null}
            {menu.length ? (
              <Dropdown trigger={<IconButton label="More actions" icon={MoreHorizIcon} variant="secondary" />} items={menu} />
            ) : null}
          </>
        }
      />

      <VehicleAlerts vehicleId={v.id} />

      <Tabs tabs={TABS} param="tab" sx={{ mb: 2.5 }} />

      {tab === 'overview' ? <OverviewTab vehicle={v} onAssign={() => setAssignOpen(true)} onEnd={() => setEndOpen(true)} /> : null}
      {tab === 'trips' ? <TripsTab vehicleId={v.id} /> : null}
      {tab === 'fuel' ? <FuelTab vehicleId={v.id} /> : null}
      {tab === 'maintenance' ? <MaintenanceTab vehicle={v} /> : null}
      {tab === 'drivers' ? <DriversTab vehicle={v} onAssign={() => setAssignOpen(true)} onEnd={() => setEndOpen(true)} /> : null}
      {tab === 'documents' ? <DocumentsTab vehicle={v} /> : null}
      {tab === 'incidents' ? <IncidentsTab vehicleId={v.id} /> : null}
      {tab === 'costs' ? <CostsTab vehicleId={v.id} /> : null}
      {tab === 'activity' ? <ActivityTab vehicleId={v.id} /> : null}

      <AssignDriverDialog open={assignOpen} onClose={() => setAssignOpen(false)} vehicleId={v.id} onAssigned={() => vehicle.refetch()} />
      <EndActiveAssignment
        vehicleId={v.id}
        open={endOpen}
        onClose={() => setEndOpen(false)}
        onEnded={() => vehicle.refetch()}
        active={activeAssignment}
      />
      <ChangeStatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} vehicle={v} onChanged={() => vehicle.refetch()} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title={`Archive ${v.plateNumber}?`}
        description="The vehicle will be hidden from operations. Its trips, fuel, maintenance and incident history are kept for reporting and audit."
        confirmLabel="Archive vehicle"
      />
    </div>
  )
}

function EndActiveAssignment({ vehicleId, open, onClose, onEnded }) {
  const q = useQuery({
    queryKey: ['assignments', 'active', vehicleId],
    queryFn: () => http.get('/assignments', { params: { vehicleId, status: 'ACTIVE', size: 1 } }),
    enabled: open,
  })
  const a = q.data?.content?.[0]
  if (!open || !a) return null
  return <EndAssignmentDialog open={open} onClose={onClose} assignment={a} onEnded={onEnded} />
}

function ChangeStatusDialog({ open, onClose, vehicle, onChanged }) {
  const statuses = useOptions('vehicle')
  const [status, setStatus] = useState(vehicle.status)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/vehicles/${vehicle.id}/status`, body),
    invalidate: [['vehicles'], ['dashboard'], ['dispatch']],
    success: 'Status updated',
    onSuccess: () => {
      onChanged?.()
      onClose()
    },
  })
  const submit = async () => {
    setError(null)
    try {
      await change.mutateAsync({ status, reason })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change operational status"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={change.isPending} disabled={status === vehicle.status}>
            Update
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <InlineAlert tone="info">
          Status normally follows assignments, trips and workshop jobs. Manual changes are recorded in the audit log with your reason.
        </InlineAlert>
        <Field label="New status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} autoFocus>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reason">
          <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being changed manually?" />
        </Field>
      </Stack>
    </Dialog>
  )
}

function VehicleAlerts({ vehicleId }) {
  const q = useQuery({ queryKey: ['vehicles', 'alerts', vehicleId], queryFn: () => http.get(`/vehicles/${vehicleId}/alerts`) })
  const items = (q.data ?? []).filter((a) => !a.acknowledgedAt && a.severity !== 'INFO')
  if (!items.length) return null
  return (
    <Stack spacing={1} sx={{ mb: 2.5 }}>
      {items.slice(0, 3).map((a) => (
        <InlineAlert
          key={a.id}
          tone={a.severity === 'CRITICAL' ? 'danger' : 'warning'}
          title={a.title}
          action={
            <LinkText to={alertLink(a)} sx={{ fontSize: 12.5, fontWeight: 600, textUnderlineOffset: 2 }}>
              View
            </LinkText>
          }
        >
          {a.message}
        </InlineAlert>
      ))}
      {items.length > 3 ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
          +{items.length - 3} more in the <LinkText to="/alerts">alert centre</LinkText>.
        </Typography>
      ) : null}
    </Stack>
  )
}

function OverviewTab({ vehicle: v, onAssign, onEnd }) {
  const { can } = useAuth()
  const t = v.telematics
  const schedules = useQuery({ queryKey: ['vehicles', 'schedules', v.id], queryFn: () => http.get(`/vehicles/${v.id}/schedules`) })
  const movements = useQuery({
    queryKey: ['vehicles', 'movements', v.id, 14],
    queryFn: () => http.get(`/vehicles/${v.id}/movements`, { params: { limit: 14 } }),
  })
  const recent = (movements.data ?? []).slice().reverse()
  return (
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
      <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
        <Card>
          <CardHeader title="Vehicle profile" />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                { label: 'Make & model', value: `${v.make} ${v.model}` },
                { label: 'Year', value: v.year },
                { label: 'Category', value: v.categoryName },
                { label: 'Body type', value: v.bodyType },
                { label: 'Fuel', value: humanize(v.fuelType) },
                { label: 'Transmission', value: humanize(v.transmission) },
                { label: 'Colour', value: v.color },
                { label: 'Seats', value: v.seatingCapacity },
                { label: 'Odometer', value: formatKm(v.odometerKm) },
                { label: 'Engine number', value: v.engineNumber, mono: true },
                { label: 'Chassis / VIN', value: v.vin, mono: true },
                { label: 'Department', value: v.department },
                { label: 'Purchased', value: v.purchaseDate ? formatDate(v.purchaseDate) : null },
                { label: 'Acquisition cost', value: v.acquisitionCost ? formatCurrency(v.acquisitionCost) : null },
                {
                  label: 'Insurer',
                  value: v.insurer ? `${v.insurer}${v.insurancePolicyNumber ? ` · ${v.insurancePolicyNumber}` : ''}` : null,
                },
                { label: 'Insurance expiry', value: v.insuranceExpiry ? formatDate(v.insuranceExpiry) : null },
                { label: 'Added', value: formatDate(v.createdAt) },
                { label: 'Last updated', value: formatRelative(v.updatedAt) },
                v.notes && { label: 'Notes', value: v.notes, span: 'full' },
              ]}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Last 14 days" description="Distance driven per day from completed trips" />
          <CardBody>
            <ChartFrame height={160} loading={movements.isLoading} empty={!movements.isLoading && recent.length === 0}>
              <BarChart data={recent} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis
                  dataKey="date"
                  {...axisProps}
                  tickFormatter={(d) => formatDate(d).split(' ').slice(0, 2).join(' ')}
                  minTickGap={20}
                />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  cursor={{ fill: CHART_CURSOR }}
                  content={
                    <ChartTooltip
                      labelFormatter={formatDate}
                      names={{ distanceKm: 'Distance', tripCount: 'Trips' }}
                      format={{ distanceKm: (x) => formatKm(Math.round(x)) }}
                    />
                  }
                />
                <Bar dataKey="distanceKm" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ChartFrame>
          </CardBody>
        </Card>
      </Stack>

      <Stack spacing={2}>
        <Card>
          <CardHeader
            title="Current driver"
            compact
            actions={
              can('ASSIGNMENT_MANAGE') ? (
                v.currentDriverId ? (
                  <Button size="xs" variant="ghost" onClick={onEnd}>
                    End
                  </Button>
                ) : (
                  <Button size="xs" variant="ghost" icon={PersonAddIcon} onClick={onAssign}>
                    Assign
                  </Button>
                )
              ) : null
            }
          />
          <CardBody sx={{ p: 2 }}>
            {v.currentDriverId ? (
              <LinkText to={`/drivers/${v.currentDriverId}`} sx={{ fontSize: 14 }}>
                {v.currentDriverName}
              </LinkText>
            ) : (
              <Typography sx={{ fontSize: 13, color: 'text.muted' }}>No driver assigned.</Typography>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Telematics" compact actions={<GpsDot telematics={t} />} />
          <CardBody sx={{ p: 2 }}>
            <DescriptionList
              columns={2}
              items={[
                { label: 'Device', value: t.deviceId, mono: true },
                { label: 'Last report', value: t.lastCommunicationAt ? formatSmartDateTime(t.lastCommunicationAt) : null },
                { label: 'Ignition', value: t.ignitionOn == null ? null : t.ignitionOn ? 'On' : 'Off' },
                { label: 'Speed', value: t.speedKph != null ? `${t.speedKph} km/h` : null },
                { label: 'Battery', value: t.batteryPercent != null ? `${t.batteryPercent}%` : null },
                {
                  label: 'Fuel sensor',
                  value:
                    t.fuelSensorOk == null ? null : t.fuelSensorOk ? (
                      'OK'
                    ) : (
                      <Badge tone="warning" size="sm">
                        Fault
                      </Badge>
                    ),
                },
                {
                  label: 'Position',
                  value: t.latitude != null ? `${t.latitude.toFixed(4)}, ${t.longitude.toFixed(4)}` : null,
                  span: 2,
                  mono: true,
                },
              ]}
            />
            <Typography sx={{ mt: 1.5, fontSize: 11.5, color: 'text.faint' }}>
              Fed by the telematics provider adapter (Wialon-ready). No live map until a provider is connected.
            </Typography>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Service schedule"
            compact
            actions={
              <Button size="xs" variant="ghost" to={`/vehicles/${v.id}?tab=maintenance`}>
                Details
              </Button>
            }
          />
          <CardBody sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {schedules.isLoading ? (
              <Skeleton height={64} />
            ) : (schedules.data ?? []).length === 0 ? (
              <Typography sx={{ fontSize: 13, color: 'text.muted' }}>No preventive schedules yet.</Typography>
            ) : (
              schedules.data.slice(0, 4).map((s) => (
                <Box key={s.id}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                      {s.task}
                    </Box>
                    <ToneBadge value={s.state} size="sm" />
                  </Box>
                  <ProgressBar
                    sx={{ mt: 0.75 }}
                    value={s.intervalKm ? Math.max(0, s.intervalKm - (s.kmRemaining ?? 0)) : 100}
                    max={s.intervalKm ?? 100}
                    tone={s.state === 'OVERDUE' ? 'danger' : s.state === 'DUE_SOON' ? 'warning' : 'accent'}
                    label={s.task}
                  />
                  <Typography sx={{ mt: 0.5, fontSize: 11.5, color: 'text.muted' }}>
                    {s.kmRemaining != null
                      ? s.kmRemaining < 0
                        ? `${formatNumber(-s.kmRemaining)} km overdue`
                        : `${formatNumber(s.kmRemaining)} km to go`
                      : ''}
                    {s.daysRemaining != null
                      ? ` · ${s.daysRemaining < 0 ? `${-s.daysRemaining} days overdue` : `${s.daysRemaining} days`}`
                      : ''}
                  </Typography>
                </Box>
              ))
            )}
          </CardBody>
        </Card>
      </Stack>
    </Box>
  )
}

function SubTable({ queryKey, url, columns, onRowClick, empty, rowKey, defaultSize = 10 }) {
  const [page, setPage] = useState(0)
  const q = usePagedQuery(queryKey, url, { page, size: defaultSize })
  return (
    <Card>
      <DataTable
        columns={columns}
        rows={q.data?.content ?? []}
        rowKey={rowKey}
        isLoading={q.isLoading}
        error={q.isError ? q.error : null}
        onRetry={q.refetch}
        onRowClick={onRowClick}
        empty={empty}
        stickyHeader={false}
      />
      {q.data && q.data.totalElements > defaultSize ? (
        <Pagination
          page={q.data.page}
          size={q.data.size}
          totalElements={q.data.totalElements}
          totalPages={q.data.totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </Card>
  )
}

function TripsTab({ vehicleId }) {
  const navigate = useNavigate()
  const { can } = useAuth()
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('TRIP_MANAGE') ? (
          <Button size="sm" icon={AddIcon} to={`/trips/new?vehicleId=${vehicleId}`}>
            Plan trip
          </Button>
        ) : null}
      </Box>
      <SubTable
        queryKey={['vehicles', 'trips', vehicleId]}
        url={`/vehicles/${vehicleId}/trips`}
        onRowClick={(t) => navigate(`/trips/${t.id}`)}
        columns={[
          {
            key: 'tripNumber',
            header: 'Trip',
            render: (t) => (
              <Box component="span" sx={{ fontWeight: 500 }}>
                {t.tripNumber}
              </Box>
            ),
          },
          { key: 'scheduledStartAt', header: 'Scheduled', render: (t) => formatDateTime(t.scheduledStartAt) },
          { key: 'route', header: 'Route', render: (t) => `${t.startLocation} → ${t.destination}`, hideBelow: 'md' },
          { key: 'driverName', header: 'Driver', hideBelow: 'lg' },
          { key: 'distanceKm', header: 'Distance', align: 'right', render: (t) => formatKm(t.distanceKm) },
          { key: 'durationMinutes', header: 'Duration', align: 'right', render: (t) => formatDuration(t.durationMinutes), hideBelow: 'lg' },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge kind="trip" value={t.status} size="sm" /> },
        ]}
        empty={<EmptyState icon={RouteIcon} title="No trips yet" compact />}
      />
    </Stack>
  )
}

function FuelTab({ vehicleId }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('FUEL_MANAGE') ? (
          <Button size="sm" icon={AddIcon} to={`/fuel/new?vehicleId=${vehicleId}`}>
            Record fuel
          </Button>
        ) : null}
      </Box>
      <SubTable
        queryKey={['vehicles', 'fuel', vehicleId]}
        url={`/vehicles/${vehicleId}/fuel`}
        onRowClick={can('FUEL_MANAGE') ? (f) => navigate(`/fuel/${f.id}/edit`) : undefined}
        columns={[
          { key: 'transactedAt', header: 'Date', render: (f) => formatDateTime(f.transactedAt) },
          { key: 'station', header: 'Station', hideBelow: 'md' },
          { key: 'litres', header: 'Litres', align: 'right', render: (f) => formatLitres(f.litres) },
          { key: 'totalAmount', header: 'Amount', align: 'right', render: (f) => formatCurrency(f.totalAmount) },
          { key: 'odometerKm', header: 'Odometer', align: 'right', render: (f) => formatKm(f.odometerKm), hideBelow: 'sm' },
          {
            key: 'litresPer100Km',
            header: 'L/100 km',
            align: 'right',
            render: (f) => (f.litresPer100Km != null ? formatNumber(f.litresPer100Km, 1) : '—'),
            hideBelow: 'lg',
          },
          {
            key: 'anomaly',
            header: 'Check',
            render: (f) =>
              f.anomaly ? (
                <Badge tone="warning" size="sm">
                  Anomaly
                </Badge>
              ) : (
                <Box component="span" sx={{ color: 'text.faint' }}>
                  —
                </Box>
              ),
            hideBelow: 'md',
          },
        ]}
        empty={<EmptyState icon={LocalGasStationIcon} title="No fuel transactions" compact />}
      />
    </Stack>
  )
}

function MaintenanceTab({ vehicle }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  const schedules = useQuery({
    queryKey: ['vehicles', 'schedules', vehicle.id],
    queryFn: () => http.get(`/vehicles/${vehicle.id}/schedules`),
  })
  return (
    <Stack spacing={2}>
      <Card>
        <CardHeader
          title="Preventive schedule"
          description={`Current odometer ${formatKm(vehicle.odometerKm)}`}
          actions={
            can('MAINTENANCE_MANAGE') ? (
              <Button size="xs" variant="ghost" to={`/maintenance/schedules?vehicleId=${vehicle.id}`}>
                Manage
              </Button>
            ) : null
          }
        />
        <DataTable
          stickyHeader={false}
          isLoading={schedules.isLoading}
          error={schedules.isError ? schedules.error : null}
          onRetry={schedules.refetch}
          rows={schedules.data ?? []}
          columns={[
            {
              key: 'task',
              header: 'Task',
              render: (s) => (
                <Box component="span" sx={{ fontWeight: 500 }}>
                  {s.task}
                </Box>
              ),
            },
            {
              key: 'interval',
              header: 'Interval',
              render: (s) =>
                [s.intervalKm && `${formatNumber(s.intervalKm)} km`, s.intervalDays && `${s.intervalDays} days`]
                  .filter(Boolean)
                  .join(' / '),
              hideBelow: 'md',
            },
            {
              key: 'lastServiceKm',
              header: 'Last',
              render: (s) => `${formatKm(s.lastServiceKm)} · ${formatDate(s.lastServiceDate)}`,
              hideBelow: 'sm',
            },
            {
              key: 'next',
              header: 'Next',
              render: (s) =>
                [s.nextServiceKm && formatKm(s.nextServiceKm), s.nextServiceDate && formatDate(s.nextServiceDate)]
                  .filter(Boolean)
                  .join(' · '),
            },
            {
              key: 'remaining',
              header: 'Remaining',
              align: 'right',
              render: (s) => (s.kmRemaining != null ? `${formatNumber(s.kmRemaining)} km` : `${s.daysRemaining} d`),
            },
            { key: 'state', header: 'State', render: (s) => <ToneBadge value={s.state} size="sm" /> },
          ]}
          empty={
            <EmptyState
              icon={BuildIcon}
              title="No schedules"
              description="Add preventive tasks so due dates are calculated automatically."
              compact
            />
          }
        />
      </Card>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('MAINTENANCE_MANAGE') ? (
          <Button size="sm" icon={AddIcon} to={`/maintenance/new?vehicleId=${vehicle.id}`}>
            Report maintenance
          </Button>
        ) : null}
      </Box>
      <SubTable
        queryKey={['vehicles', 'maintenance', vehicle.id]}
        url={`/vehicles/${vehicle.id}/maintenance`}
        onRowClick={(m) => navigate(`/maintenance/${m.id}`)}
        columns={[
          {
            key: 'maintenanceNumber',
            header: 'Job',
            render: (m) => (
              <Box component="span" sx={{ fontWeight: 500 }}>
                {m.maintenanceNumber}
              </Box>
            ),
          },
          { key: 'reportedAt', header: 'Reported', render: (m) => formatDate(m.reportedAt) },
          {
            key: 'type',
            header: 'Type',
            render: (m) => <StatusBadge kind="maintenanceType" value={m.type} size="sm" dot={false} />,
            hideBelow: 'md',
          },
          {
            key: 'complaint',
            header: 'Complaint',
            sx: { maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
          },
          { key: 'workshop', header: 'Workshop', hideBelow: 'lg' },
          { key: 'totalCost', header: 'Cost', align: 'right', render: (m) => formatCurrency(m.totalCost) },
          { key: 'status', header: 'Status', render: (m) => <StatusBadge kind="maintenance" value={m.status} size="sm" /> },
        ]}
        empty={<EmptyState icon={BuildIcon} title="No maintenance history" compact />}
      />
    </Stack>
  )
}

function DriversTab({ vehicle, onAssign, onEnd }) {
  const { can } = useAuth()
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
        {can('ASSIGNMENT_MANAGE') ? (
          vehicle.currentDriverId ? (
            <Button size="sm" icon={PersonRemoveIcon} onClick={onEnd}>
              End current assignment
            </Button>
          ) : (
            <Button size="sm" icon={PersonAddIcon} onClick={onAssign}>
              Assign driver
            </Button>
          )
        ) : null}
      </Box>
      <SubTable
        queryKey={['vehicles', 'assignments', vehicle.id]}
        url={`/vehicles/${vehicle.id}/assignments`}
        columns={[
          {
            key: 'driverName',
            header: 'Driver',
            render: (a) => <LinkText to={`/drivers/${a.driverId}`}>{a.driverName}</LinkText>,
          },
          { key: 'startAt', header: 'From', render: (a) => formatDateTime(a.startAt) },
          {
            key: 'endAt',
            header: 'To',
            render: (a) =>
              a.endAt ? (
                formatDateTime(a.endAt)
              ) : (
                <Box component="span" sx={{ color: 'text.muted' }}>
                  ongoing
                </Box>
              ),
          },
          { key: 'purpose', header: 'Purpose', hideBelow: 'md' },
          {
            key: 'km',
            header: 'Km driven',
            align: 'right',
            render: (a) => (a.odometerAtEnd != null ? formatKm(a.odometerAtEnd - a.odometerAtStart) : '—'),
            hideBelow: 'sm',
          },
          { key: 'assignedByName', header: 'Assigned by', hideBelow: 'lg' },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="assignment" value={a.status} size="sm" /> },
        ]}
        empty={<EmptyState icon={AssignmentIcon} title="No assignment history" compact />}
      />
    </Stack>
  )
}

function DocumentsTab({ vehicle }) {
  const { can } = useAuth()
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const docs = useQuery({ queryKey: ['documents', 'vehicle', vehicle.id], queryFn: () => http.get(`/vehicles/${vehicle.id}/documents`) })
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('DOCUMENT_MANAGE') ? (
          <Button
            size="sm"
            icon={AddIcon}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            Add document
          </Button>
        ) : null}
      </Box>
      <Card>
        <DataTable
          stickyHeader={false}
          isLoading={docs.isLoading}
          error={docs.isError ? docs.error : null}
          onRetry={docs.refetch}
          rows={docs.data ?? []}
          onRowClick={
            can('DOCUMENT_MANAGE')
              ? (d) => {
                  setEditing(d)
                  setOpen(true)
                }
              : undefined
          }
          columns={[
            { key: 'type', header: 'Document', render: (d) => <StatusBadge kind="documentType" value={d.type} size="sm" dot={false} /> },
            { key: 'number', header: 'Number', sx: { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 13 } },
            { key: 'issueDate', header: 'Issued', render: (d) => formatDate(d.issueDate), hideBelow: 'md' },
            { key: 'expiryDate', header: 'Expires', render: (d) => formatDate(d.expiryDate) },
            {
              key: 'daysToExpiry',
              header: 'Days',
              align: 'right',
              render: (d) => (d.daysToExpiry < 0 ? `${-d.daysToExpiry} overdue` : d.daysToExpiry),
            },
            {
              key: 'attachment',
              header: 'File',
              render: (d) =>
                d.attachment ? (
                  <Box component="span" sx={{ color: 'text.secondary' }}>
                    {d.attachment.fileName}
                  </Box>
                ) : (
                  <Box component="span" sx={{ color: 'text.faint' }}>
                    none
                  </Box>
                ),
              hideBelow: 'lg',
            },
            { key: 'status', header: 'Status', render: (d) => <StatusBadge kind="document" value={d.status} size="sm" /> },
          ]}
          empty={
            <EmptyState
              icon={DescriptionIcon}
              title="No documents"
              description="Insurance, inspection, road licence and registration are expected for every active vehicle."
              compact
            />
          }
        />
      </Card>
      <DocumentFormDialog
        open={open}
        onClose={() => setOpen(false)}
        document={editing}
        ownerType="VEHICLE"
        ownerId={vehicle.id}
        onSaved={() => docs.refetch()}
      />
    </Stack>
  )
}

function IncidentsTab({ vehicleId }) {
  const { can } = useAuth()
  const navigate = useNavigate()
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('INCIDENT_MANAGE') ? (
          <Button size="sm" icon={AddIcon} to={`/incidents/new?vehicleId=${vehicleId}`}>
            Report incident
          </Button>
        ) : null}
      </Box>
      <SubTable
        queryKey={['vehicles', 'incidents', vehicleId]}
        url={`/vehicles/${vehicleId}/incidents`}
        onRowClick={(i) => navigate(`/incidents/${i.id}`)}
        columns={[
          {
            key: 'incidentNumber',
            header: 'Incident',
            render: (i) => (
              <Box component="span" sx={{ fontWeight: 500 }}>
                {i.incidentNumber}
              </Box>
            ),
          },
          { key: 'occurredAt', header: 'When', render: (i) => formatDateTime(i.occurredAt) },
          { key: 'type', header: 'Type', render: (i) => <StatusBadge kind="incidentType" value={i.type} size="sm" dot={false} /> },
          {
            key: 'severity',
            header: 'Severity',
            render: (i) => <StatusBadge kind="severity" value={i.severity} size="sm" />,
            hideBelow: 'md',
          },
          {
            key: 'description',
            header: 'Description',
            sx: { maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            hideBelow: 'lg',
          },
          { key: 'estimatedCost', header: 'Est. cost', align: 'right', render: (i) => formatCurrency(i.estimatedCost), hideBelow: 'sm' },
          { key: 'status', header: 'Status', render: (i) => <StatusBadge kind="incident" value={i.status} size="sm" /> },
        ]}
        empty={<EmptyState icon={WarningAmberIcon} title="No incidents recorded" compact />}
      />
    </Stack>
  )
}

function CostsTab({ vehicleId }) {
  const [state, update] = useSearchState({ tab: 'costs' })
  const params = useMemo(() => ({ from: state.from, to: state.to }), [state.from, state.to])
  const q = useQuery({
    queryKey: ['vehicles', 'costs', vehicleId, params],
    queryFn: () => http.get(`/vehicles/${vehicleId}/costs`, { params }),
  })
  const c = q.data
  return (
    <Stack spacing={2}>
      <StatGrid cols={5}>
        <Stat
          label="Fuel"
          value={c ? formatCurrency(c.fuelCost, { compact: true }) : null}
          loading={q.isLoading}
          hint={c ? `${formatNumber(c.fuelLitres)} L` : null}
        />
        <Stat label="Maintenance" value={c ? formatCurrency(c.maintenanceCost, { compact: true }) : null} loading={q.isLoading} />
        <Stat label="Incidents" value={c ? formatCurrency(c.incidentCost, { compact: true }) : null} loading={q.isLoading} />
        <Stat
          label="Total"
          value={c ? formatCurrency(c.total, { compact: true }) : null}
          loading={q.isLoading}
          hint={c ? `${formatKm(c.distanceKm)} driven` : null}
        />
        <Stat label="Cost per km" value={c?.costPerKm != null ? `RWF ${formatNumber(c.costPerKm)}` : '—'} loading={q.isLoading} />
      </StatGrid>
      <Card>
        <CardHeader
          title="Cost by month"
          description="All time, from fuel receipts, completed maintenance and incident estimates"
          actions={
            <Button size="xs" variant="ghost" onClick={() => update({ from: undefined, to: undefined })} icon={RefreshIcon}>
              All time
            </Button>
          }
        />
        <CardBody>
          <ChartLegend
            sx={{ mb: 1.5 }}
            items={[
              { label: 'Fuel', color: SERIES[0] },
              { label: 'Maintenance', color: SERIES[1] },
              { label: 'Incidents', color: SERIES[2] },
            ]}
          />
          <ChartFrame height={220} loading={q.isLoading} empty={!q.isLoading && !c?.byMonth?.length}>
            <BarChart data={c?.byMonth ?? []} margin={{ top: 4, right: 8, left: -4, bottom: 0 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonth} />
              <YAxis {...axisProps} tickFormatter={(v) => formatCurrency(v, { compact: true }).replace('RWF ', '')} width={56} />
              <Tooltip
                cursor={{ fill: CHART_CURSOR }}
                content={
                  <ChartTooltip
                    labelFormatter={formatMonth}
                    names={{ fuel: 'Fuel', maintenance: 'Maintenance', incidents: 'Incidents' }}
                    format={{ fuel: formatCurrency, maintenance: formatCurrency, incidents: formatCurrency }}
                  />
                }
              />
              <Bar dataKey="fuel" stackId="c" fill={SERIES[0]} maxBarSize={28} />
              <Bar dataKey="maintenance" stackId="c" fill={SERIES[1]} maxBarSize={28} />
              <Bar dataKey="incidents" stackId="c" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ChartFrame>
        </CardBody>
      </Card>
    </Stack>
  )
}

const KIND_ICON = {
  ASSIGNMENT: AssignmentIcon,
  TRIP: RouteIcon,
  FUEL: LocalGasStationIcon,
  MAINTENANCE: BuildIcon,
  INCIDENT: WarningAmberIcon,
  DOCUMENT: DescriptionIcon,
  STATUS: SpeedIcon,
  BOOKING: EventAvailableIcon,
}
const KIND_TONE = {
  ASSIGNMENT: 'info',
  TRIP: 'accent',
  FUEL: 'neutral',
  MAINTENANCE: 'warning',
  INCIDENT: 'danger',
  DOCUMENT: 'neutral',
  STATUS: 'neutral',
  BOOKING: 'info',
}

function ActivityTab({ vehicleId }) {
  const [page, setPage] = useState(0)
  const q = usePagedQuery(['vehicles', 'activity', vehicleId], `/vehicles/${vehicleId}/activity`, { page, size: 25 })
  const items = (q.data?.content ?? []).map((e) => ({
    id: e.id,
    at: e.at,
    title: e.link ? (
      <Box component={RouterLink} to={e.link} sx={{ color: 'inherit', textDecoration: 'none', '&:hover': { textDecoration: 'underline' } }}>
        {e.title}
      </Box>
    ) : (
      e.title
    ),
    description: e.description,
    icon: KIND_ICON[e.kind],
    tone: KIND_TONE[e.kind],
  }))
  return (
    <Card>
      <CardHeader title="Activity timeline" description="Assignments, trips, refuelling, workshop jobs and incidents in one place" />
      <CardBody>
        {q.isLoading ? (
          <Stack spacing={2}>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} height={40} />
            ))}
          </Stack>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} compact />
        ) : (
          <Timeline items={items} renderTime={formatSmartDateTime} />
        )}
      </CardBody>
      {q.data && q.data.totalPages > 1 ? (
        <Pagination
          page={q.data.page}
          size={q.data.size}
          totalElements={q.data.totalElements}
          totalPages={q.data.totalPages}
          onPageChange={setPage}
        />
      ) : null}
    </Card>
  )
}

function DetailSkeleton() {
  return (
    <Stack spacing={2.5}>
      <Stack spacing={1}>
        <Skeleton height={12} width={128} />
        <Skeleton height={28} width={192} />
        <Skeleton height={16} width={288} />
      </Stack>
      <Skeleton height={40} width="100%" />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Skeleton height={288} sx={{ gridColumn: { xl: 'span 2' } }} />
        <Skeleton height={288} />
      </Box>
    </Stack>
  )
}
