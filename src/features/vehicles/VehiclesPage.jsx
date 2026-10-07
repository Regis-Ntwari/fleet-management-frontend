import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import Box from '@mui/material/Box'
import AddIcon from '@mui/icons-material/Add'
import DownloadIcon from '@mui/icons-material/Download'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useCategoryOptions, useOptions } from '@/app/ReferenceProvider'
import { Can } from '@/app/AuthProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge, ToneBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Feedback'
import { formatKm, formatRelative } from '@/utils/format'
import { GpsDot } from './GpsDot'

export default function VehiclesPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const categories = useCategoryOptions()
  const statuses = useOptions('vehicle')
  const gps = useOptions('gps')
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      categoryId: state.categoryId,
      maintenanceStatus: state.maintenanceStatus,
      gpsStatus: state.gpsStatus,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['vehicles', 'list'], '/vehicles', params)

  const columns = [
    {
      key: 'plateNumber',
      header: 'Plate',
      sortKey: 'plateNumber',
      render: (v) => (
        <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
          {v.plateNumber}
          <Box component="span" sx={{ ml: 1, fontWeight: 400, color: 'text.muted' }}>
            {v.fleetNumber}
          </Box>
        </Box>
      ),
    },
    {
      key: 'vehicle',
      header: 'Vehicle',
      sortKey: 'make',
      render: (v) => (
        <span>
          {v.make} {v.model}
          <Box component="span" sx={{ ml: 0.75, color: 'text.muted' }}>
            {v.year}
          </Box>
        </span>
      ),
    },
    { key: 'categoryName', header: 'Category', sortKey: 'categoryName', hideBelow: 'md' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (v) => <StatusBadge kind="vehicle" value={v.status} size="sm" /> },
    {
      key: 'currentDriverName',
      header: 'Driver',
      render: (v) =>
        v.currentDriverName ?? (
          <Box component="span" sx={{ color: 'text.faint' }}>
            Unassigned
          </Box>
        ),
      hideBelow: 'lg',
    },
    {
      key: 'odometerKm',
      header: 'Odometer',
      sortKey: 'odometerKm',
      align: 'right',
      render: (v) => formatKm(v.odometerKm),
      hideBelow: 'sm',
    },
    { key: 'maintenanceStatus', header: 'Service', render: (v) => <ToneBadge value={v.maintenanceStatus} size="sm" />, hideBelow: 'lg' },
    { key: 'gps', header: 'GPS', render: (v) => <GpsDot telematics={v.telematics} />, hideBelow: 'md' },
    {
      key: 'updatedAt',
      header: 'Updated',
      sortKey: 'updatedAt',
      render: (v) => (
        <Box component="span" sx={{ color: 'text.muted' }}>
          {formatRelative(v.updatedAt)}
        </Box>
      ),
      hideBelow: 'xl',
    },
  ]

  return (
    <div>
      <PageHeader
        title="Vehicles"
        description="Every vehicle in the LIMOZ fleet with its current status, driver and service position."
        actions={
          <>
            <Button icon={DownloadIcon} to="/reports/daily-fleet">
              Fleet report
            </Button>
            <Can permission="VEHICLE_CREATE">
              <Button variant="primary" icon={AddIcon} to="/vehicles/new">
                Add vehicle
              </Button>
            </Can>
          </>
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Plate, fleet no., make, VIN…"
        onRowClick={(v) => navigate(`/vehicles/${v.id}`)}
        defaultSort="plateNumber,asc"
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
              value={state.categoryId ?? ''}
              onChange={(e) => update({ categoryId: e.target.value })}
              compact
              placeholder="All categories"
              aria-label="Category"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.maintenanceStatus ?? ''}
              onChange={(e) => update({ maintenanceStatus: e.target.value })}
              compact
              placeholder="Any service state"
              aria-label="Service state"
            >
              <option value="OK">Service OK</option>
              <option value="DUE_SOON">Due soon</option>
              <option value="OVERDUE">Overdue</option>
            </Select>
            <Select
              value={state.gpsStatus ?? ''}
              onChange={(e) => update({ gpsStatus: e.target.value })}
              compact
              placeholder="Any GPS state"
              aria-label="GPS"
            >
              {gps.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </>
        }
        empty={
          <EmptyState
            title="No vehicles found"
            description="Try a different search or clear the filters."
            action={
              <Can permission="VEHICLE_CREATE">
                <Button size="sm" icon={AddIcon} to="/vehicles/new">
                  Add vehicle
                </Button>
              </Can>
            }
            compact
          />
        }
      />
    </div>
  )
}
