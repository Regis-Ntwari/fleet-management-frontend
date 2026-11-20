import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Dialog } from '@/components/ui/Dialog'
import { DataTable } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { DescriptionList } from '@/components/ui/Display'
import { formatCurrency, formatDate, formatNumber } from '@/utils/format'
import { STATUSES } from './analyze'

const STATUS_BY_KEY = Object.fromEntries(STATUSES.map((s) => [s.key, s]))

/** RWF amount for tables: blank when zero, red when negative (with `signed`). */
export function Money({ value, signed = false }) {
  if (!value)
    return (
      <Box component="span" sx={{ color: 'text.faint' }}>
        —
      </Box>
    )
  return (
    <Box
      component="span"
      className="tabular"
      sx={{ whiteSpace: 'nowrap', fontWeight: signed ? 600 : 400, color: signed && value < 0 ? 'soft.danger.fg' : undefined }}
    >
      {formatNumber(Math.round(value))}
    </Box>
  )
}

export function StatusPill({ status, count, label }) {
  const s = STATUS_BY_KEY[status] ?? STATUS_BY_KEY.other
  return (
    <Badge tone={s.tone} dot size="sm">
      {label ?? s.label}
      {count != null ? ` · ${formatNumber(count)}` : ''}
    </Badge>
  )
}

function Section({ title, children }) {
  return (
    <Box component="section">
      <Typography
        component="h3"
        sx={{ mb: 1, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.muted' }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  )
}

export function VehicleDetailDialog({ vehicle: v, onClose }) {
  if (!v) return null
  const breakdown = [
    { label: 'Revenue', value: v.revenue, sign: '' },
    { label: 'Owner payments', value: -v.ownersAmount },
    { label: 'Driver missions', value: -v.mission },
    { label: 'Fuel', value: -v.fuel },
    { label: 'Repair & maintenance', value: -v.repair },
  ]
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={v.plate}
      description={[v.vehicleType, v.ownerName, v.sheets.join(', ')].filter(Boolean).join(' · ')}
    >
      <Stack spacing={3}>
        <DescriptionList
          columns={3}
          items={[
            {
              label: 'Owner',
              value: v.owners.length ? v.owners.map((o) => o.label).join(', ') : null,
            },
            {
              label: 'Owner type',
              value: v.ownerType === 'unknown' ? null : v.ownerType === 'company' ? 'Company-owned' : 'Subcontractor',
            },
            { label: 'Deployments', value: `${formatNumber(v.deployments)}${v.cancelled ? ` (${v.cancelled} cancelled)` : ''}` },
            { label: 'Days operated', value: `${formatNumber(v.days, 1)}${v.daysEstimated ? ' (distinct dates)' : ''}` },
            { label: 'Drivers', value: v.drivers.length ? v.drivers.join(', ') : null, span: 2 },
          ]}
        />

        <Section title={`Voucher types (${v.voucherTypeCount})`}>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
            {v.voucherTypes.map((t) => (
              <Badge key={t.name} size="sm">
                {t.name} · {t.count}
              </Badge>
            ))}
          </Box>
        </Section>

        <Section title="Profit">
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', maxWidth: 420 }}>
            {breakdown.map((b) => (
              <Box
                key={b.label}
                sx={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  px: 1.5,
                  py: 0.75,
                  fontSize: 13,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <span>{b.label}</span>
                <Box component="span" className="tabular" sx={{ color: b.value < 0 ? 'text.secondary' : 'text.primary' }}>
                  {b.value ? `${b.value < 0 ? '− ' : ''}${formatCurrency(Math.abs(b.value))}` : '—'}
                </Box>
              </Box>
            ))}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', px: 1.5, py: 1, fontSize: 13.5, fontWeight: 600 }}>
              <span>Profit{v.margin != null ? ` (${formatNumber(v.margin, 1)}%)` : ''}</span>
              <Box component="span" className="tabular" sx={{ color: v.profit < 0 ? 'soft.danger.fg' : 'soft.success.fg' }}>
                {formatCurrency(v.profit)}
              </Box>
            </Box>
          </Box>
          {v.ownersAmountGsl2 && v.ownersAmountGsl2 !== v.ownersAmount ? (
            <Typography sx={{ mt: 0.75, fontSize: 12, color: 'text.muted' }}>
              Of the owner payments, {formatCurrency(v.ownersAmountGsl2)} comes from DEPLOYMENT GSL 2.
            </Typography>
          ) : null}
        </Section>

        <Section title="Who drove it, by date">
          <Box sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', overflow: 'hidden' }}>
            <DataTable
              compact
              stickyHeader={false}
              rows={v.timeline}
              rowKey={(_, i) => i}
              empty={<Typography sx={{ p: 2, fontSize: 13, color: 'text.muted' }}>No deployments recorded for this vehicle.</Typography>}
              columns={[
                { key: 'date', header: 'Date', render: (t) => <Box sx={{ whiteSpace: 'nowrap' }}>{formatDate(t.date)}</Box> },
                {
                  key: 'driver',
                  header: 'Driver',
                  render: (t) =>
                    t.driver || (
                      <Box component="span" sx={{ color: 'text.faint' }}>
                        Not recorded
                      </Box>
                    ),
                },
                { key: 'voucher', header: 'Voucher type', hideBelow: 'sm' },
                { key: 'days', header: 'Days', align: 'right', render: (t) => (t.days ? formatNumber(t.days, 1) : '—') },
                {
                  key: 'status',
                  header: 'Status',
                  render: (t) => <StatusPill status={t.status} label={t.status === 'other' ? t.comment : undefined} />,
                },
                { key: 'revenue', header: 'Revenue', align: 'right', render: (t) => <Money value={t.revenue} /> },
                { key: 'mission', header: 'Mission', align: 'right', render: (t) => <Money value={t.mission} /> },
              ]}
            />
          </Box>
        </Section>

        {v.repairs.length ? (
          <Section title={`Repairs & technical reports (${v.repairs.length})`}>
            <Stack spacing={0.5}>
              {v.repairs.map((r, i) => (
                <Box key={i} sx={{ display: 'flex', gap: 1.5, fontSize: 13, flexWrap: 'wrap' }}>
                  <Box sx={{ width: 96, color: 'text.muted' }}>{formatDate(r.date)}</Box>
                  <Box className="tabular" sx={{ width: 110 }}>
                    {r.amount ? formatCurrency(r.amount) : '—'}
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 120, color: 'text.secondary' }}>{r.comment || 'No comment'}</Box>
                </Box>
              ))}
            </Stack>
          </Section>
        ) : null}
      </Stack>
    </Dialog>
  )
}
