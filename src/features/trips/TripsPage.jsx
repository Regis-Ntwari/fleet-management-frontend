import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery, useVehicleOptions, useDriverOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Dash, StatusBadge } from '@/components/ui/Badge'
import { DateRangePicker } from '@/components/ui/DateRange'
import { EmptyState } from '@/components/ui/Feedback'
import { formatDateTime, formatDuration, formatKm } from '@/utils/format'

export default function TripsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const statuses = useOptions('trip')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
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
  const query = usePagedQuery(['trips', 'list'], '/trips', params)
  const columns = [
    {
      key: 'tripNumber',
      header: 'Trip',
      sortKey: 'tripNumber',
      render: (t) => (
        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {t.tripNumber}
        </Box>
      ),
    },
    { key: 'scheduledStartAt', header: 'Scheduled', sortKey: 'scheduledStartAt', render: (t) => formatDateTime(t.scheduledStartAt) },
    { key: 'vehiclePlate', header: 'Vehicle', sortKey: 'vehiclePlate', hideBelow: 'sm' },
    { key: 'driverName', header: 'Driver', sortKey: 'driverName', hideBelow: 'md' },
    {
      key: 'route',
      header: 'Route',
      render: (t) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t.startLocation} → {t.destination}
        </Box>
      ),
      hideBelow: 'lg',
    },
    { key: 'customerName', header: 'Customer', render: (t) => t.customerName ?? <Dash />, hideBelow: 'xl' },
    { key: 'distanceKm', header: 'Distance', align: 'right', render: (t) => formatKm(t.distanceKm) },
    { key: 'durationMinutes', header: 'Duration', align: 'right', render: (t) => formatDuration(t.durationMinutes), hideBelow: 'lg' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (t) => <StatusBadge kind="trip" value={t.status} size="sm" /> },
  ]
  return (
    <Box>
      <PageHeader
        title="Trips"
        description="Every planned, running and completed journey. Distance is calculated from odometer readings."
        actions={
          <Can permission="TRIP_MANAGE">
            <Button variant="primary" icon={AddIcon} to="/trips/new">
              Plan trip
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
        searchPlaceholder="Trip no., plate, driver, customer, place…"
        onRowClick={(t) => navigate(`/trips/${t.id}`)}
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
        empty={<EmptyState title="No trips match" description="Adjust the filters, or plan a new trip." compact />}
      />
    </Box>
  )
}
