import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery, useVehicleOptions, useDriverOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useCompanyOptions, useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Dash, StatusBadge } from '@/components/ui/Badge'
import { DateRangePicker } from '@/components/ui/DateRange'
import { EmptyState } from '@/components/ui/Feedback'
import { formatCurrency, formatDateTime, formatKm } from '@/utils/format'

export default function DeploymentsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('deployment')
  const owners = useOptions('vehicleOwner')
  const companies = useCompanyOptions({ includeInactive: true })
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      companyId: state.companyId,
      owner: state.owner,
      vehicleId: state.vehicleId,
      driverId: state.driverId,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['deployments', 'list'], '/deployments', params)
  const columns = [
    {
      key: 'deploymentNumber',
      header: 'Deployment',
      sortKey: 'deploymentNumber',
      render: (t) => (
        <Box
          component="span"
          sx={{ fontWeight: 500, color: 'text.primary', fontFamily: (th) => th.typography.fontFamilyMono, fontSize: 12.5 }}
        >
          {t.deploymentNumber}
        </Box>
      ),
    },
    { key: 'scheduledStartAt', header: 'Scheduled', sortKey: 'scheduledStartAt', render: (t) => formatDateTime(t.scheduledStartAt) },
    { key: 'vehiclePlate', header: 'Vehicle', sortKey: 'vehiclePlate', hideBelow: 'sm' },
    { key: 'driverName', header: 'Driver', sortKey: 'driverName', hideBelow: 'md' },
    {
      key: 'institution',
      header: 'Institution',
      sortKey: 'institution',
      render: (t) => (
        <span>
          <Box
            component="span"
            sx={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >
            {t.institution ?? <Dash />}
          </Box>
          {t.lpoNumber ? (
            <Box component="span" sx={{ display: 'block', fontSize: 11.5, color: 'text.muted' }}>
              LPO {t.lpoNumber}
            </Box>
          ) : null}
        </span>
      ),
      hideBelow: 'lg',
    },
    { key: 'destination', header: 'Destination', hideBelow: 'xl' },
    { key: 'effectiveDays', header: 'Days', sortKey: 'effectiveDays', align: 'right', hideBelow: 'md' },
    { key: 'amount', header: 'Amount', sortKey: 'amount', align: 'right', render: (t) => formatCurrency(t.amount), hideBelow: 'lg' },
    { key: 'distanceKm', header: 'Distance', align: 'right', render: (t) => formatKm(t.distanceKm), hideBelow: 'xl' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (t) => <StatusBadge kind="deployment" value={t.status} size="sm" /> },
  ]
  return (
    <Box>
      <PageHeader
        title="Deployments"
        description="Vehicles deployed to institutions against their purchase orders. Departure and return readings are recorded at the gate."
        actions={
          <Can permission="DEPLOYMENT_MANAGE">
            <Button variant="primary" icon={AddIcon} to="/deployments/new">
              New deployment
            </Button>
          </Can>
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Deployment no., LPO, plate, driver, institution, place…"
        onRowClick={(t) => navigate(`/deployments/${t.id}`)}
        defaultSort="scheduledStartAt,desc"
        filters={
          <>
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.companyId ?? ''}
              onChange={(e) => update({ companyId: e.target.value })}
              compact
              placeholder="All companies"
              aria-label="Company"
            >
              {companies.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.owner ?? ''}
              onChange={(e) => update({ owner: e.target.value })}
              compact
              placeholder="Any owner"
              aria-label="Owner"
            >
              {owners.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
              value={state.driverId ?? ''}
              onChange={(e) => update({ driverId: e.target.value })}
              compact
              placeholder="All drivers"
              aria-label="Driver"
            >
              {drivers.options.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState title="No deployments match" description="Adjust the filters, or register a new deployment." compact />}
      />
    </Box>
  )
}
