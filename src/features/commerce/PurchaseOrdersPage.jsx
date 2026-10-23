import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import PaymentsIcon from '@mui/icons-material/Payments'
import HourglassBottomIcon from '@mui/icons-material/HourglassBottom'
import EventBusyIcon from '@mui/icons-material/EventBusy'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { useOptions } from '@/app/ReferenceProvider'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/Badge'
import { DateRangePicker } from '@/components/ui/DateRange'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { ProgressBar } from '@/components/ui/Display'
import { EmptyState } from '@/components/ui/Feedback'
import { formatCurrency, formatDate } from '@/utils/format'

/** Commerce: the customer purchase orders (LPO) deployments are made against. */
export default function PurchaseOrdersPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const navigate = useNavigate()
  const { can } = useAuth()
  const statuses = useOptions('purchaseOrder')
  const institutions = useOptions('institution')
  const summary = useQuery({ queryKey: ['purchase-orders', 'summary'], queryFn: () => http.get('/purchase-orders/summary') })
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      institution: state.institution,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['purchase-orders', 'list'], '/purchase-orders', params)
  const s = summary.data
  const columns = [
    {
      key: 'lpoNumber',
      header: 'LPO',
      sortKey: 'lpoNumber',
      render: (o) => (
        <span>
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
            {o.lpoNumber}
          </Box>
          <Box
            component="span"
            sx={{
              display: 'block',
              fontSize: 11.5,
              color: 'text.muted',
              maxWidth: 260,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {o.description}
          </Box>
        </span>
      ),
    },
    { key: 'institution', header: 'Institution', sortKey: 'institution' },
    { key: 'receivedOn', header: 'Received', sortKey: 'receivedOn', render: (o) => formatDate(o.receivedOn), hideBelow: 'md' },
    {
      key: 'durationDays',
      header: 'Duration',
      sortKey: 'durationDays',
      render: (o) => `${o.durationDays} d · until ${formatDate(o.expiresOn)}`,
      hideBelow: 'lg',
    },
    {
      key: 'amount',
      header: 'Amount',
      sortKey: 'amount',
      align: 'right',
      render: (o) => `${formatCurrency(o.amount)}${o.currency !== 'RWF' ? ` ${o.currency}` : ''}`,
    },
    {
      key: 'committedAmount',
      header: 'Committed',
      sortKey: 'committedAmount',
      render: (o) => (
        <Box sx={{ minWidth: 120 }}>
          <ProgressBar
            value={Math.min(o.amount, o.committedAmount)}
            max={o.amount || 1}
            tone={o.committedAmount >= o.amount ? 'warning' : 'accent'}
            label={`${formatCurrency(o.committedAmount)} of ${formatCurrency(o.amount)}`}
          />
          <Box component="span" sx={{ display: 'block', mt: 0.5, fontSize: 11.5, color: 'text.muted' }}>
            {o.deploymentCount} deployment{o.deploymentCount === 1 ? '' : 's'} · {o.committedDays} days
          </Box>
        </Box>
      ),
      hideBelow: 'md',
    },
    { key: 'accountManagerName', header: 'Account manager', hideBelow: 'xl' },
    { key: 'status', header: 'Status', sortKey: 'status', render: (o) => <StatusBadge kind="purchaseOrder" value={o.status} size="sm" /> },
  ]
  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Commerce"
        description="Customer purchase orders (LPO) recorded by account managers. Every deployment is registered against one of these orders."
        actions={
          can('ORDER_MANAGE') ? (
            <Button variant="primary" icon={AddIcon} to="/commerce/new">
              Register LPO
            </Button>
          ) : null
        }
      />
      <StatGrid cols={4}>
        <Stat label="Open LPOs" value={s?.open} icon={ReceiptLongIcon} loading={summary.isLoading} to="/commerce?status=OPEN" />
        <Stat
          label="Open value"
          value={s ? formatCurrency(s.openAmount, { compact: true }) : null}
          icon={PaymentsIcon}
          loading={summary.isLoading}
          hint={s ? `${formatCurrency(s.openRemaining, { compact: true })} not yet deployed` : null}
        />
        <Stat
          label="Exhausted"
          value={s?.exhausted}
          icon={HourglassBottomIcon}
          loading={summary.isLoading}
          tone={s?.exhausted ? 'warning' : undefined}
          to="/commerce?status=EXHAUSTED"
        />
        <Stat
          label="Expired"
          value={s?.expired}
          icon={EventBusyIcon}
          loading={summary.isLoading}
          tone={s?.expired ? 'danger' : undefined}
          to="/commerce?status=EXPIRED"
        />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="LPO number, institution, description…"
        onRowClick={(o) => navigate(`/commerce/${o.id}`)}
        defaultSort="receivedOn,desc"
        filters={
          <>
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.institution ?? ''}
              onChange={(e) => update({ institution: e.target.value })}
              compact
              placeholder="All institutions"
              aria-label="Institution"
            >
              {institutions.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={
          <EmptyState
            icon={ReceiptLongIcon}
            title="No purchase orders match"
            description="Adjust the filters, or register a new LPO."
            compact
          />
        }
      />
    </Stack>
  )
}
