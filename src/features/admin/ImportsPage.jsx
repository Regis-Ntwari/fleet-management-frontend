import { useState } from 'react'
import { useSearchParams } from 'react-router'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import { visuallyHidden } from '@mui/utils'
import UploadIcon from '@mui/icons-material/Upload'
import TableChartIcon from '@mui/icons-material/TableChart'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CancelIcon from '@mui/icons-material/Cancel'
import DownloadIcon from '@mui/icons-material/Download'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { SegmentedControl } from '@/components/ui/Tabs'
import { DataTable } from '@/components/ui/DataTable'
import { InlineAlert } from '@/components/ui/Feedback'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { parseCsv, downloadFile } from '@/utils/csv'
import { formatBytes, formatNumber } from '@/utils/format'

const TYPES = {
  vehicles: {
    label: 'Vehicles',
    permission: 'VEHICLE_CREATE',
    required: ['plateNumber', 'fleetNumber', 'make', 'model', 'year', 'category'],
    optional: [
      'fuelType',
      'transmission',
      'color',
      'odometerKm',
      'seatingCapacity',
      'vin',
      'engineNumber',
      'department',
      'purchaseDate',
      'acquisitionCost',
    ],
    sample:
      'plateNumber,fleetNumber,make,model,year,category,fuelType,transmission,color,odometerKm,seatingCapacity\nRAH 101 A,LMZ-101,Toyota,Land Cruiser Prado,2023,SUV,DIESEL,AUTOMATIC,White,15200,7\n',
  },
  drivers: {
    label: 'Drivers',
    permission: 'DRIVER_MANAGE',
    required: ['fullName', 'employeeNumber', 'phone', 'nationalId', 'licenseNumber', 'licenseExpiry'],
    optional: ['email', 'licenseCategory', 'licenseIssueDate', 'employmentStatus', 'joiningDate'],
    sample:
      'fullName,employeeNumber,phone,nationalId,licenseNumber,licenseExpiry,licenseCategory\nAline Mutesi,DRV-050,+250788123456,1199080012345678,RW123456,2028-05-31,"B, D"\n',
  },
  fuel: {
    label: 'Fuel transactions',
    permission: 'FUEL_MANAGE',
    required: ['plateNumber', 'transactedAt', 'litres', 'pricePerLitre', 'odometerKm', 'station'],
    optional: ['receiptNumber'],
    sample:
      'plateNumber,transactedAt,litres,pricePerLitre,odometerKm,station,receiptNumber\nRAD 123 A,2026-04-02T09:30,52.4,1720,120450,SP Kacyiru,R260402-1234\n',
  },
}

const mono = (t) => t.typography.fontFamilyMono

export default function ImportsPage() {
  const [search, setSearch] = useSearchParams()
  const { can } = useAuth()
  const allowed = Object.entries(TYPES).filter(([, t]) => can(t.permission))
  const type =
    search.get('type') && TYPES[search.get('type')] && can(TYPES[search.get('type')].permission) ? search.get('type') : allowed[0]?.[0]
  const def = TYPES[type]
  const [file, setFile] = useState(null)
  const [parsed, setParsed] = useState(null)
  const [parseError, setParseError] = useState(null)
  const [preview, setPreview] = useState(null)
  const [result, setResult] = useState(null)

  const run = useApiMutation({
    mutationFn: ({ dryRun }) => http.post(`/imports/${type}`, { rows: parsed.rows, dryRun }),
    invalidate: [['vehicles'], ['drivers'], ['fuel'], ['dashboard'], ['audit']],
  })

  const choose = async (f) => {
    setFile(f)
    setParsed(null)
    setParseError(null)
    setPreview(null)
    setResult(null)
    if (!f) return
    if (f.size > 5 * 1024 * 1024) return setParseError('Files must be 5 MB or smaller.')
    const text = await f.text()
    const out = parseCsv(text)
    if (!out.headers.length) return setParseError('The file is empty.')
    const missing = def.required.filter((h) => !out.headers.includes(h))
    if (missing.length) return setParseError(`Missing required column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}.`)
    setParsed(out)
  }

  const validate = async () => {
    try {
      setPreview(await run.mutateAsync({ dryRun: true }))
    } catch {
      /* toasted */
    }
  }
  const commit = async () => {
    try {
      setResult(await run.mutateAsync({ dryRun: false }))
      setPreview(null)
    } catch {
      /* toasted */
    }
  }
  const sample = () => downloadFile(def.sample, `${type}-template.csv`)

  if (!def) return <InlineAlert tone="warning">Your role cannot import data.</InlineAlert>
  const errorsTable = (r) => (
    <DataTable
      compact
      stickyHeader={false}
      rows={r.errors}
      rowKey={(e) => `${e.row}-${e.reason}`}
      columns={[
        { key: 'row', header: 'Row', width: 70, align: 'right' },
        { key: 'reason', header: 'Reason' },
      ]}
      empty={<Typography sx={{ px: 2, py: 2, fontSize: 13, color: 'text.muted' }}>No rejected rows.</Typography>}
    />
  )

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Import data"
        description="Load fuel transactions, vehicles or drivers from CSV exports of other platforms. Every row is validated; nothing invalid is accepted silently."
      />
      <SegmentedControl
        label="Import type"
        size="md"
        value={type}
        onChange={(v) => {
          setSearch({ type: v }, { replace: true })
          choose(null)
        }}
        options={allowed.map(([k, t]) => ({ value: k, label: t.label }))}
      />
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { lg: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { lg: 'span 2' } }}>
          <CardHeader
            title={`Upload ${def.label.toLowerCase()} CSV`}
            description="UTF-8, comma separated, first row = column names."
            actions={
              <Button size="xs" variant="ghost" icon={DownloadIcon} onClick={sample}>
                Template
              </Button>
            }
          />
          <CardBody sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Box
              component="label"
              sx={{
                display: 'flex',
                cursor: 'pointer',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '10px',
                border: '1px dashed',
                borderColor: 'edge.strong',
                px: 3,
                py: 5,
                textAlign: 'center',
                transition: 'background-color 150ms, color 150ms',
                '&:hover': { bgcolor: 'background.subtle' },
              }}
            >
              <UploadIcon sx={{ mb: 1, fontSize: 20, color: 'text.muted' }} aria-hidden />
              <Box component="span" sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>
                {file ? file.name : 'Choose a CSV file'}
              </Box>
              <Box component="span" sx={{ mt: 0.25, fontSize: 12.5, color: 'text.muted' }}>
                {file ? `${formatBytes(file.size)}${parsed ? ` · ${formatNumber(parsed.rows.length)} data rows` : ''}` : 'or drop it here'}
              </Box>
              <Box
                component="input"
                type="file"
                accept=".csv,text/csv"
                sx={visuallyHidden}
                onChange={(e) => choose(e.target.files?.[0] ?? null)}
              />
            </Box>
            {parseError ? <InlineAlert tone="danger">{parseError}</InlineAlert> : null}
            {parsed ? (
              <>
                <TableContainer className="scrollbar-thin" sx={{ borderRadius: 1, border: 1, borderColor: 'divider' }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {parsed.headers.map((h) => (
                          <TableCell key={h}>{h}</TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {parsed.rows.slice(0, 5).map((r, i) => (
                        <TableRow key={i}>
                          {parsed.headers.map((h) => (
                            <TableCell key={h} sx={{ whiteSpace: 'nowrap' }}>
                              {r[h] || (
                                <Box component="span" sx={{ color: 'text.faint' }}>
                                  —
                                </Box>
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                {parsed.rows.length > 5 ? (
                  <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
                    Showing the first 5 of {formatNumber(parsed.rows.length)} rows.
                  </Typography>
                ) : null}
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  <Button icon={TableChartIcon} onClick={validate} loading={run.isPending && run.variables?.dryRun}>
                    Validate only
                  </Button>
                  <Button
                    variant="primary"
                    icon={UploadIcon}
                    onClick={commit}
                    loading={run.isPending && run.variables?.dryRun === false}
                    disabled={!preview && !result}
                  >
                    Import {preview ? `${preview.imported} valid rows` : ''}
                  </Button>
                  {!preview && !result ? (
                    <Box component="span" sx={{ alignSelf: 'center', fontSize: 12.5, color: 'text.muted' }}>
                      Validate first to see what will be imported.
                    </Box>
                  ) : null}
                </Box>
              </>
            ) : null}
            {preview ? (
              <Stack spacing={1.5}>
                <StatGrid cols={3}>
                  <Stat label="Would import" value={preview.imported} tone="success" icon={CheckCircleIcon} />
                  <Stat label="Rejected" value={preview.rejected} tone={preview.rejected ? 'danger' : undefined} icon={CancelIcon} />
                  <Stat label="Duplicates" value={preview.duplicates} tone={preview.duplicates ? 'warning' : undefined} />
                </StatGrid>
                {errorsTable(preview)}
              </Stack>
            ) : null}
            {result ? (
              <Stack spacing={1.5}>
                <InlineAlert tone="success" title="Import complete">
                  {formatNumber(result.imported)} imported · {formatNumber(result.rejected)} rejected · {formatNumber(result.duplicates)}{' '}
                  duplicates skipped.
                </InlineAlert>
                {errorsTable(result)}
              </Stack>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Expected columns" compact />
          <CardBody sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 2, fontSize: 13 }}>
            <Box>
              <Typography sx={{ mb: 0.75, fontSize: 'inherit', fontWeight: 500, color: 'text.primary' }}>Required</Typography>
              <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0 }}>
                {def.required.map((c) => (
                  <Box
                    key={c}
                    component="li"
                    sx={{
                      borderRadius: '4px',
                      bgcolor: 'soft.accent.bg',
                      px: 0.75,
                      py: 0.25,
                      fontFamily: mono,
                      fontSize: 11.5,
                      color: 'soft.accent.fg',
                    }}
                  >
                    {c}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box>
              <Typography sx={{ mb: 0.75, fontSize: 'inherit', fontWeight: 500, color: 'text.primary' }}>Optional</Typography>
              <Box component="ul" sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, listStyle: 'none', m: 0, p: 0 }}>
                {def.optional.map((c) => (
                  <Box
                    key={c}
                    component="li"
                    sx={{
                      borderRadius: '4px',
                      bgcolor: 'background.muted',
                      px: 0.75,
                      py: 0.25,
                      fontFamily: mono,
                      fontSize: 11.5,
                      color: 'text.secondary',
                    }}
                  >
                    {c}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="ul" sx={{ listStyle: 'disc', m: 0, pl: 2, color: 'text.muted', '& > li + li': { mt: 0.5 } }}>
              <Box component="li">
                Dates as{' '}
                <Box component="code" sx={{ fontFamily: mono, fontSize: 12.5 }}>
                  YYYY-MM-DD
                </Box>
                ; timestamps as{' '}
                <Box component="code" sx={{ fontFamily: mono, fontSize: 12.5 }}>
                  YYYY-MM-DDTHH:mm
                </Box>
                .
              </Box>
              <Box component="li">Duplicates are detected by plate, employee/licence number, or receipt + station.</Box>
              <Box component="li">Rows with errors are rejected individually; valid rows still import.</Box>
            </Box>
          </CardBody>
        </Card>
      </Box>
    </Stack>
  )
}
