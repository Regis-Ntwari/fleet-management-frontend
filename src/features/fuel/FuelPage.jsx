import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadIcon from '@mui/icons-material/Upload'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery, useVehicleOptions } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { Badge, Dash } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { DateRangePicker, defaultRange } from '@/components/ui/DateRange'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, LinkText } from '@/components/ui/Feedback'
import { formatCurrency, formatDateTime, formatKm, formatLitres, formatNumber } from '@/utils/format'

const DEFAULTS = { size: 20, ...defaultRange('30d') }

export default function FuelPage() {
  const [state, update, reset] = useSearchState(DEFAULTS)
  const navigate = useNavigate()
  const { can } = useAuth()
  const vehicles = useVehicleOptions()
  const stations = useQuery({ queryKey: ['fuel', 'stations'], queryFn: () => http.get('/fuel/stations') })
  const [deleting, setDeleting] = useState(null)
  const params = useMemo(
    () => ({
      q: state.q,
      vehicleId: state.vehicleId,
      station: state.station,
      anomaly: state.anomaly,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['fuel', 'list'], '/fuel', params)
  const summary = useQuery({
    queryKey: ['fuel', 'summary', state.from, state.to, state.vehicleId],
    queryFn: () => http.get('/fuel/summary', { params: { from: state.from, to: state.to, vehicleId: state.vehicleId } }),
  })
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/fuel/${id}`),
    invalidate: [['fuel'], ['dashboard'], ['vehicles']],
    success: 'Fuel transaction deleted',
    onSuccess: () => setDeleting(null),
  })
  const s = summary.data

  const columns = [
    { key: 'transactedAt', header: 'Date', sortKey: 'transactedAt', render: (f) => formatDateTime(f.transactedAt) },
    {
      key: 'vehiclePlate',
      header: 'Vehicle',
      sortKey: 'vehiclePlate',
      render: (f) => <LinkText to={`/vehicles/${f.vehicleId}?tab=fuel`}>{f.vehiclePlate}</LinkText>,
    },
    { key: 'driverName', header: 'Driver', render: (f) => f.driverName ?? <Dash />, hideBelow: 'lg' },
    { key: 'station', header: 'Station', sortKey: 'station', hideBelow: 'md' },
    { key: 'litres', header: 'Litres', sortKey: 'litres', align: 'right', render: (f) => formatLitres(f.litres) },
    { key: 'pricePerLitre', header: 'Price/L', align: 'right', render: (f) => formatNumber(f.pricePerLitre), hideBelow: 'xl' },
    {
      key: 'totalAmount',
      header: 'Amount',
      sortKey: 'totalAmount',
      align: 'right',
      render: (f) => (
        <Box component="span" sx={{ fontWeight: 500 }}>
          {formatCurrency(f.totalAmount)}
        </Box>
      ),
    },
    { key: 'odometerKm', header: 'Odometer', align: 'right', render: (f) => formatKm(f.odometerKm), hideBelow: 'lg' },
    {
      key: 'litresPer100Km',
      header: 'L/100 km',
      align: 'right',
      sortKey: 'litresPer100Km',
      render: (f) =>
        f.litresPer100Km != null ? (
          <Box component="span" sx={f.anomaly ? { fontWeight: 500, color: 'soft.warning.fg' } : undefined}>
            {formatNumber(f.litresPer100Km, 1)}
          </Box>
        ) : (
          <Dash />
        ),
      hideBelow: 'sm',
    },
    {
      key: 'anomaly',
      header: '',
      render: (f) =>
        f.anomaly ? (
          <Box component="span" title={f.anomaly} sx={{ display: 'inline-flex', cursor: 'help' }}>
            <Badge tone="warning" size="sm" sx={{ cursor: 'help' }}>
              Anomaly
            </Badge>
          </Box>
        ) : null,
      hideBelow: 'md',
    },
    can('FUEL_MANAGE') && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (f) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton label="Edit" icon={EditIcon} size="xs" onClick={() => navigate(`/fuel/${f.id}/edit`)} />
          <IconButton label="Delete" icon={DeleteIcon} size="xs" onClick={() => setDeleting(f)} />
        </Box>
      ),
    },
  ]

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Fuel"
        description="Every fill with cost and consumption calculated against the previous odometer reading. Anomalies are flagged automatically."
        actions={
          <>
            {can('FUEL_MANAGE') ? (
              <Button icon={UploadIcon} to="/admin/imports?type=fuel">
                Import CSV
              </Button>
            ) : null}
            {can('FUEL_MANAGE') ? (
              <Button variant="primary" icon={AddIcon} to="/fuel/new">
                Record fuel
              </Button>
            ) : null}
          </>
        }
      />
      <StatGrid cols={5}>
        <Stat label="Fills" value={s?.fills} loading={summary.isLoading} />
        <Stat label="Litres" value={s ? formatNumber(s.litres) : null} unit="L" loading={summary.isLoading} />
        <Stat
          label="Cost"
          value={s ? formatCurrency(s.cost, { compact: true }) : null}
          loading={summary.isLoading}
          hint={s?.averagePricePerLitre ? `avg RWF ${formatNumber(s.averagePricePerLitre)}/L` : null}
        />
        <Stat label="Fleet average" value={s?.averageL100 ?? '—'} unit="L/100 km" loading={summary.isLoading} />
        <Stat label="Anomalies" value={s?.anomalies} tone={s?.anomalies ? 'warning' : undefined} loading={summary.isLoading} />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Plate, driver, station, receipt…"
        defaultSort="transactedAt,desc"
        filters={
          <>
            <DateRangePicker value={{ from: state.from, to: state.to }} onChange={(r) => update(r)} />
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
              value={state.station ?? ''}
              onChange={(e) => update({ station: e.target.value })}
              compact
              placeholder="All stations"
              aria-label="Station"
            >
              {(stations.data ?? []).map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </Select>
            <SegmentedControl
              label="Anomalies"
              value={state.anomaly ?? ''}
              onChange={(v) => update({ anomaly: v })}
              options={[
                { value: '', label: 'All fills' },
                { value: 'true', label: 'Anomalies only' },
              ]}
            />
          </>
        }
        empty={
          <EmptyState
            icon={LocalGasStationIcon}
            title="No fuel transactions"
            description="Widen the date range or record a fill."
            compact
          />
        }
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete fuel transaction?"
        description={
          deleting
            ? `${formatLitres(deleting.litres)} at ${deleting.station} for ${deleting.vehiclePlate} will be removed. Consumption for the next fill is recalculated.`
            : ''
        }
        confirmLabel="Delete"
      />
    </Stack>
  )
}
