import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
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
import { DateRangePicker } from '@/components/ui/DateRange'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, LinkText } from '@/components/ui/Feedback'
import { formatCurrency, formatDateTime } from '@/utils/format'

export default function IncidentsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('incident')
  const types = useOptions('incidentType')
  const severities = useOptions('severity')
  const vehicles = useVehicleOptions()
  const summary = useQuery({ queryKey: ['incidents', 'summary'], queryFn: () => http.get('/incidents/summary') })
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      severity: state.severity,
      type: state.type,
      vehicleId: state.vehicleId,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['incidents', 'list'], '/incidents', params)
  const s = summary.data
  const columns = [
    {
      key: 'incidentNumber',
      header: 'Incident',
      sortKey: 'incidentNumber',
      render: (i) => (
        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {i.incidentNumber}
        </Box>
      ),
    },
    { key: 'occurredAt', header: 'When', sortKey: 'occurredAt', render: (i) => formatDateTime(i.occurredAt) },
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      sortKey: 'vehiclePlate',
      render: (i) => <LinkText to={`/vehicles/${i.vehicleId}?tab=incidents`}>{i.vehiclePlate}</LinkText>,
    },
    { key: 'driverName', header: 'Driver', hideBelow: 'lg' },
    {
      key: 'type',
      header: 'Type',
      sortKey: 'type',
      render: (i) => <StatusBadge kind="incidentType" value={i.type} size="sm" dot={false} />,
    },
    {
      key: 'severity',
      header: 'Severity',
      sortKey: 'severity',
      render: (i) => <StatusBadge kind="severity" value={i.severity} size="sm" />,
      hideBelow: 'md',
    },
    {
      key: 'description',
      header: 'Description',
      render: (i) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {i.description}
        </Box>
      ),
      hideBelow: 'xl',
    },
    {
      key: 'estimatedCost',
      header: 'Est. cost',
      align: 'right',
      sortKey: 'estimatedCost',
      render: (i) => formatCurrency(i.estimatedCost),
      hideBelow: 'sm',
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (i) => <StatusBadge kind="incident" value={i.status} size="sm" /> },
  ]
  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Incidents"
        description="Accidents, breakdowns, violations and complaints with investigation and corrective action history."
        actions={
          <Can permission="INCIDENT_MANAGE">
            <Button variant="primary" icon={AddIcon} to="/incidents/new">
              Report incident
            </Button>
          </Can>
        }
      />
      <StatGrid cols={4}>
        <Stat label="Open" value={s?.open} tone={s?.open ? 'danger' : undefined} loading={summary.isLoading} to="/incidents?status=OPEN" />
        <Stat
          label="Under investigation"
          value={s?.underInvestigation}
          tone="warning"
          loading={summary.isLoading}
          to="/incidents?status=UNDER_INVESTIGATION"
        />
        <Stat label="This month" value={s?.thisMonth} loading={summary.isLoading} />
        <Stat
          label="Estimated cost (open)"
          value={s ? formatCurrency(s.estimatedCostOpen, { compact: true }) : null}
          loading={summary.isLoading}
        />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Incident no., plate, driver, place, description…"
        onRowClick={(i) => navigate(`/incidents/${i.id}`)}
        defaultSort="occurredAt,desc"
        filters={
          <>
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value })}
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
              value={state.severity ?? ''}
              onChange={(e) => update({ severity: e.target.value })}
              compact
              placeholder="Any severity"
              aria-label="Severity"
            >
              {severities.map((x) => (
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
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState icon={WarningAmberIcon} title="No incidents match" compact />}
      />
    </Stack>
  )
}
