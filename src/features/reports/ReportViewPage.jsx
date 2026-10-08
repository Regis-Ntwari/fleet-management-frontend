import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import DownloadIcon from '@mui/icons-material/Download'
import TableChartIcon from '@mui/icons-material/TableChart'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import RefreshIcon from '@mui/icons-material/Refresh'
import ViewSidebarOutlinedIcon from '@mui/icons-material/ViewSidebarOutlined'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useToast } from '@/components/ui/Toast'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { FilterBar } from '@/components/ui/Display'
import { Input } from '@/components/ui/Field'
import { DateRangePicker, defaultRange } from '@/components/ui/DateRange'
import { Dropdown } from '@/components/ui/Dropdown'
import { SegmentedControl } from '@/components/ui/Tabs'
import { ToneBadge, StatusBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { formatCell, toCsv, downloadFile } from '@/utils/csv'
import { formatDateTime, formatDate, formatNumber } from '@/utils/format'
import { ChartGrid, KpiRow } from './ReportCharts'

const STATUS_KINDS = { status: null, type: null, severity: 'severity', state: null, ownerType: null }
const VIEWS = [
  { value: 'all', label: 'Charts & table' },
  { value: 'charts', label: 'Charts' },
  { value: 'table', label: 'Table' },
]

export default function ReportViewPage() {
  const { key } = useParams()
  const { can } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const today = format(new Date(), 'yyyy-MM-dd')
  const [state, update] = useSearchState({ ...defaultRange('30d'), date: today, view: 'all' })
  const defs = useQuery({ queryKey: ['reports', 'definitions'], queryFn: () => http.get('/reports'), staleTime: 600_000 })
  const def = defs.data?.find((r) => r.key === key)
  const params = useMemo(() => (def?.supportsDateRange ? { from: state.from, to: state.to } : { date: state.date }), [def, state])
  const report = useQuery({
    queryKey: ['reports', key, params],
    queryFn: () => http.get(`/reports/${key}`, { params }),
    enabled: Boolean(def),
  })
  const r = report.data
  const view = VIEWS.some((v) => v.value === state.view) ? state.view : 'all'
  const showCharts = view !== 'table'
  const showTable = view !== 'charts'

  const exportAs = async (type) => {
    if (!r) return
    const name = `${key}-${def.supportsDateRange ? `${state.from}_${state.to}` : state.date}`
    // The export is recorded server-side for the audit trail. CSV is produced here from the
    // rows already loaded. Excel and PDF are backend deliverables (`?export=xlsx|pdf` streams
    // the file); in demo mode Excel falls back to CSV and PDF opens the print-ready document
    // that mirrors the server's PDF layout.
    try {
      await http.get(`/reports/${key}`, { params: { ...params, export: type } })
    } catch {
      /* audit is best-effort */
    }
    if (type === 'csv') downloadFile(toCsv(r.columns, r.rows), `${name}.csv`)
    else if (type === 'xlsx') {
      downloadFile(toCsv(r.columns, r.rows), `${name}.csv`)
      toast.info('Excel export', 'Delivered as CSV in demo mode. The Spring Boot backend streams a real .xlsx workbook.')
    } else {
      const qs = new URLSearchParams({ ...params, autoprint: '1' })
      navigate(`/reports/${key}/print?${qs}`)
    }
  }

  if (defs.isLoading) return null
  if (!def)
    return (
      <EmptyState title="Unknown report" description="This report does not exist." action={<Button to="/reports">All reports</Button>} />
    )

  const columns = (r?.columns ?? []).map((c) => ({
    key: c.key,
    header: c.label,
    align: c.align,
    render: (row) => {
      const v = row[c.key]
      if (c.format === 'status')
        return v ? (
          STATUS_KINDS[c.key] === 'severity' ? (
            <StatusBadge kind="severity" value={v} size="sm" />
          ) : (
            <ToneBadge value={v} size="sm" />
          )
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            —
          </Box>
        )
      return formatCell(v, c)
    },
  }))

  const periodLabel = r ? (def.supportsDateRange ? `${formatDate(r.from)} – ${formatDate(r.to)}` : formatDate(r.date)) : null
  const printTo = `/reports/${key}/print?${new URLSearchParams(params)}`

  return (
    <Box>
      <PageHeader
        title={def.name}
        description={def.description}
        breadcrumbs={[{ label: 'Reports', to: '/reports' }, { label: def.name }]}
        actions={
          <>
            <Button icon={RefreshIcon} variant="ghost" onClick={() => report.refetch()} loading={report.isFetching && !report.isLoading}>
              Refresh
            </Button>
            <Button icon={ViewSidebarOutlinedIcon} variant="secondary" to={printTo} disabled={!r}>
              Preview PDF
            </Button>
            {can('REPORT_EXPORT') ? (
              <Dropdown
                trigger={
                  <Button variant="primary" icon={DownloadIcon}>
                    Export
                  </Button>
                }
                items={[
                  { label: 'CSV', icon: TableChartIcon, onSelect: () => exportAs('csv') },
                  { label: 'Excel (.xlsx)', icon: TableChartIcon, onSelect: () => exportAs('xlsx') },
                  { label: 'PDF report', icon: PictureAsPdfIcon, onSelect: () => exportAs('pdf') },
                ]}
              />
            ) : null}
          </>
        }
      />

      <Card sx={{ mb: 2 }}>
        <FilterBar
          sx={{ borderBottom: 0 }}
          trailing={
            <>
              {r ? (
                <Box component="span" sx={{ fontSize: 12, color: 'text.muted', display: { xs: 'none', md: 'inline' } }}>
                  Generated {formatDateTime(r.generatedAt)} · {formatNumber(r.rows.length)} rows
                </Box>
              ) : null}
              <SegmentedControl label="View" options={VIEWS} value={view} onChange={(v) => update({ view: v })} />
            </>
          }
        >
          {def.supportsDateRange ? (
            <DateRangePicker value={{ from: state.from, to: state.to }} onChange={(x) => update(x)} />
          ) : (
            <Input
              type="date"
              value={state.date}
              max={today}
              onChange={(e) => update({ date: e.target.value || today })}
              fullWidth={false}
              sx={{ height: 32, width: 'auto' }}
              aria-label="Date"
            />
          )}
          {periodLabel ? (
            <Box component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
              {periodLabel}
            </Box>
          ) : null}
        </FilterBar>
      </Card>

      {report.isError ? (
        <ErrorState error={report.error} onRetry={report.refetch} />
      ) : (
        <Stack spacing={2}>
          {showCharts ? (
            <>
              <KpiRow kpis={r?.summary?.kpis} loading={report.isLoading} />
              <ChartGrid charts={r?.summary?.charts} loading={report.isLoading} />
            </>
          ) : null}
          {showTable ? (
            <Card>
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 1.5,
                  px: 2.5,
                  py: 1.5,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Typography component="h2" variant="h3">
                  Detail
                </Typography>
                {r ? (
                  <Typography component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
                    {formatNumber(r.rows.length)} {r.rows.length === 1 ? 'row' : 'rows'}
                  </Typography>
                ) : null}
              </Box>
              <DataTable
                columns={columns}
                rows={r?.rows ?? []}
                rowKey={(_, i) => i}
                isLoading={report.isLoading}
                compact
                skeletonRows={12}
                empty={<EmptyState title="Nothing to report" description="No records fall in this period." compact />}
                footer={
                  r?.totals ? (
                    <TableRow>
                      {r.columns.map((c) => (
                        <TableCell
                          key={c.key}
                          align={c.align === 'right' ? 'right' : 'left'}
                          className={c.align === 'right' ? 'tabular' : undefined}
                        >
                          {r.totals[c.key] != null
                            ? typeof r.totals[c.key] === 'string'
                              ? r.totals[c.key]
                              : formatCell(r.totals[c.key], c)
                            : ''}
                        </TableCell>
                      ))}
                    </TableRow>
                  ) : null
                }
              />
            </Card>
          ) : null}
        </Stack>
      )}
    </Box>
  )
}
