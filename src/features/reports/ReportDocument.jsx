import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { ChartLegend } from '@/components/ui/charts'
import { formatCell } from '@/utils/csv'
import { formatDate, formatDateTime, formatNumber } from '@/utils/format'
import { KpiRow, ReportChart } from './ReportCharts'
import { legendItems } from './chartSpec'

/** Fixed layout widths so charts are deterministic on screen and on paper (A4 minus margins ≈ 703px). */
export const DOCUMENT_WIDTH = 690
const GAP = 16
const PAD = 12
const COL = (DOCUMENT_WIDTH - GAP) / 2

const STATUS_TONE = {
  AVAILABLE: 'success',
  COMPLETED: 'success',
  VALID: 'success',
  OK: 'success',
  PREVENTIVE: 'success',
  IN_MAINTENANCE: 'warning',
  WAITING_FOR_PARTS: 'warning',
  DUE_SOON: 'warning',
  EXPIRING_SOON: 'warning',
  HIGH: 'warning',
  UNDER_INVESTIGATION: 'warning',
  CORRECTIVE: 'warning',
  OUT_OF_SERVICE: 'danger',
  CANCELLED: 'danger',
  OVERDUE: 'danger',
  EXPIRED: 'danger',
  CRITICAL: 'danger',
  OPEN: 'danger',
  ACCIDENT: 'danger',
  THEFT: 'danger',
  SUSPENDED: 'danger',
}
const DOT = { success: 'success.main', warning: 'warning.main', danger: 'error.main' }

function BrandMark() {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
      <Box
        component="span"
        sx={{
          display: 'flex',
          width: 34,
          height: 34,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 1,
          bgcolor: 'primary.main',
          color: '#fff',
          flexShrink: 0,
        }}
        aria-hidden
      >
        <svg
          viewBox="0 0 24 24"
          width="20"
          height="20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 15h2.5a2.5 2.5 0 0 0 5 0h3a2.5 2.5 0 0 0 5 0H21v-3.3l-2.6-.9-1.6-2.8H3z" />
        </svg>
      </Box>
      <Box sx={{ lineHeight: 1.2 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>LIMOZ Fleet</Typography>
        <Typography sx={{ fontSize: 11, color: 'text.muted' }}>LIMOZ Rwanda Ltd · Fleet Operations</Typography>
      </Box>
    </Stack>
  )
}

function Meta({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'text.muted' }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 12.5, fontWeight: 500 }} noWrap>
        {children}
      </Typography>
    </Box>
  )
}

function SectionTitle({ index, children }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: 'baseline', mb: 1.5, mt: 3.5 }} className="avoid-break">
      <Typography component="span" className="tabular" sx={{ fontSize: 11, fontWeight: 600, color: 'primary.main' }}>
        {String(index).padStart(2, '0')}
      </Typography>
      <Typography component="h2" sx={{ fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em' }}>
        {children}
      </Typography>
      <Box sx={{ flex: 1, height: '1px', bgcolor: 'divider', alignSelf: 'center' }} aria-hidden />
    </Stack>
  )
}

function StatusCell({ value }) {
  const tone = STATUS_TONE[value]
  return (
    <Stack component="span" direction="row" spacing={0.75} sx={{ alignItems: 'center', display: 'inline-flex' }}>
      {tone ? (
        <Box component="span" sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: DOT[tone], flexShrink: 0 }} aria-hidden />
      ) : null}
      <span>{formatCell(value, { format: 'status' })}</span>
    </Stack>
  )
}

/**
 * The printable report: what the server's PDF renderer should produce from the
 * same `/reports/{key}` payload. Rendered inside a forced light scheme so it
 * prints white regardless of the app theme.
 */
export function ReportDocument({ def, report, user, className }) {
  const r = report
  const period = def.supportsDateRange ? `${formatDate(r.from)} – ${formatDate(r.to)}` : formatDate(r.date)
  const preparedBy = user?.name ?? (user?.firstName ? `${user.firstName} ${user.lastName ?? ''}`.trim() : 'FleetOps')
  const charts = r.summary?.charts ?? []
  const kpis = r.summary?.kpis ?? []
  const right = (c) => c.align === 'right'
  // Identifiers, plates and dates must not wrap inside narrow table cells.
  const nowrap = (c, i) => i === 0 || c.format === 'date' || c.format === 'datetime' || right(c)

  return (
    <Box
      className={['report-document', 'light', className].filter(Boolean).join(' ')}
      sx={{
        width: DOCUMENT_WIDTH,
        color: 'text.primary',
        bgcolor: '#fff',
        fontSize: 12.5,
        lineHeight: 1.45,
        fontFamily: 'inherit',
        '& *': { boxSizing: 'border-box' },
      }}
    >
      {/* Masthead */}
      <Stack
        direction="row"
        sx={{ alignItems: 'flex-start', justifyContent: 'space-between', pb: 2, borderBottom: 2, borderColor: 'primary.main' }}
      >
        <BrandMark />
        <Box sx={{ textAlign: 'right', lineHeight: 1.3 }}>
          <Typography sx={{ fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'text.muted' }}>
            {def.group} report
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: 'text.secondary' }}>Generated {formatDateTime(r.generatedAt)}</Typography>
        </Box>
      </Stack>

      {/* Title block */}
      <Box sx={{ pt: 3 }}>
        <Typography component="h1" sx={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.15 }}>
          {def.name}
        </Typography>
        <Typography sx={{ mt: 0.75, maxWidth: 560, fontSize: 13, color: 'text.secondary' }}>{def.description}</Typography>
        <Box
          sx={{
            mt: 2.5,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gap: 2,
            p: 1.75,
            borderRadius: '8px',
            bgcolor: 'background.subtle',
            border: 1,
            borderColor: 'divider',
          }}
        >
          <Meta label={def.supportsDateRange ? 'Period' : 'Date'}>{period}</Meta>
          <Meta label="Records">{formatNumber(r.rows.length)}</Meta>
          <Meta label="Prepared by">{preparedBy}</Meta>
          <Meta label="Source">Live operational data</Meta>
        </Box>
      </Box>

      {/* Summary */}
      {kpis.length ? (
        <>
          <SectionTitle index={1}>At a glance</SectionTitle>
          <KpiRow kpis={kpis} dense />
        </>
      ) : null}

      {/* Charts */}
      {charts.length ? (
        <>
          <SectionTitle index={kpis.length ? 2 : 1}>Charts</SectionTitle>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: `${GAP}px` }}>
            {charts.map((c) => {
              const w = (c.span === 2 ? DOCUMENT_WIDTH : COL) - PAD * 2
              return (
                <Box
                  key={c.key}
                  className="avoid-break"
                  sx={{
                    gridColumn: c.span === 2 ? 'span 2' : undefined,
                    p: `${PAD}px`,
                    border: 1,
                    borderColor: 'divider',
                    borderRadius: '8px',
                    minWidth: 0,
                  }}
                >
                  <Typography component="h3" sx={{ fontSize: 12.5, fontWeight: 600 }}>
                    {c.title}
                  </Typography>
                  {c.subtitle ? <Typography sx={{ fontSize: 11, color: 'text.muted' }}>{c.subtitle}</Typography> : null}
                  {c.series.length > 1 && c.type !== 'donut' ? <ChartLegend items={legendItems(c)} sx={{ mt: 1, fontSize: 11 }} /> : null}
                  <Box sx={{ mt: 1 }}>
                    <ReportChart chart={c} width={w} dense />
                  </Box>
                </Box>
              )
            })}
          </Box>
        </>
      ) : null}

      {/* Detail table */}
      <SectionTitle index={(kpis.length ? 1 : 0) + (charts.length ? 1 : 0) + 1}>Detail</SectionTitle>
      {r.rows.length ? (
        <Box
          component="table"
          sx={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 11,
            '& th': {
              textAlign: 'left',
              fontSize: 10,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: 'text.muted',
              px: 0.75,
              py: 0.75,
              borderBottom: '1.5px solid',
              borderColor: 'text.primary',
              whiteSpace: 'nowrap',
              verticalAlign: 'bottom',
            },
            '& td': { px: 0.75, py: 0.6, borderBottom: 1, borderColor: 'divider', verticalAlign: 'top' },
            '& tbody tr:nth-of-type(even) td': { bgcolor: 'background.subtle' },
            '& tfoot td': {
              fontWeight: 600,
              borderTop: '1.5px solid',
              borderBottom: 0,
              borderColor: 'text.primary',
              bgcolor: 'transparent',
            },
          }}
        >
          <thead>
            <tr>
              {r.columns.map((c) => (
                <th key={c.key} style={right(c) ? { textAlign: 'right' } : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.rows.map((row, i) => (
              <tr key={i}>
                {r.columns.map((c, ci) => (
                  <td
                    key={c.key}
                    className={right(c) ? 'tabular' : undefined}
                    style={{ textAlign: right(c) ? 'right' : undefined, whiteSpace: nowrap(c, ci) ? 'nowrap' : undefined }}
                  >
                    {c.format === 'status' ? <StatusCell value={row[c.key]} /> : formatCell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {r.totals ? (
            <tfoot>
              <tr>
                {r.columns.map((c) => (
                  <td key={c.key} className={right(c) ? 'tabular' : undefined} style={right(c) ? { textAlign: 'right' } : undefined}>
                    {r.totals[c.key] != null
                      ? typeof r.totals[c.key] === 'string'
                        ? r.totals[c.key]
                        : formatCell(r.totals[c.key], c)
                      : ''}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </Box>
      ) : (
        <Typography sx={{ py: 3, textAlign: 'center', fontSize: 12.5, color: 'text.muted' }}>No records fall in this period.</Typography>
      )}

      {/* Notes */}
      <Box sx={{ mt: 3.5, pt: 1.5, borderTop: 1, borderColor: 'divider', fontSize: 10.5, color: 'text.muted' }} className="avoid-break">
        <Typography sx={{ fontSize: 'inherit', color: 'inherit' }}>
          Figures are computed from records held in the Fleet Operations Management System at the time of generation. Currency amounts are
          in Rwandan francs (RWF); distances in kilometres; times in Africa/Kigali. This document is confidential and intended for LIMOZ
          Rwanda Ltd management and authorised partners.
        </Typography>
      </Box>

      <Stack
        className="report-footer"
        direction="row"
        sx={{ mt: 2, justifyContent: 'space-between', fontSize: 10, color: 'text.muted', bgcolor: '#fff', py: 0.75 }}
      >
        <span>LIMOZ Rwanda Ltd · {def.name}</span>
        <span>
          {period} · Generated {formatDateTime(r.generatedAt)} by {preparedBy}
        </span>
      </Stack>
    </Box>
  )
}
