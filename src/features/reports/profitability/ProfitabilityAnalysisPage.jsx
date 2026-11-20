import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import { visuallyHidden } from '@mui/utils'
import UploadFileIcon from '@mui/icons-material/UploadFile'
import DownloadIcon from '@mui/icons-material/Download'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ErrorIcon from '@mui/icons-material/Error'
import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import PersonIcon from '@mui/icons-material/Person'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import RuleIcon from '@mui/icons-material/Rule'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable, Pagination } from '@/components/ui/DataTable'
import { Stat } from '@/components/ui/Stat'
import { Tabs } from '@/components/ui/Tabs'
import { Badge } from '@/components/ui/Badge'
import { SearchInput } from '@/components/ui/SearchInput'
import { Input, Select } from '@/components/ui/Field'
import { InlineAlert, Spinner } from '@/components/ui/Feedback'
import { downloadFile, toCsv } from '@/utils/csv'
import { formatBytes, formatCurrency, formatDate, formatNumber, pluralize } from '@/utils/format'
import { readWorkbook } from './xlsx'
import { FIELD_LABELS, STATUSES, parseWorkbook, reconcile, stripCode, summarize } from './analyze'
import { Money, StatusPill, VehicleDetailDialog } from './VehicleDetailDialog'
import { buildCharts } from './profitCharts'
import { ChartGrid } from '../ReportCharts'

const TABS = [
  { key: 'vehicles', label: 'Vehicles', icon: LocalShippingIcon },
  { key: 'drivers', label: 'Drivers & missions', icon: PersonIcon },
  { key: 'status', label: 'Deployment status', icon: FactCheckIcon },
  { key: 'checks', label: 'Data checks', icon: RuleIcon },
]
const PAGE_SIZE = 25

function sortRows(rows, sort) {
  if (!sort) return rows
  const [key, dir] = sort.split(',')
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => {
    const x = a[key]
    const y = b[key]
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return (typeof x === 'number' ? x - y : String(x).localeCompare(String(y))) * sign
  })
}

const matches = (q, ...values) =>
  !q ||
  values.some((v) =>
    String(v ?? '')
      .toLowerCase()
      .includes(q),
  )

export default function ProfitabilityAnalysisPage() {
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null)
  const [error, setError] = useState(null)
  const [reading, setReading] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [sheet, setSheet] = useState('all')
  const [tzsRate, setTzsRate] = useState('')
  const [tab, setTab] = useState('vehicles')

  const choose = async (f) => {
    if (!f) return
    setFile(f)
    setError(null)
    setWorkbook(null)
    setSheet('all')
    if (!/\.xlsx$/i.test(f.name)) {
      setError('Choose an Excel workbook saved as .xlsx. Older .xls files must be re-saved as .xlsx first.')
      return
    }
    setReading(true)
    try {
      const parsed = parseWorkbook(await readWorkbook(await f.arrayBuffer()))
      if (!parsed.sheets.length) throw new Error('No sheet in this workbook has the expected columns (DATE, VOUCHER TYPE, PLATE No …).')
      setWorkbook(parsed)
    } catch (e) {
      setError(e.message || 'The workbook could not be read.')
    } finally {
      setReading(false)
    }
  }

  const selected = useMemo(() => (workbook ? workbook.sheets.filter((s) => sheet === 'all' || s.name === sheet) : []), [workbook, sheet])
  const analysis = useMemo(() => (selected.length ? summarize(selected, { tzsRate: Number(tzsRate) || 0 }) : null), [selected, tzsRate])
  const charts = useMemo(
    () => (analysis ? buildCharts(selected, analysis, { tzsRate: Number(tzsRate) || 0 }) : []),
    [selected, analysis, tzsRate],
  )
  const period = useMemo(() => {
    const from = selected
      .map((s) => s.period.from)
      .filter(Boolean)
      .sort()[0]
    const to = selected
      .map((s) => s.period.to)
      .filter(Boolean)
      .sort()
      .at(-1)
    return from && to ? `${formatDate(from)} – ${formatDate(to)}` : null
  }, [selected])

  return (
    <Box>
      <PageHeader
        title="Profitability analysis"
        breadcrumbs={[{ label: 'Reports', to: '/reports' }, { label: 'Profitability analysis' }]}
        description="Drop in the monthly profitability workbook (trucks, Gorilland Safaris and Limoz SUV sheets). The file is read in your browser and never uploaded; you get per-vehicle, per-driver and deployment-status figures."
      />

      <Stack spacing={2.5}>
        <DropZone file={file} reading={reading} dragging={dragging} setDragging={setDragging} onFile={choose} compact={Boolean(workbook)} />
        {error ? (
          <InlineAlert tone="danger" title="Could not analyse this file">
            {error}
          </InlineAlert>
        ) : null}

        {workbook && analysis ? (
          <>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
              <Select
                value={sheet}
                onChange={(e) => setSheet(e.target.value || 'all')}
                compact
                searchable={false}
                aria-label="Worksheet"
                sx={{ width: { xs: '100%', sm: 260 } }}
              >
                <option value="all">All sheets (combined)</option>
                {workbook.sheets.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.label}
                  </option>
                ))}
              </Select>
              {period ? (
                <Typography sx={{ fontSize: 13, color: 'text.muted' }}>
                  Period{' '}
                  <Box component="span" sx={{ color: 'text.primary', fontWeight: 500 }}>
                    {period}
                  </Box>
                </Typography>
              ) : null}
            </Box>

            <Summary totals={analysis.totals} />

            <Box component="section" aria-label="Insights">
              <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 1, mb: 1.5 }}>
                <Typography component="h2" sx={{ fontSize: 15, fontWeight: 600 }}>
                  Insights
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
                  Hover a chart for exact figures; the tables below have every row.
                </Typography>
              </Box>
              <ChartGrid charts={charts} />
            </Box>

            {analysis.hasTzs && !(Number(tzsRate) > 0) ? (
              <InlineAlert tone="warning" title="Fuel paid in Tanzanian shillings is not counted yet">
                {formatNumber(analysis.tzsUnconverted)} TZS of fuel needs an exchange rate before it can be added to costs. Set it under
                Data checks.
              </InlineAlert>
            ) : null}

            <Card>
              <Box sx={{ px: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                  tabs={TABS.map((t) => ({
                    ...t,
                    count:
                      t.key === 'vehicles'
                        ? analysis.vehicles.length
                        : t.key === 'drivers'
                          ? analysis.drivers.length
                          : t.key === 'status'
                            ? analysis.status.totals.total
                            : undefined,
                  }))}
                  value={tab}
                  onChange={setTab}
                />
              </Box>
              {tab === 'vehicles' ? <VehiclesTab analysis={analysis} /> : null}
              {tab === 'drivers' ? <DriversTab analysis={analysis} /> : null}
              {tab === 'status' ? <StatusTab analysis={analysis} /> : null}
              {tab === 'checks' ? (
                <ChecksTab workbook={workbook} sheets={selected} analysis={analysis} tzsRate={tzsRate} setTzsRate={setTzsRate} />
              ) : null}
            </Card>
          </>
        ) : null}
      </Stack>
    </Box>
  )
}

/* ---------- Upload ---------- */

function DropZone({ file, reading, dragging, setDragging, onFile, compact }) {
  return (
    <Box
      component="label"
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        onFile(e.dataTransfer.files?.[0])
      }}
      sx={{
        display: 'flex',
        flexDirection: compact ? 'row' : 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: compact ? 1.5 : 0.5,
        cursor: 'pointer',
        borderRadius: '10px',
        border: '1px dashed',
        borderColor: dragging ? 'primary.main' : 'edge.strong',
        bgcolor: dragging ? 'soft.accent.bg' : 'background.paper',
        px: 3,
        py: compact ? 1.5 : 6,
        textAlign: 'center',
        transition: 'background-color 150ms, border-color 150ms',
        '&:hover': { bgcolor: dragging ? 'soft.accent.bg' : 'background.subtle' },
      }}
    >
      {reading ? (
        <Spinner size="sm" label="Reading workbook" />
      ) : (
        <UploadFileIcon sx={{ fontSize: compact ? 20 : 28, color: 'text.muted' }} aria-hidden />
      )}
      <Box sx={{ minWidth: 0, textAlign: compact ? 'left' : 'center' }}>
        <Box component="span" sx={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'text.primary', overflowWrap: 'anywhere' }}>
          {reading ? 'Reading workbook…' : file ? file.name : 'Choose the profitability workbook (.xlsx)'}
        </Box>
        <Box component="span" sx={{ display: 'block', mt: 0.25, fontSize: 12.5, color: 'text.muted' }}>
          {file ? `${formatBytes(file.size)} · click or drop another file to replace it` : 'or drag and drop it here'}
        </Box>
      </Box>
      <Box
        component="input"
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        sx={visuallyHidden}
        onChange={(e) => {
          onFile(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </Box>
  )
}

/* ---------- Summary tiles ---------- */

const TILE_GRID = {
  display: 'grid',
  gap: 1.5,
  gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(5, minmax(0, 1fr))' },
  '& > *': { minWidth: 0 },
}

function Summary({ totals }) {
  const money = (v) => formatCurrency(v, { compact: true })
  return (
    <Box sx={TILE_GRID}>
      <Stat label="Revenue" value={money(totals.revenue)} hint="institution / sales amount" />
      <Stat
        label="Net profit"
        value={money(totals.profit)}
        tone={totals.profit < 0 ? 'danger' : 'success'}
        hint={totals.margin != null ? `${formatNumber(totals.margin, 1)}% margin` : undefined}
      />
      <Stat label="Vehicles" value={totals.vehicles} hint="distinct plates" />
      <Stat label="Deployments" value={totals.deployments} />
      <Stat label="Operating days" value={totals.days} hint="excl. cancelled" />
      <Stat label="Owner payments" value={money(totals.ownersAmount)} hint="to subcontractors" />
      <Stat label="Driver missions" value={money(totals.mission)} />
      <Stat label="Fuel" value={money(totals.fuel)} />
      <Stat label="Repair & maint." value={money(totals.repair)} />
    </Box>
  )
}

/* ---------- Shared bits ---------- */

function TabToolbar({ search, onSearch, placeholder, onExport, children }) {
  return (
    <Box
      sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}
    >
      {onSearch ? (
        <SearchInput value={search} onChange={onSearch} placeholder={placeholder} sx={{ width: { xs: '100%', sm: 300 } }} />
      ) : null}
      <Box sx={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'text.muted' }}>{children}</Box>
      {onExport ? (
        <Button size="sm" icon={DownloadIcon} onClick={onExport}>
          CSV
        </Button>
      ) : null}
    </Box>
  )
}

function usePaged(rows, deps) {
  const [page, setPage] = useState(0)
  const [prev, setPrev] = useState(deps)
  if (prev !== deps) {
    setPrev(deps)
    setPage(0)
  }
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const current = Math.min(page, totalPages - 1)
  return {
    rows: rows.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE),
    pagination:
      rows.length > PAGE_SIZE ? (
        <Pagination page={current} size={PAGE_SIZE} totalElements={rows.length} totalPages={totalPages} onPageChange={setPage} />
      ) : null,
  }
}

const money = (key, header, extra = {}) => ({
  key,
  header,
  sortKey: key,
  align: 'right',
  render: (r) => <Money value={r[key]} />,
  ...extra,
})

/* ---------- Vehicles ---------- */

const VEHICLE_EXPORT = [
  { key: 'plate', label: 'Plate number' },
  { key: 'sheetNames', label: 'Sheet' },
  { key: 'ownerName', label: 'Owner' },
  { key: 'ownerType', label: 'Owner type' },
  { key: 'voucherTypeCount', label: 'Voucher types (count)' },
  { key: 'voucherTypeList', label: 'Voucher types' },
  { key: 'deployments', label: 'Deployments' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'days', label: 'Operating days' },
  { key: 'driverList', label: 'Drivers' },
  { key: 'revenue', label: 'Revenue (RWF)' },
  { key: 'ownersAmount', label: 'Owners amount (RWF)' },
  { key: 'ownersAmountGsl2', label: 'Owners amount – GSL 2 (RWF)' },
  { key: 'mission', label: 'Mission (RWF)' },
  { key: 'fuel', label: 'Fuel (RWF)' },
  { key: 'repair', label: 'Repair & maintenance (RWF)' },
  { key: 'profit', label: 'Profit (RWF)' },
  { key: 'margin', label: 'Margin (%)' },
]

function VehiclesTab({ analysis }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('revenue,desc')
  const [open, setOpen] = useState(null)
  const q = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      sortRows(
        analysis.vehicles.filter((v) => matches(q, v.plate, v.plateKey, v.ownerName, ...v.drivers)),
        sort,
      ),
    [analysis.vehicles, q, sort],
  )
  const paged = usePaged(rows, `${q}|${sort}|${analysis.vehicles.length}`)

  const columns = [
    {
      key: 'plate',
      header: 'Plate',
      sortKey: 'plateKey',
      render: (v) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Box sx={{ fontWeight: 600, color: 'text.primary' }}>{v.plate}</Box>
          {v.vehicleType ? <Box sx={{ fontSize: 11.5, color: 'text.muted' }}>{v.vehicleType}</Box> : null}
        </Box>
      ),
    },
    {
      key: 'owner',
      header: 'Owner',
      sortKey: 'ownerName',
      render: (v) =>
        v.ownerName ? (
          <Box sx={{ minWidth: 140 }}>
            <Box sx={{ fontSize: 13 }}>{v.ownerName}</Box>
            {v.ownerType === 'subcontractor' ? (
              <Badge tone="info" size="sm" sx={{ mt: 0.25 }}>
                Subcontractor
              </Badge>
            ) : null}
          </Box>
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            Not recorded
          </Box>
        ),
    },
    {
      key: 'voucherTypeCount',
      header: 'Voucher types',
      sortKey: 'voucherTypeCount',
      align: 'right',
      render: (v) => (
        <Box component="span" title={v.voucherTypes.map((t) => `${t.name} (${t.count})`).join('\n')}>
          {v.voucherTypeCount}
        </Box>
      ),
    },
    { key: 'deployments', header: 'Deploy­ments', sortKey: 'deployments', align: 'right', render: (v) => formatNumber(v.deployments) },
    {
      key: 'days',
      header: 'Days',
      sortKey: 'days',
      align: 'right',
      render: (v) => (
        <Box component="span" title={v.daysEstimated ? 'No day count in this sheet: counted as distinct deployment dates.' : undefined}>
          {formatNumber(v.days, 1)}
          {v.daysEstimated ? '*' : ''}
        </Box>
      ),
    },
    money('revenue', 'Revenue'),
    money('ownersAmount', 'Owner payments'),
    money('mission', 'Mission'),
    money('fuel', 'Fuel'),
    money('repair', 'Repair & maint.'),
    money('profit', 'Profit', { render: (v) => <Money value={v.profit} signed /> }),
    {
      key: 'margin',
      header: 'Margin',
      sortKey: 'margin',
      align: 'right',
      render: (v) => (v.margin == null ? <Faint /> : `${formatNumber(v.margin, 1)}%`),
    },
  ]

  const exportCsv = () =>
    downloadFile(
      toCsv(
        VEHICLE_EXPORT,
        rows.map((v) => ({
          ...v,
          sheetNames: v.sheets.join('; '),
          voucherTypeList: v.voucherTypes.map((t) => `${t.name} (${t.count})`).join('; '),
          driverList: v.drivers.join('; '),
          margin: v.margin == null ? '' : v.margin.toFixed(1),
        })),
      ),
      'vehicle-profitability.csv',
    )

  return (
    <>
      <TabToolbar search={search} onSearch={setSearch} placeholder="Search plate, owner or driver" onExport={exportCsv}>
        Amounts in RWF. Click a vehicle to see who drove it on each date.
      </TabToolbar>
      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(v) => v.plateKey}
        sort={sort}
        onSortChange={(s) => setSort(s ?? 'revenue,desc')}
        onRowClick={setOpen}
        compact
        stickyHeader={false}
      />
      {paged.pagination}
      {analysis.vehicles.some((v) => v.daysEstimated) ? (
        <Typography sx={{ px: 2, py: 1.25, fontSize: 12, color: 'text.muted', borderTop: 1, borderColor: 'divider' }}>
          * The truck sheet has no “number of day” column, so its days are the distinct dates the truck was deployed.
        </Typography>
      ) : null}
      <VehicleDetailDialog vehicle={open} onClose={() => setOpen(null)} />
    </>
  )
}

/* ---------- Drivers ---------- */

function DriversTab({ analysis }) {
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('mission,desc')
  const q = search.trim().toLowerCase()
  const rows = useMemo(
    () =>
      sortRows(
        analysis.drivers.filter((d) => matches(q, d.name, ...d.vehicles)),
        sort,
      ),
    [analysis.drivers, q, sort],
  )
  const paged = usePaged(rows, `${q}|${sort}|${analysis.drivers.length}`)
  const totalMission = analysis.drivers.reduce((s, d) => s + d.mission, 0)

  const columns = [
    {
      key: 'name',
      header: 'Driver',
      sortKey: 'name',
      render: (d) => (
        <Box sx={{ fontWeight: 500, color: d.name === 'Not recorded' ? 'text.muted' : 'text.primary', minWidth: 160 }}>{d.name}</Box>
      ),
    },
    { key: 'deployments', header: 'Deployments', sortKey: 'deployments', align: 'right', render: (d) => formatNumber(d.deployments) },
    { key: 'days', header: 'Days', sortKey: 'days', align: 'right', render: (d) => (d.days ? formatNumber(d.days, 1) : <Faint />) },
    money('mission', 'Mission total'),
    {
      key: 'vehicles',
      header: 'Vehicles driven',
      render: (d) => (
        <Box sx={{ fontSize: 12.5, color: 'text.muted', minWidth: 140 }}>
          {d.vehicles.slice(0, 3).join(', ')}
          {d.vehicles.length > 3 ? ` +${d.vehicles.length - 3}` : ''}
        </Box>
      ),
    },
    {
      key: 'first',
      header: 'Dates',
      sortKey: 'first',
      render: (d) =>
        d.first ? (
          <Box component="span" sx={{ whiteSpace: 'nowrap', fontSize: 12.5 }}>
            {d.first === d.last ? formatDate(d.first) : `${formatDate(d.first)} – ${formatDate(d.last)}`}
          </Box>
        ) : (
          <Faint />
        ),
    },
  ]

  const exportCsv = () =>
    downloadFile(
      toCsv(
        [
          { key: 'name', label: 'Driver' },
          { key: 'deployments', label: 'Deployments' },
          { key: 'days', label: 'Days' },
          { key: 'mission', label: 'Mission (RWF)' },
          { key: 'vehicleList', label: 'Vehicles' },
          { key: 'first', label: 'First date' },
          { key: 'last', label: 'Last date' },
        ],
        rows.map((d) => ({ ...d, vehicleList: d.vehicles.join('; ') })),
      ),
      'driver-missions.csv',
    )

  return (
    <>
      <TabToolbar search={search} onSearch={setSearch} placeholder="Search driver or plate" onExport={exportCsv}>
        Mission paid across all drivers:{' '}
        <Box component="span" sx={{ color: 'text.primary', fontWeight: 600 }}>
          {formatCurrency(totalMission)}
        </Box>
      </TabToolbar>
      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(d) => d.key}
        sort={sort}
        onSortChange={(s) => setSort(s ?? 'mission,desc')}
        compact
        stickyHeader={false}
      />
      {paged.pagination}
    </>
  )
}

/* ---------- Deployment status ---------- */

function StatusTab({ analysis }) {
  const { rows, totals } = analysis.status
  const shown = STATUSES.filter((s) => totals[s.key] > 0)
  const columns = [
    { key: 'voucher', header: 'Voucher type', render: (r) => <Box sx={{ fontWeight: 500, minWidth: 180 }}>{r.voucher}</Box> },
    ...shown.map((s) => ({
      key: s.key,
      header: s.label,
      align: 'right',
      render: (r) => (r[s.key] ? formatNumber(r[s.key]) : <Faint />),
    })),
    { key: 'total', header: 'Total', align: 'right', render: (r) => <strong>{formatNumber(r.total)}</strong> },
  ]
  const footer = (
    <TableRow>
      <TableCell sx={{ fontWeight: 600 }}>All voucher types</TableCell>
      {shown.map((s) => (
        <TableCell key={s.key} align="right" className="tabular" sx={{ fontWeight: 600 }}>
          {formatNumber(totals[s.key])}
        </TableCell>
      ))}
      <TableCell align="right" className="tabular" sx={{ fontWeight: 600 }}>
        {formatNumber(totals.total)}
      </TableCell>
    </TableRow>
  )

  return (
    <CardBody flush>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, px: 2, py: 1.5, borderBottom: 1, borderColor: 'divider' }}>
        {shown.map((s) => (
          <StatusPill key={s.key} status={s.key} count={totals[s.key]} />
        ))}
      </Box>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.voucher} footer={footer} compact stickyHeader={false} />

      <Box sx={{ borderTop: 1, borderColor: 'divider' }}>
        <CardHeader
          compact
          title={`Still out: ${pluralize(analysis.ongoing.length, 'deployment')} not returned`}
          description="Days out are counted up to the end of the report period."
        />
        <DataTable
          compact
          stickyHeader={false}
          rows={analysis.ongoing}
          rowKey={(r, i) => `${r.plateKey}-${r.date}-${i}`}
          empty={<Typography sx={{ p: 2, fontSize: 13, color: 'text.muted' }}>Every deployment in this selection has returned.</Typography>}
          columns={[
            { key: 'plate', header: 'Plate', render: (r) => <Box sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{r.plate}</Box> },
            { key: 'driver', header: 'Driver', render: (r) => r.driver || <Faint /> },
            { key: 'owner', header: 'Owner', render: (r) => (r.owner ? stripCode(r.owner) : <Faint />) },
            { key: 'voucher', header: 'Voucher type' },
            { key: 'date', header: 'Deployed', render: (r) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.date)}</Box> },
            { key: 'days', header: 'Days booked', align: 'right', render: (r) => (r.days ? formatNumber(r.days, 1) : <Faint />) },
            {
              key: 'daysSince',
              header: 'Days out',
              align: 'right',
              render: (r) => (r.daysSince == null ? <Faint /> : formatNumber(r.daysSince)),
            },
          ]}
        />
      </Box>
    </CardBody>
  )
}

/* ---------- Data checks ---------- */

function ChecksTab({ workbook, sheets, analysis, tzsRate, setTzsRate }) {
  const merged = analysis.vehicles.filter((v) => v.spellings.length > 1)
  return (
    <CardBody sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
      <Typography sx={{ fontSize: 13, color: 'text.muted' }}>
        Each sheet’s own TOTAL row is compared with the sum of the rows read, so you can trust the figures above.
      </Typography>
      {sheets.map((s) => {
        const lines = reconcile(s)
        return (
          <Box key={s.name} sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', overflow: 'hidden' }}>
            <Box sx={{ px: 2, py: 1.25, bgcolor: 'background.subtle', borderBottom: 1, borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 13.5, fontWeight: 600 }}>{s.label}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
                Sheet “{s.name}” · {pluralize(s.records.length, 'row')} read
                {s.period.from ? ` · ${formatDate(s.period.from)} – ${formatDate(s.period.to)}` : ''}
              </Typography>
            </Box>
            <Stack spacing={0.75} sx={{ px: 2, py: 1.5 }}>
              {lines.length ? (
                lines.map((l) => (
                  <Box key={l.field} sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 13, flexWrap: 'wrap' }}>
                    {l.ok ? (
                      <CheckCircleIcon sx={{ fontSize: 16, color: 'success.main' }} aria-label="Matches" />
                    ) : (
                      <ErrorIcon sx={{ fontSize: 16, color: 'error.main' }} aria-label="Does not match" />
                    )}
                    <Box sx={{ flex: 1, minWidth: 160 }}>{FIELD_LABELS[l.field]}</Box>
                    <Box className="tabular">{formatNumber(l.computed, 2)}</Box>
                    {!l.ok ? (
                      <Box className="tabular" sx={{ color: 'soft.danger.fg' }}>
                        sheet total {formatNumber(l.sheet, 2)}
                      </Box>
                    ) : null}
                  </Box>
                ))
              ) : (
                <Typography sx={{ fontSize: 13, color: 'text.muted' }}>This sheet has no TOTAL row to compare with.</Typography>
              )}
              {s.missing.length ? <InlineAlert tone="warning">Columns not found: {s.missing.join(', ')}.</InlineAlert> : null}
              {s.issues.map((i) => (
                <Typography key={i.row} sx={{ fontSize: 12.5, color: 'soft.warning.fg' }}>
                  Row {i.row}: {i.message}
                </Typography>
              ))}
            </Stack>
          </Box>
        )
      })}

      {analysis.hasTzs ? (
        <Box sx={{ maxWidth: 360 }}>
          <Typography component="label" htmlFor="tzs-rate" sx={{ display: 'block', fontSize: 13, fontWeight: 500, mb: 0.5 }}>
            Exchange rate for fuel paid in TZS
          </Typography>
          <Input
            id="tzs-rate"
            type="number"
            inputProps={{ min: 0, step: 'any' }}
            value={tzsRate}
            onChange={(e) => setTzsRate(e.target.value)}
            trailing="RWF per 1 TZS"
            placeholder="e.g. 0.55"
          />
        </Box>
      ) : null}

      {merged.length ? (
        <Box>
          <Typography sx={{ fontSize: 13.5, fontWeight: 600, mb: 0.5 }}>Plate numbers written in more than one way</Typography>
          <Typography sx={{ fontSize: 12.5, color: 'text.muted', mb: 1 }}>
            These spellings were treated as the same vehicle (spaces ignored).
          </Typography>
          <Stack spacing={0.5}>
            {merged.map((v) => (
              <Typography key={v.plateKey} sx={{ fontSize: 12.5 }}>
                <strong>{v.plate}</strong>: {v.spellings.map((s) => `“${s}”`).join(', ')}
              </Typography>
            ))}
          </Stack>
        </Box>
      ) : null}

      {workbook.skipped.length ? (
        <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
          Sheets ignored (no recognisable columns): {workbook.skipped.join(', ')}.
        </Typography>
      ) : null}
    </CardBody>
  )
}

function Faint() {
  return (
    <Box component="span" sx={{ color: 'text.faint' }}>
      —
    </Box>
  )
}
