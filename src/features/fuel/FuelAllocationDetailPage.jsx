import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditIcon from '@mui/icons-material/Edit'
import BlockIcon from '@mui/icons-material/Block'
import CheckIcon from '@mui/icons-material/Check'
import ReplyIcon from '@mui/icons-material/Reply'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList, Timeline } from '@/components/ui/Display'
import { StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea } from '@/components/ui/Field'
import { ErrorState, NotFoundInline, Skeleton, InlineAlert, LinkText, EmptyState } from '@/components/ui/Feedback'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { formatCurrency, formatDateTime, formatKm, formatLitres, formatNumber, formatSmartDateTime } from '@/utils/format'
import { ProofPreview } from './ProofPreview'
import { AllocateFuelDialog } from './AllocateFuelDialog'
import { FuelSubmitDialog } from './FuelSubmitDialog'

export default function FuelAllocationDetailPage() {
  const { id } = useParams()
  const { can, user } = useAuth()
  const query = useQuery({ queryKey: ['fuel', 'allocations', 'detail', id], queryFn: () => http.get(`/fuel/allocations/${id}`) })
  const [dialog, setDialog] = useState(null)

  if (query.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (query.isError)
    return query.error.isNotFound ? (
      <NotFoundInline what="fuel allocation" backTo="/fuel?tab=allocations" backLabel="Back to allocations" />
    ) : (
      <ErrorState error={query.error} onRetry={query.refetch} />
    )
  const a = query.data
  const manage = can('FUEL_MANAGE')
  const isDriver = !manage && can('FUEL_SUBMIT') && user?.driverId === a.driverId
  const s = a.submission
  const actions = []
  if (manage && a.status === 'SUBMITTED')
    actions.push(
      <Button key="v" variant="primary" icon={CheckIcon} onClick={() => setDialog('verify')}>
        Verify and record fuel
      </Button>,
      <Button key="r" icon={ReplyIcon} onClick={() => setDialog('return')}>
        Return to driver
      </Button>,
    )
  if (isDriver && ['PENDING', 'RETURNED'].includes(a.status))
    actions.push(
      <Button key="s" variant="primary" icon={ReceiptLongIcon} onClick={() => setDialog('submit')}>
        {a.status === 'RETURNED' ? 'Fix and resubmit' : 'Submit receipt'}
      </Button>,
    )
  if (manage && a.status === 'PENDING')
    actions.push(
      <Button key="e" icon={EditIcon} onClick={() => setDialog('edit')}>
        Edit
      </Button>,
    )
  if (manage && ['PENDING', 'SUBMITTED', 'RETURNED'].includes(a.status))
    actions.push(
      <Button key="x" variant="danger-soft" icon={BlockIcon} onClick={() => setDialog('cancel')}>
        Cancel
      </Button>,
    )

  const timeline = a.history.map((h, i) => ({
    id: i,
    at: h.at,
    title: h.action,
    description: [h.byName, h.note].filter(Boolean).join(' · '),
    tone:
      h.action === 'Verified'
        ? 'success'
        : h.action.startsWith('Returned')
          ? 'danger'
          : h.action === 'Cancelled'
            ? 'neutral'
            : h.action.includes('submitted')
              ? 'info'
              : 'accent',
  }))

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={a.requestNumber}
        breadcrumbs={
          manage || can('FUEL_READ')
            ? [{ label: 'Fuel', to: '/fuel' }, { label: 'Allocations', to: '/fuel?tab=allocations' }, { label: a.requestNumber }]
            : [{ label: 'My day', to: '/my-day' }, { label: a.requestNumber }]
        }
        meta={<StatusBadge kind="fuelRequest" value={a.status} />}
        description={`${formatLitres(a.litresAllocated)} for ${a.vehiclePlate} · ${a.driverName}${a.purpose ? ` · ${a.purpose}` : ''}`}
        actions={actions}
      />
      {a.status === 'SUBMITTED' && manage ? (
        <InlineAlert tone="info" title="Receipt waiting for verification">
          Check the photo against the figures below. Verifying records the fill as a fuel transaction; returning sends it back to the driver
          with your note.
        </InlineAlert>
      ) : null}
      {a.status === 'RETURNED' ? (
        <InlineAlert tone="warning" title={`Returned to driver${a.reviewedByName ? ` by ${a.reviewedByName}` : ''}`}>
          {a.reviewNote}
        </InlineAlert>
      ) : null}
      {a.status === 'VERIFIED' ? (
        <InlineAlert
          tone="success"
          title="Verified and recorded"
          action={
            can('FUEL_READ') ? (
              <Button size="xs" to={`/vehicles/${a.vehicleId}?tab=fuel`}>
                View fuel on {a.vehiclePlate}
              </Button>
            ) : null
          }
        >
          {formatLitres(s?.litres)} for {formatCurrency(a.fuelTotalAmount)} recorded on {formatDateTime(a.reviewedAt)}
          {a.reviewNote ? ` · ${a.reviewNote}` : ''}.
        </InlineAlert>
      ) : null}
      {a.overdue ? (
        <InlineAlert tone="danger" title="Overdue">
          The fill-up was due {formatSmartDateTime(a.dueAt)} and no receipt has been submitted.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="Allocated"
          value={formatNumber(a.litresAllocated, 1)}
          unit="L"
          icon={LocalGasStationIcon}
          hint={a.station ?? 'Any station'}
        />
        <Stat
          label="On receipt"
          value={s ? formatNumber(s.litres, 1) : '—'}
          unit={s ? 'L' : undefined}
          hint={s ? `${formatNumber(s.pricePerLitre)} RWF/L` : 'Not submitted yet'}
          tone={s && s.litres > a.litresAllocated ? 'warning' : undefined}
        />
        <Stat label="Amount" value={s ? formatCurrency(s.totalAmount) : '—'} hint={s?.station} />
        <Stat
          label="Odometer"
          value={s ? formatKm(s.odometerKm) : '—'}
          hint={a.vehicleOdometerKm != null ? `Vehicle reads ${formatKm(a.vehicleOdometerKm)}` : null}
        />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
          <Card>
            <CardHeader title="Allocation" description={`Created ${formatSmartDateTime(a.createdAt)} by ${a.createdByName}`} />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Vehicle',
                    value: can('VEHICLE_READ') ? <LinkText to={`/vehicles/${a.vehicleId}`}>{a.vehiclePlate}</LinkText> : a.vehiclePlate,
                  },
                  {
                    label: 'Driver',
                    value: can('DRIVER_READ') ? <LinkText to={`/drivers/${a.driverId}`}>{a.driverName}</LinkText> : a.driverName,
                  },
                  { label: 'Litres', value: formatLitres(a.litresAllocated) },
                  { label: 'Station', value: a.station ?? 'Driver’s choice' },
                  { label: 'Fill up by', value: a.dueAt ? formatDateTime(a.dueAt) : 'No deadline' },
                  { label: 'Purpose', value: a.purpose },
                  a.notes && { label: 'Note to the driver', value: a.notes, span: 'full' },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Receipt"
              description={
                s ? `Submitted ${formatSmartDateTime(s.submittedAt)} by ${s.submittedByName}` : 'Submitted by the driver after filling up.'
              }
            />
            <CardBody>
              {s ? (
                <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { md: 'minmax(0, 1fr) minmax(0, 1fr)' } }}>
                  <ProofPreview proof={s.proof} />
                  <DescriptionList
                    columns={2}
                    items={[
                      { label: 'Station', value: s.station },
                      { label: 'Date & time', value: formatDateTime(s.transactedAt) },
                      { label: 'Litres', value: formatLitres(s.litres) },
                      { label: 'Price per litre', value: `RWF ${formatNumber(s.pricePerLitre)}` },
                      { label: 'Total', value: formatCurrency(s.totalAmount) },
                      { label: 'Odometer', value: formatKm(s.odometerKm) },
                      { label: 'Receipt number', value: s.receiptNumber, mono: true },
                      s.notes && { label: 'Driver’s note', value: s.notes, span: 2 },
                    ]}
                  />
                </Box>
              ) : (
                <EmptyState
                  icon={ReceiptLongIcon}
                  title="No receipt yet"
                  description={
                    a.status === 'CANCELLED'
                      ? 'This allocation was cancelled before a fill-up.'
                      : 'The driver has not submitted a receipt for this allocation.'
                  }
                  compact
                />
              )}
            </CardBody>
          </Card>
        </Stack>
        <Card>
          <CardHeader title="History" />
          <CardBody>
            <Timeline items={timeline} renderTime={formatSmartDateTime} />
          </CardBody>
        </Card>
      </Box>
      <ReviewDialog
        allocation={a}
        kind={dialog === 'verify' || dialog === 'return' || dialog === 'cancel' ? dialog : null}
        onClose={() => setDialog(null)}
      />
      <AllocateFuelDialog open={dialog === 'edit'} allocation={a} onClose={() => setDialog(null)} />
      <FuelSubmitDialog open={dialog === 'submit'} allocation={a} onClose={() => setDialog(null)} />
    </Stack>
  )
}

const COPY = {
  verify: {
    title: 'Verify receipt',
    description: 'Creates the fuel transaction from the figures on the receipt. Consumption and anomalies are calculated as for any fill.',
    confirm: 'Verify and record',
    noteLabel: 'Note',
    required: false,
    variant: 'primary',
  },
  return: {
    title: 'Return to driver',
    description: 'The driver is notified and can fix the entry or retake the photo, then resubmit.',
    confirm: 'Return',
    noteLabel: 'What should the driver fix?',
    required: true,
    variant: 'primary',
  },
  cancel: {
    title: 'Cancel allocation',
    description: 'The driver is told not to fill up. Nothing is recorded.',
    confirm: 'Cancel allocation',
    noteLabel: 'Reason',
    required: false,
    variant: 'danger',
  },
}

function ReviewDialog({ allocation, kind, onClose }) {
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const act = useApiMutation({
    mutationFn: (body) => http.patch(`/fuel/allocations/${allocation.id}/${kind}`, body),
    invalidate: [['fuel'], ['vehicles'], ['dashboard'], ['alerts'], ['notifications'], ['me']],
    success: (r) =>
      r.status === 'VERIFIED'
        ? `${r.requestNumber} verified · fuel recorded`
        : r.status === 'RETURNED'
          ? `${r.requestNumber} returned to ${r.driverName}`
          : `${r.requestNumber} cancelled`,
    onSuccess: onClose,
  })
  if (!kind) return null
  const copy = COPY[kind]
  const submit = async () => {
    setError(null)
    try {
      await act.mutateAsync(kind === 'cancel' ? { reason: note } : { note })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      description={copy.description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant={copy.variant} onClick={submit} loading={act.isPending} disabled={copy.required && !note.trim()}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        {kind === 'verify' && allocation.submission ? (
          <Typography sx={{ fontSize: 13.5 }}>
            {formatLitres(allocation.submission.litres)} at {allocation.submission.station} for{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {formatCurrency(allocation.submission.totalAmount)}
            </Box>
            , odometer {formatKm(allocation.submission.odometerKm)}.
          </Typography>
        ) : null}
        <Field label={copy.noteLabel} required={copy.required} error={error?.fieldErrorMap?.note}>
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
        </Field>
      </Stack>
    </Dialog>
  )
}
