import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { format } from 'date-fns'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import DownloadIcon from '@mui/icons-material/Download'
import PrintIcon from '@mui/icons-material/Print'
import { useSearchState } from '@/hooks/useSearchState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/Display'
import { Input, Select } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { formatDate, formatDuration, formatKm, formatNumber, formatTime, humanize } from '@/utils/format'
import { downloadFile, toCsv } from '@/utils/csv'
import { useDailyPosition } from './api'
import { DashboardFilters } from './DashboardFilters'

const FLAG_TONE = { NOT_MOVED: 'neutral', EXCESSIVE_HOURS: 'warning', HIGH_DISTANCE: 'warning', NIGHT_DRIVING: 'info', GPS_ISSUE: 'danger' }
const FLAG_LABEL = {
  NOT_MOVED: 'Not moved',
  EXCESSIVE_HOURS: 'Excessive hours',
  HIGH_DISTANCE: 'High distance',
  NIGHT_DRIVING: 'Night driving',
  GPS_ISSUE: 'GPS issue',
}

export default function DailyPositionPage() {
  const today = format(new Date(), 'yyyy-MM-dd')
  const [state, update, reset] = useSearchState({ date: today })
  const [flag, setFlag] = useState('')
  const navigate = useNavigate()
  const params = useMemo(
    () => ({
      date: state.date,
      categoryId: state.categoryId,
      department: state.department,
      vehicleId: state.vehicleId,
      driverId: state.driverId,
    }),
    [state],
  )
  const q = useDailyPosition(params)
  const rows = useMemo(() => (q.data ?? []).filter((r) => !flag || r.flags.includes(flag)), [q.data, flag])

  const totals = useMemo(() => {
    const all = q.data ?? []
    return {
      moved: all.filter((r) => r.distanceKm > 0).length,
      notMoved: all.filter((r) => r.flags.includes('NOT_MOVED')).length,
      distance: all.reduce((s, r) => s + r.distanceKm, 0),
      flagged: all.filter((r) => r.flags.some((f) => f !== 'NOT_MOVED')).length,
    }
  }, [q.data])

  const exportCsv = () => {
    const columns = [
      { key: 'plateNumber', label: 'Plate' },
      { key: 'categoryName', label: 'Category' },
      { key: 'driverName', label: 'Driver' },
      { key: 'status', label: 'Status' },
      { key: 'distanceKm', label: 'Distance (km)' },
      { key: 'trips', label: 'Trips' },
      { key: 'drivingMinutes', label: 'Driving (min)' },
      { key: 'maxSpeedKph', label: 'Max km/h' },
      { key: 'firstMovementAt', label: 'First movement' },
      { key: 'lastMovementAt', label: 'Last movement' },
      { key: 'gpsStatus', label: 'GPS' },
      { key: 'flags', label: 'Flags' },
    ]
    downloadFile(
      toCsv(
        columns,
        rows.map((r) => ({ ...r, flags: r.flags.map((f) => FLAG_LABEL[f]).join('; ') })),
      ),
      `daily-position-${state.date}.csv`,
    )
  }

  const columns = [
    {
      key: 'plateNumber',
      header: 'Vehicle',
      sortKey: 'plateNumber',
      render: (r) => (
        <Box component="span" sx={{ fontWeight: 500 }}>
          {r.plateNumber}
          <Box component="span" sx={{ ml: 1, fontWeight: 400, color: 'text.muted' }}>
            {r.categoryName}
          </Box>
        </Box>
      ),
    },
    {
      key: 'driverName',
      header: 'Driver',
      render: (r) =>
        r.driverName ?? (
          <Box component="span" sx={{ color: 'text.faint' }}>
            Unassigned
          </Box>
        ),
      hideBelow: 'md',
    },
    { key: 'status', header: 'Status', render: (r) => <StatusBadge kind="vehicle" value={r.status} size="sm" /> },
    { key: 'distanceKm', header: 'Distance', align: 'right', render: (r) => formatKm(r.distanceKm) },
    { key: 'trips', header: 'Trips', align: 'right', hideBelow: 'sm' },
    { key: 'drivingMinutes', header: 'Driving', align: 'right', render: (r) => formatDuration(r.drivingMinutes), hideBelow: 'lg' },
    {
      key: 'window',
      header: 'First → last',
      render: (r) => (r.firstMovementAt ? `${formatTime(r.firstMovementAt)} → ${formatTime(r.lastMovementAt)}` : '—'),
      hideBelow: 'lg',
    },
    { key: 'maxSpeedKph', header: 'Max km/h', align: 'right', hideBelow: 'xl' },
    { key: 'gpsStatus', header: 'GPS', render: (r) => <StatusBadge kind="gps" value={r.gpsStatus} size="sm" />, hideBelow: 'md' },
    {
      key: 'flags',
      header: 'Flags',
      render: (r) =>
        r.flags.length ? (
          <Box component="span" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {r.flags.map((f) => (
              <Badge key={f} tone={FLAG_TONE[f]} size="sm">
                {FLAG_LABEL[f] ?? humanize(f)}
              </Badge>
            ))}
          </Box>
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            —
          </Box>
        ),
    },
  ]

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Daily position"
        description={`Where every vehicle stood on ${formatDate(state.date)}: who drove it, how far, and what needs follow-up.`}
        actions={
          <>
            <Button icon={PrintIcon} onClick={() => window.print()}>
              Print
            </Button>
            <Button icon={DownloadIcon} onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
          </>
        }
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Input
            type="date"
            value={state.date}
            max={today}
            onChange={(e) => update({ date: e.target.value || today })}
            fullWidth={false}
            aria-label="Date"
          />
          <DashboardFilters state={state} update={update} reset={reset} showRange={false} showStatus={false} />
        </Box>
      </PageHeader>

      <StatGrid cols={4}>
        <Stat label="Vehicles moved" value={totals.moved} loading={q.isLoading} />
        <Stat label="Did not move" value={totals.notMoved} tone={totals.notMoved ? 'warning' : undefined} loading={q.isLoading} />
        <Stat label="Distance" value={formatNumber(totals.distance)} unit="km" loading={q.isLoading} />
        <Stat label="Flagged for review" value={totals.flagged} tone={totals.flagged ? 'danger' : undefined} loading={q.isLoading} />
      </StatGrid>

      <Card>
        <FilterBar hasFilters={!!flag} onReset={() => setFlag('')}>
          <Select value={flag} onChange={(e) => setFlag(e.target.value)} compact aria-label="Flag" placeholder="All vehicles">
            {Object.entries(FLAG_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
          <Box component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
            {formatNumber(rows.length)} vehicles
          </Box>
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.vehicleId}
          isLoading={q.isLoading}
          error={q.isError ? q.error : null}
          onRetry={q.refetch}
          onRowClick={(r) => navigate(`/vehicles/${r.vehicleId}`)}
          stickyHeader={false}
        />
      </Card>
    </Stack>
  )
}
