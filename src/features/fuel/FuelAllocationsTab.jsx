import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { Select } from '@/components/ui/Field'
import { Dash, StatusBadge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, LinkText } from '@/components/ui/Feedback'
import { Button } from '@/components/ui/Button'
import { formatCurrency, formatLitres, formatSmartDateTime } from '@/utils/format'
import { AllocateFuelDialog } from './AllocateFuelDialog'

/** Officer's queue of fuel allocations: what is out with drivers, what is waiting to be verified. */
export function FuelAllocationsTab({ allocateOpen, onAllocateClose }) {
  const [state, update] = useSearchState({ size: 20, open: 'true' })
  const [, setParams] = useSearchParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const statuses = useOptions('fuelRequest')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [localOpen, setLocalOpen] = useState(false)
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      open: state.status ? undefined : state.open,
      vehicleId: state.vehicleId,
      driverId: state.driverId,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['fuel', 'allocations', 'list'], '/fuel/allocations', params)
  const summary = useQuery({ queryKey: ['fuel', 'allocations', 'summary'], queryFn: () => http.get('/fuel/allocations/summary') })
  const s = summary.data
  const reset = () => setParams(new URLSearchParams({ tab: 'allocations' }), { replace: true })

  const columns = [
    {
      key: 'requestNumber',
      header: 'Allocation',
      sortKey: 'requestNumber',
      render: (r) => (
        <Box component="span">
          <LinkText to={`/fuel/allocations/${r.id}`} sx={{ fontWeight: 500 }}>
            {r.requestNumber}
          </LinkText>
          <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
            {formatSmartDateTime(r.createdAt)} · {r.createdByName}
          </Box>
        </Box>
      ),
    },
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      sortKey: 'vehiclePlate',
      render: (r) => <LinkText to={`/vehicles/${r.vehicleId}?tab=fuel`}>{r.vehiclePlate}</LinkText>,
    },
    {
      key: 'driverName',
      header: 'Driver',
      sortKey: 'driverName',
      render: (r) => <LinkText to={`/drivers/${r.driverId}`}>{r.driverName}</LinkText>,
      hideBelow: 'md',
    },
    {
      key: 'litresAllocated',
      header: 'Allocated',
      sortKey: 'litresAllocated',
      align: 'right',
      render: (r) => formatLitres(r.litresAllocated),
    },
    { key: 'station', header: 'Station', render: (r) => r.station ?? <Dash />, hideBelow: 'lg' },
    {
      key: 'dueAt',
      header: 'Fill up by',
      sortKey: 'dueAt',
      render: (r) =>
        r.dueAt ? (
          <Box component="span" sx={r.overdue ? { color: 'soft.danger.fg', fontWeight: 500 } : undefined}>
            {formatSmartDateTime(r.dueAt)}
            {r.overdue ? ' · overdue' : ''}
          </Box>
        ) : (
          <Dash />
        ),
      hideBelow: 'lg',
    },
    {
      key: 'submission',
      header: 'Receipt',
      align: 'right',
      render: (r) =>
        r.submission ? (
          <Box component="span">
            <Box component="span" sx={{ display: 'block', fontWeight: 500 }}>
              {formatLitres(r.submission.litres)}
            </Box>
            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
              {formatCurrency(r.submission.totalAmount)}
            </Box>
          </Box>
        ) : (
          <Dash />
        ),
      hideBelow: 'sm',
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (r) => <StatusBadge kind="fuelRequest" value={r.status} size="sm" /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) =>
        r.status === 'SUBMITTED' && can('FUEL_MANAGE') ? (
          <Button size="xs" variant="primary" to={`/fuel/allocations/${r.id}`} onClick={(e) => e.stopPropagation()}>
            Review
          </Button>
        ) : null,
    },
  ]

  return (
    <Stack spacing={2.5}>
      <StatGrid cols={5}>
        <Stat
          label="Awaiting fill-up"
          value={s?.pending}
          loading={summary.isLoading}
          hint={s?.litresOpen ? `${formatLitres(s.litresOpen)} out` : null}
        />
        <Stat label="Receipts to verify" value={s?.submitted} tone={s?.submitted ? 'info' : undefined} loading={summary.isLoading} />
        <Stat label="Returned to driver" value={s?.returned} tone={s?.returned ? 'warning' : undefined} loading={summary.isLoading} />
        <Stat label="Overdue" value={s?.overdue} tone={s?.overdue ? 'danger' : undefined} loading={summary.isLoading} />
        <Stat label="Verified this month" value={s?.verifiedThisMonth} loading={summary.isLoading} />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        onRowClick={(r) => navigate(`/fuel/allocations/${r.id}`)}
        searchPlaceholder="Allocation no., plate, driver, station…"
        defaultSort="createdAt,desc"
        filters={
          <>
            <SegmentedControl
              label="Show"
              value={state.status ? 'all' : (state.open ?? 'true')}
              onChange={(v) => update({ open: v === 'all' ? 'false' : 'true', status: '' })}
              options={[
                { value: 'true', label: 'Open' },
                { value: 'false', label: 'All' },
              ]}
            />
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value, open: e.target.value ? 'false' : 'true' })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((st) => (
                <option key={st.value} value={st.value}>
                  {st.label}
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
          </>
        }
        empty={
          <EmptyState
            icon={LocalGasStationIcon}
            title="No fuel allocations"
            description="Allocate fuel to a driver and it shows up here until the receipt is verified."
            action={
              can('FUEL_MANAGE') ? (
                <Button variant="primary" onClick={() => setLocalOpen(true)}>
                  Allocate fuel
                </Button>
              ) : null
            }
            compact
          />
        }
      />
      <AllocateFuelDialog
        open={allocateOpen || localOpen}
        onClose={() => {
          setLocalOpen(false)
          onAllocateClose?.()
        }}
      />
    </Stack>
  )
}
