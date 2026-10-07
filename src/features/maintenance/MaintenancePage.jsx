import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import BuildIcon from '@mui/icons-material/Build'
import EventRepeatIcon from '@mui/icons-material/EventRepeat'
import { http } from '@/api/client'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery, useVehicleOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { DateRangePicker } from '@/components/ui/DateRange'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, LinkText } from '@/components/ui/Feedback'
import { formatCurrency, formatDate } from '@/utils/format'

export default function MaintenancePage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('maintenance')
  const types = useOptions('maintenanceType')
  const vehicles = useVehicleOptions()
  const workshops = useQuery({ queryKey: ['maintenance', 'workshops'], queryFn: () => http.get('/maintenance/workshops') })
  const summary = useQuery({ queryKey: ['maintenance', 'summary'], queryFn: () => http.get('/maintenance/summary') })
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      open: state.open,
      type: state.type,
      vehicleId: state.vehicleId,
      workshop: state.workshop,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['maintenance', 'list'], '/maintenance', params)
  const s = summary.data
  const now = new Date().toISOString()
  const columns = [
    {
      key: 'maintenanceNumber',
      header: 'Job',
      sortKey: 'maintenanceNumber',
      render: (m) => (
        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {m.maintenanceNumber}
        </Box>
      ),
    },
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      sortKey: 'vehiclePlate',
      render: (m) => <LinkText to={`/vehicles/${m.vehicleId}?tab=maintenance`}>{m.vehiclePlate}</LinkText>,
    },
    { key: 'reportedAt', header: 'Reported', sortKey: 'reportedAt', render: (m) => formatDate(m.reportedAt), hideBelow: 'sm' },
    {
      key: 'type',
      header: 'Type',
      sortKey: 'type',
      render: (m) => <StatusBadge kind="maintenanceType" value={m.type} size="sm" dot={false} />,
      hideBelow: 'md',
    },
    {
      key: 'complaint',
      header: 'Complaint',
      render: (m) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.complaint}
        </Box>
      ),
    },
    { key: 'workshop', header: 'Workshop', hideBelow: 'xl' },
    {
      key: 'expectedCompletionAt',
      header: 'Expected',
      render: (m) =>
        m.expectedCompletionAt ? (
          <Box
            component="span"
            sx={
              !m.completedAt && m.expectedCompletionAt < now && !['COMPLETED', 'CANCELLED'].includes(m.status)
                ? { fontWeight: 500, color: 'soft.danger.fg' }
                : undefined
            }
          >
            {formatDate(m.expectedCompletionAt)}
          </Box>
        ) : (
          '—'
        ),
      hideBelow: 'lg',
    },
    { key: 'totalCost', header: 'Cost', sortKey: 'totalCost', align: 'right', render: (m) => formatCurrency(m.totalCost) },
    { key: 'status', header: 'Status', sortKey: 'status', render: (m) => <StatusBadge kind="maintenance" value={m.status} size="sm" /> },
  ]
  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Maintenance"
        description="Workshop jobs from report to completion, with parts, labour and cost."
        actions={
          <>
            <Button icon={EventRepeatIcon} to="/maintenance/schedules">
              Service schedules
            </Button>
            <Can permission="MAINTENANCE_MANAGE">
              <Button variant="primary" icon={AddIcon} to="/maintenance/new">
                Report maintenance
              </Button>
            </Can>
          </>
        }
      />
      <StatGrid cols={5}>
        <Stat label="Open jobs" value={s?.open} loading={summary.isLoading} to="/maintenance?open=true" />
        <Stat label="In progress" value={s?.inProgress} tone="accent" loading={summary.isLoading} to="/maintenance?status=IN_PROGRESS" />
        <Stat
          label="Waiting for parts"
          value={s?.waitingForParts}
          tone="warning"
          loading={summary.isLoading}
          to="/maintenance?status=WAITING_FOR_PARTS"
        />
        <Stat label="Past expected date" value={s?.overdue} tone={s?.overdue ? 'danger' : undefined} loading={summary.isLoading} />
        <Stat
          label="Completed this month"
          value={s?.completedThisMonth}
          loading={summary.isLoading}
          hint={s ? formatCurrency(s.costThisMonth) : null}
        />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Job no., plate, complaint, workshop…"
        onRowClick={(m) => navigate(`/maintenance/${m.id}`)}
        defaultSort="reportedAt,desc"
        filters={
          <>
            <SegmentedControl
              label="Scope"
              value={state.open ?? ''}
              onChange={(v) => update({ open: v, status: undefined })}
              options={[
                { value: '', label: 'All' },
                { value: 'true', label: 'Open' },
              ]}
            />
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value, open: undefined })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.type ?? ''}
              onChange={(e) => update({ type: e.target.value })}
              compact
              placeholder="Any type"
              aria-label="Type"
            >
              {types.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.vehicleId ?? ''}
              onChange={(e) => update({ vehicleId: e.target.value })}
              compact
              placeholder="All vehicles"
              aria-label="Vehicle"
            >
              {vehicles.options.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.workshop ?? ''}
              onChange={(e) => update({ workshop: e.target.value })}
              compact
              placeholder="All workshops"
              aria-label="Workshop"
            >
              {(workshops.data ?? []).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState icon={BuildIcon} title="No maintenance jobs match" compact />}
      />
    </Stack>
  )
}
