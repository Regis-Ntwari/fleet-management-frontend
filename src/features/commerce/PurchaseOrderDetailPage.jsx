import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import EditIcon from '@mui/icons-material/Edit'
import AddIcon from '@mui/icons-material/Add'
import LockIcon from '@mui/icons-material/Lock'
import LockOpenIcon from '@mui/icons-material/LockOpen'
import PaymentsIcon from '@mui/icons-material/Payments'
import RouteIcon from '@mui/icons-material/Route'
import EventIcon from '@mui/icons-material/Event'
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { DescriptionList, ProgressBar } from '@/components/ui/Display'
import { StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, ErrorState, InlineAlert, LinkText, NotFoundInline, Skeleton } from '@/components/ui/Feedback'
import { formatCurrency, formatDate, formatDateTime } from '@/utils/format'

export default function PurchaseOrderDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const order = useQuery({ queryKey: ['purchase-orders', 'detail', id], queryFn: () => http.get(`/purchase-orders/${id}`) })
  const deployments = useQuery({
    queryKey: ['purchase-orders', 'deployments', id],
    queryFn: () => http.get(`/purchase-orders/${id}/deployments`),
    enabled: Boolean(order.data),
  })
  const [confirmClose, setConfirmClose] = useState(false)
  const toggle = useApiMutation({
    mutationFn: (closed) => http.patch(`/purchase-orders/${id}/status`, { closed }),
    invalidate: [['purchase-orders']],
    success: (o) => (o.closedAt ? `LPO ${o.lpoNumber} closed` : `LPO ${o.lpoNumber} reopened`),
    onSuccess: () => {
      setConfirmClose(false)
      order.refetch()
    },
  })

  if (order.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (order.isError)
    return order.error.isNotFound ? (
      <NotFoundInline what="purchase order" backTo="/commerce" backLabel="Back to commerce" />
    ) : (
      <ErrorState error={order.error} onRetry={order.refetch} />
    )
  const o = order.data
  const manage = can('ORDER_MANAGE')
  const daysLeft = Math.ceil((new Date(o.expiresOn) - new Date()) / 86_400_000)
  const actions = []
  if (can('DEPLOYMENT_MANAGE') && !o.closedAt)
    actions.push(
      <Button
        key="n"
        variant="primary"
        icon={AddIcon}
        to={`/deployments/new?purchaseOrderId=${o.id}&institution=${encodeURIComponent(o.institution)}`}
      >
        New deployment
      </Button>,
    )
  if (manage && !o.closedAt)
    actions.push(
      <Button key="e" icon={EditIcon} to={`/commerce/${o.id}/edit`}>
        Edit
      </Button>,
      <Button key="c" variant="danger-soft" icon={LockIcon} onClick={() => setConfirmClose(true)}>
        Close LPO
      </Button>,
    )
  if (manage && o.closedAt)
    actions.push(
      <Button key="r" icon={LockOpenIcon} onClick={() => toggle.mutate(false)} loading={toggle.isPending}>
        Reopen
      </Button>,
    )

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={`LPO ${o.lpoNumber}`}
        breadcrumbs={[{ label: 'Commerce', to: '/commerce' }, { label: o.lpoNumber }]}
        meta={<StatusBadge kind="purchaseOrder" value={o.status} />}
        description={`${o.institution} · ${o.description}`}
        actions={actions}
      />
      {o.status === 'EXHAUSTED' ? (
        <InlineAlert tone="warning" title="Fully committed">
          Deployments registered against this order already use its full amount. Amend the LPO or register a new one before deploying again.
        </InlineAlert>
      ) : o.status === 'EXPIRED' ? (
        <InlineAlert tone="danger" title={`Expired ${formatDate(o.expiresOn)}`}>
          The duration covered by this order has passed.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="LPO amount"
          value={formatCurrency(o.amount)}
          icon={PaymentsIcon}
          hint={o.originalAmount !== o.amount ? `Originally ${formatCurrency(o.originalAmount)}` : o.currency}
        />
        <Stat
          label="Committed"
          value={formatCurrency(o.committedAmount)}
          icon={RouteIcon}
          tone={o.committedAmount > o.amount ? 'danger' : undefined}
          hint={`${o.deploymentCount} deployment${o.deploymentCount === 1 ? '' : 's'} · ${o.committedDays} days`}
        />
        <Stat
          label="Remaining"
          value={formatCurrency(o.remainingAmount)}
          icon={AccountBalanceWalletIcon}
          tone={o.remainingAmount <= 0 ? 'warning' : undefined}
        />
        <Stat
          label="Validity"
          value={o.closedAt ? 'Closed' : daysLeft < 0 ? 'Expired' : `${daysLeft} days`}
          icon={EventIcon}
          tone={o.closedAt ? undefined : daysLeft < 0 ? 'danger' : daysLeft <= 7 ? 'warning' : undefined}
          hint={`${formatDate(o.receivedOn)} → ${formatDate(o.expiresOn)}`}
        />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { xl: 'span 2' } }}>
          <CardHeader title="Order" />
          <CardBody>
            <ProgressBar
              value={Math.min(o.amount, o.committedAmount)}
              max={o.amount || 1}
              tone={o.committedAmount >= o.amount ? 'warning' : 'accent'}
              label={`${formatCurrency(o.committedAmount)} of ${formatCurrency(o.amount)} committed`}
              sx={{ mb: 2.5 }}
            />
            <DescriptionList
              columns={3}
              items={[
                { label: 'Institution', value: o.institution },
                { label: 'Account manager', value: o.accountManagerName },
                { label: 'Date received', value: formatDate(o.receivedOn) },
                { label: 'Duration', value: `${o.durationDays} days` },
                { label: 'Expires', value: formatDate(o.expiresOn) },
                { label: 'Currency', value: o.currency },
                { label: 'Description', value: o.description, span: 'full' },
                o.notes && { label: 'Notes', value: o.notes, span: 'full' },
                { label: 'Registered', value: formatDateTime(o.createdAt) },
                { label: 'Last change', value: formatDateTime(o.updatedAt) },
                o.closedAt && { label: 'Closed', value: formatDateTime(o.closedAt) },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Controls" />
          <CardBody>
            <DescriptionList
              columns={1}
              items={[
                { label: 'Duplicate numbers', value: 'Refused for the same institution.' },
                { label: 'Amount changes', value: 'Original amount kept; every change is audited.' },
                {
                  label: 'Deployments',
                  value: 'Can be registered until the LPO is closed; exceeding the amount or duration is flagged, not blocked.',
                },
              ]}
            />
          </CardBody>
        </Card>
      </Box>
      <Card>
        <CardHeader title="Deployments" description="Registered against this purchase order, most recent first." />
        <DataTable
          stickyHeader={false}
          isLoading={deployments.isLoading}
          rows={deployments.data ?? []}
          onRowClick={can('DEPLOYMENT_READ') ? (t) => navigate(`/deployments/${t.id}`) : undefined}
          columns={[
            {
              key: 'deploymentNumber',
              header: 'Deployment',
              render: (t) =>
                can('DEPLOYMENT_READ') ? (
                  <LinkText to={`/deployments/${t.id}`} sx={{ fontFamily: (th) => th.typography.fontFamilyMono, fontSize: 12.5 }}>
                    {t.deploymentNumber}
                  </LinkText>
                ) : (
                  t.deploymentNumber
                ),
            },
            { key: 'scheduledStartAt', header: 'Scheduled', render: (t) => formatDateTime(t.scheduledStartAt) },
            { key: 'vehiclePlate', header: 'Vehicle', hideBelow: 'sm' },
            { key: 'driverName', header: 'Driver', hideBelow: 'md' },
            { key: 'destination', header: 'Destination', hideBelow: 'lg' },
            { key: 'effectiveDays', header: 'Days', align: 'right' },
            { key: 'amount', header: 'Amount', align: 'right', render: (t) => formatCurrency(t.amount) },
            { key: 'status', header: 'Status', render: (t) => <StatusBadge kind="deployment" value={t.status} size="sm" /> },
          ]}
          empty={
            <EmptyState
              icon={RouteIcon}
              title="No deployments yet"
              description="Deployments registered against this LPO appear here."
              compact
            />
          }
        />
      </Card>
      <ConfirmDialog
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        onConfirm={() => toggle.mutate(true)}
        loading={toggle.isPending}
        title={`Close LPO ${o.lpoNumber}?`}
        description="No further deployments can be registered against a closed order. It can be reopened later."
        confirmLabel="Close LPO"
      />
    </Stack>
  )
}
