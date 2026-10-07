import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import MuiLink from '@mui/material/Link'
import EditIcon from '@mui/icons-material/Edit'
import MoreHorizIcon from '@mui/icons-material/MoreHoriz'
import ArchiveIcon from '@mui/icons-material/Archive'
import PersonAddIcon from '@mui/icons-material/PersonAdd'
import PersonRemoveIcon from '@mui/icons-material/PersonRemove'
import RouteIcon from '@mui/icons-material/Route'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import AssignmentIcon from '@mui/icons-material/Assignment'
import DescriptionIcon from '@mui/icons-material/Description'
import DashboardIcon from '@mui/icons-material/Dashboard'
import PhoneIcon from '@mui/icons-material/Phone'
import MailIcon from '@mui/icons-material/Mail'
import StarIcon from '@mui/icons-material/Star'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Dropdown } from '@/components/ui/Dropdown'
import { Tabs, useActiveTab } from '@/components/ui/Tabs'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList } from '@/components/ui/Display'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { ErrorState, NotFoundInline, Skeleton, EmptyState, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { Field, Select } from '@/components/ui/Field'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { CHART_CURSOR, ChartFrame, ChartTooltip, SERIES, axisProps, gridProps } from '@/components/ui/charts'
import { formatCurrency, formatDate, formatDateTime, formatKm, formatNumber, formatPercent, humanize } from '@/utils/format'
import { AssignDriverDialog, EndAssignmentDialog } from '@/features/assignments/AssignDriverDialog'
import { DocumentFormDialog } from '@/features/documents/DocumentFormDialog'
import { LicenceBadge } from './DriversPage'

const TABS = [
  { key: 'overview', label: 'Overview', icon: DashboardIcon },
  { key: 'assignments', label: 'Assignments', icon: AssignmentIcon },
  { key: 'trips', label: 'Trips', icon: RouteIcon },
  { key: 'incidents', label: 'Incidents', icon: WarningAmberIcon },
  { key: 'documents', label: 'Documents', icon: DescriptionIcon },
]

export default function DriverDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const tab = useActiveTab('tab', TABS)
  const driver = useQuery({ queryKey: ['drivers', 'detail', id], queryFn: () => http.get(`/drivers/${id}`) })
  const [assignOpen, setAssignOpen] = useState(false)
  const [endOpen, setEndOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const [statusOpen, setStatusOpen] = useState(false)
  const archive = useApiMutation({
    mutationFn: () => http.delete(`/drivers/${id}`),
    invalidate: [['drivers'], ['dashboard']],
    success: 'Driver archived',
    onSuccess: () => navigate('/drivers'),
  })

  if (driver.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={40} />
        <Skeleton height={288} />
      </Stack>
    )
  if (driver.isError)
    return driver.error.isNotFound ? (
      <NotFoundInline what="driver" backTo="/drivers" backLabel="Back to drivers" />
    ) : (
      <ErrorState error={driver.error} onRetry={driver.refetch} />
    )
  const d = driver.data

  const menu = [
    can('ASSIGNMENT_MANAGE') &&
      !d.currentVehicleId && { label: 'Assign to vehicle', icon: PersonAddIcon, onSelect: () => setAssignOpen(true) },
    can('ASSIGNMENT_MANAGE') &&
      d.currentVehicleId && { label: 'End vehicle assignment', icon: PersonRemoveIcon, onSelect: () => setEndOpen(true) },
    can('DRIVER_MANAGE') && { label: 'Change status', icon: SwapHorizIcon, onSelect: () => setStatusOpen(true) },
    can('TRIP_MANAGE') && { label: 'Plan a trip', icon: RouteIcon, onSelect: () => navigate(`/trips/new?driverId=${d.id}`) },
    can('DRIVER_MANAGE') && { separator: true },
    can('DRIVER_MANAGE') && { label: 'Archive driver', icon: ArchiveIcon, tone: 'danger', onSelect: () => setArchiveOpen(true) },
  ].filter(Boolean)

  return (
    <Box>
      <PageHeader
        title={
          <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Avatar name={d.fullName} size="lg" />
            {d.fullName}
          </Box>
        }
        documentTitle={d.fullName}
        breadcrumbs={[{ label: 'Drivers', to: '/drivers' }, { label: d.fullName }]}
        meta={<StatusBadge kind="driver" value={d.status} />}
        description={`${d.employeeNumber} · ${humanize(d.employmentStatus)} · joined ${formatDate(d.joiningDate)}`}
        actions={
          <>
            {can('DRIVER_MANAGE') ? (
              <Button icon={EditIcon} to={`/drivers/${d.id}/edit`}>
                Edit
              </Button>
            ) : null}
            {menu.length ? (
              <Dropdown trigger={<IconButton label="More actions" icon={MoreHorizIcon} variant="secondary" />} items={menu} />
            ) : null}
          </>
        }
      />
      {new Date(d.licenseExpiry) < new Date() ? (
        <InlineAlert tone="danger" title="Driving licence expired" sx={{ mb: 2.5 }}>
          This driver cannot be assigned or dispatched until the licence is renewed and the document updated.
        </InlineAlert>
      ) : null}
      <Tabs tabs={TABS} param="tab" sx={{ mb: 2.5 }} />
      {tab === 'overview' ? <Overview driver={d} /> : null}
      {tab === 'assignments' ? (
        <Sub
          queryKey={['drivers', 'assignments', d.id]}
          url={`/drivers/${d.id}/assignments`}
          columns={[
            {
              key: 'vehiclePlate',
              header: 'Vehicle',
              render: (a) => <LinkText to={`/vehicles/${a.vehicleId}`}>{a.vehiclePlate}</LinkText>,
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
            { key: 'status', header: 'Status', render: (a) => <StatusBadge kind="assignment" value={a.status} size="sm" /> },
          ]}
          empty={<EmptyState icon={AssignmentIcon} title="No assignments yet" compact />}
        />
      ) : null}
      {tab === 'trips' ? (
        <Sub
          queryKey={['drivers', 'trips', d.id]}
          url={`/drivers/${d.id}/trips`}
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
            { key: 'vehiclePlate', header: 'Vehicle', hideBelow: 'sm' },
            { key: 'route', header: 'Route', render: (t) => `${t.startLocation} → ${t.destination}`, hideBelow: 'md' },
            { key: 'distanceKm', header: 'Distance', align: 'right', render: (t) => formatKm(t.distanceKm) },
            { key: 'status', header: 'Status', render: (t) => <StatusBadge kind="trip" value={t.status} size="sm" /> },
          ]}
          empty={<EmptyState icon={RouteIcon} title="No trips yet" compact />}
        />
      ) : null}
      {tab === 'incidents' ? (
        <Sub
          queryKey={['drivers', 'incidents', d.id]}
          url={`/drivers/${d.id}/incidents`}
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
            { key: 'vehiclePlate', header: 'Vehicle', hideBelow: 'sm' },
            { key: 'type', header: 'Type', render: (i) => <StatusBadge kind="incidentType" value={i.type} size="sm" dot={false} /> },
            {
              key: 'severity',
              header: 'Severity',
              render: (i) => <StatusBadge kind="severity" value={i.severity} size="sm" />,
              hideBelow: 'md',
            },
            { key: 'estimatedCost', header: 'Est. cost', align: 'right', render: (i) => formatCurrency(i.estimatedCost), hideBelow: 'lg' },
            { key: 'status', header: 'Status', render: (i) => <StatusBadge kind="incident" value={i.status} size="sm" /> },
          ]}
          empty={<EmptyState icon={WarningAmberIcon} title="No incidents or violations" compact />}
        />
      ) : null}
      {tab === 'documents' ? <Documents driver={d} /> : null}

      <AssignDriverDialog open={assignOpen} onClose={() => setAssignOpen(false)} driverId={d.id} onAssigned={() => driver.refetch()} />
      <EndActive driverId={d.id} open={endOpen} onClose={() => setEndOpen(false)} onEnded={() => driver.refetch()} />
      <StatusDialog open={statusOpen} onClose={() => setStatusOpen(false)} driver={d} onChanged={() => driver.refetch()} />
      <ConfirmDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        title={`Archive ${d.fullName}?`}
        description="The driver will no longer be available for assignment. Trips, incidents and assignment history are retained."
        confirmLabel="Archive driver"
      />
    </Box>
  )
}

function EndActive({ driverId, open, onClose, onEnded }) {
  const q = useQuery({
    queryKey: ['assignments', 'active-driver', driverId],
    queryFn: () => http.get('/assignments', { params: { driverId, status: 'ACTIVE', size: 1 } }),
    enabled: open,
  })
  const a = q.data?.content?.[0]
  if (!open || !a) return null
  return <EndAssignmentDialog open={open} onClose={onClose} assignment={a} onEnded={onEnded} />
}

function StatusDialog({ open, onClose, driver, onChanged }) {
  const statuses = useOptions('driver')
  const [status, setStatus] = useState(driver.status)
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/drivers/${driver.id}/status`, body),
    invalidate: [['drivers'], ['dashboard'], ['dispatch']],
    success: 'Status updated',
    onSuccess: () => {
      onChanged?.()
      onClose()
    },
  })
  const submit = async () => {
    setError(null)
    try {
      await change.mutateAsync({ status })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change driver status"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={change.isPending} disabled={status === driver.status}>
            Update
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="New status" required>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} autoFocus>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </Stack>
    </Dialog>
  )
}

function Overview({ driver: d }) {
  const perf = useQuery({ queryKey: ['drivers', 'performance', d.id], queryFn: () => http.get(`/drivers/${d.id}/performance`) })
  const p = perf.data
  return (
    <Stack spacing={2}>
      <StatGrid cols={6}>
        <Stat
          label="Trips completed"
          value={p?.tripsCompleted}
          loading={perf.isLoading}
          hint={p ? `${p.tripsCancelled} cancelled` : null}
        />
        <Stat label="Distance" value={p ? formatNumber(p.distanceKm) : null} unit="km" loading={perf.isLoading} />
        <Stat
          label="On-time rate"
          value={p?.onTimeRate != null ? formatPercent(p.onTimeRate) : '—'}
          loading={perf.isLoading}
          hint="started within 10 min"
        />
        <Stat label="Fuel efficiency" value={p?.fuelEfficiencyKmPerL ?? '—'} unit="km/L" loading={perf.isLoading} />
        <Stat
          label="Incidents"
          value={p?.incidents}
          tone={p?.incidents ? 'warning' : undefined}
          loading={perf.isLoading}
          hint={p ? `${p.violations} violations` : null}
        />
        <Stat label="Rating" value={d.rating ? d.rating.toFixed(1) : '—'} icon={StarIcon} loading={perf.isLoading} hint="out of 5" />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { xl: 'span 2' } }}>
          <CardHeader title="Profile" />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                {
                  label: 'Phone',
                  value: (
                    <MuiLink href={`tel:${d.phone}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <PhoneIcon sx={{ fontSize: 14 }} aria-hidden />
                      {d.phone}
                    </MuiLink>
                  ),
                },
                {
                  label: 'Email',
                  value: d.email ? (
                    <MuiLink href={`mailto:${d.email}`} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <MailIcon sx={{ fontSize: 14 }} aria-hidden />
                      {d.email}
                    </MuiLink>
                  ) : null,
                },
                { label: 'National ID', value: d.nationalId, mono: true },
                { label: 'Licence number', value: d.licenseNumber, mono: true },
                { label: 'Licence categories', value: d.licenseCategory },
                { label: 'Licence expiry', value: <LicenceBadge expiry={d.licenseExpiry} /> },
                { label: 'Licence issued', value: formatDate(d.licenseIssueDate) },
                { label: 'Employment', value: humanize(d.employmentStatus) },
                { label: 'Joined', value: formatDate(d.joiningDate) },
                {
                  label: 'Emergency contact',
                  value: d.emergencyContactName
                    ? `${d.emergencyContactName}${d.emergencyContactPhone ? ` · ${d.emergencyContactPhone}` : ''}`
                    : null,
                  span: 2,
                },
                {
                  label: 'Current vehicle',
                  value: d.currentVehicleId ? <LinkText to={`/vehicles/${d.currentVehicleId}`}>{d.currentVehiclePlate}</LinkText> : 'None',
                },
                d.notes && { label: 'Notes', value: d.notes, span: 'full' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Distance driven" description="Completed trips, last 30 active days" />
          <CardBody>
            <ChartFrame height={200} loading={perf.isLoading} empty={!perf.isLoading && !p?.distanceByDay?.length}>
              <BarChart data={p?.distanceByDay ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} tickFormatter={(x) => formatDate(x).split(' ')[0]} minTickGap={16} />
                <YAxis {...axisProps} width={40} />
                <Tooltip
                  cursor={{ fill: CHART_CURSOR }}
                  content={
                    <ChartTooltip labelFormatter={formatDate} names={{ value: 'Distance' }} format={{ value: (v) => formatKm(v) }} />
                  }
                />
                <Bar dataKey="value" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={14} />
              </BarChart>
            </ChartFrame>
          </CardBody>
        </Card>
      </Box>
    </Stack>
  )
}

function Sub({ queryKey, url, columns, onRowClick, empty }) {
  const [page, setPage] = useState(0)
  const q = usePagedQuery(queryKey, url, { page, size: 10 })
  return (
    <Card>
      <DataTable
        columns={columns}
        rows={q.data?.content ?? []}
        isLoading={q.isLoading}
        error={q.isError ? q.error : null}
        onRetry={q.refetch}
        onRowClick={onRowClick}
        empty={empty}
        stickyHeader={false}
      />
      {q.data && q.data.totalElements > 10 ? (
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

function Documents({ driver }) {
  const { can } = useAuth()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const docs = useQuery({ queryKey: ['documents', 'driver', driver.id], queryFn: () => http.get(`/drivers/${driver.id}/documents`) })
  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        {can('DOCUMENT_MANAGE') ? (
          <Button
            size="sm"
            icon={DescriptionIcon}
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
              ? (x) => {
                  setEditing(x)
                  setOpen(true)
                }
              : undefined
          }
          columns={[
            { key: 'type', header: 'Document', render: (x) => <StatusBadge kind="documentType" value={x.type} size="sm" dot={false} /> },
            { key: 'number', header: 'Number', sx: { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 13 } },
            { key: 'issueDate', header: 'Issued', render: (x) => formatDate(x.issueDate), hideBelow: 'md' },
            { key: 'expiryDate', header: 'Expires', render: (x) => formatDate(x.expiryDate) },
            {
              key: 'attachment',
              header: 'File',
              render: (x) =>
                x.attachment?.fileName ?? (
                  <Box component="span" sx={{ color: 'text.faint' }}>
                    none
                  </Box>
                ),
              hideBelow: 'lg',
            },
            { key: 'status', header: 'Status', render: (x) => <StatusBadge kind="document" value={x.status} size="sm" /> },
          ]}
          empty={<EmptyState icon={DescriptionIcon} title="No documents" compact />}
        />
      </Card>
      <DocumentFormDialog
        open={open}
        onClose={() => setOpen(false)}
        document={editing}
        ownerType="DRIVER"
        ownerId={driver.id}
        onSaved={() => docs.refetch()}
      />
    </Stack>
  )
}
