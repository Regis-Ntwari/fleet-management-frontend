import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import CheckIcon from '@mui/icons-material/Check'
import PauseIcon from '@mui/icons-material/Pause'
import BlockIcon from '@mui/icons-material/Block'
import SearchIcon from '@mui/icons-material/Search'
import ThumbUpIcon from '@mui/icons-material/ThumbUp'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList } from '@/components/ui/Display'
import { StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Textarea, SuggestInput } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { ErrorState, NotFoundInline, Skeleton, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { formatCurrency, formatDateTime, formatKm, formatNumber } from '@/utils/format'
import { TECHNICIANS } from '@/api/mock/data'

const STEPS = ['REPORTED', 'INSPECTION', 'APPROVED', 'IN_PROGRESS', 'COMPLETED']

export default function MaintenanceDetailPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const job = useQuery({ queryKey: ['maintenance', 'detail', id], queryFn: () => http.get(`/maintenance/${id}`) })
  const [dialog, setDialog] = useState(null)
  if (job.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (job.isError)
    return job.error.isNotFound ? (
      <NotFoundInline what="maintenance record" backTo="/maintenance" backLabel="Back to maintenance" />
    ) : (
      <ErrorState error={job.error} onRetry={job.refetch} />
    )
  const m = job.data
  const manage = can('MAINTENANCE_MANAGE')
  const terminal = ['COMPLETED', 'CANCELLED'].includes(m.status)
  const actions = []
  if (manage && !terminal) {
    if (m.status === 'REPORTED')
      actions.push(
        <Button key="i" icon={SearchIcon} onClick={() => setDialog('INSPECTION')}>
          Inspect
        </Button>,
        <Button key="a" variant="primary" icon={ThumbUpIcon} onClick={() => setDialog('APPROVED')}>
          Approve
        </Button>,
      )
    if (m.status === 'INSPECTION')
      actions.push(
        <Button key="a" variant="primary" icon={ThumbUpIcon} onClick={() => setDialog('APPROVED')}>
          Approve
        </Button>,
      )
    if (['APPROVED', 'WAITING_FOR_PARTS'].includes(m.status))
      actions.push(
        <Button key="s" variant="primary" icon={PlayArrowIcon} onClick={() => setDialog('IN_PROGRESS')}>
          Start work
        </Button>,
      )
    if (['APPROVED', 'IN_PROGRESS'].includes(m.status))
      actions.push(
        <Button key="w" icon={PauseIcon} onClick={() => setDialog('WAITING_FOR_PARTS')}>
          Waiting for parts
        </Button>,
      )
    if (m.status === 'IN_PROGRESS')
      actions.push(
        <Button key="c" variant="primary" icon={CheckIcon} onClick={() => setDialog('COMPLETED')}>
          Complete
        </Button>,
      )
    actions.push(
      <Button key="e" icon={EditIcon} to={`/maintenance/${m.id}/edit`}>
        Edit
      </Button>,
      <Button key="x" variant="danger-soft" icon={BlockIcon} onClick={() => setDialog('CANCELLED')}>
        Cancel
      </Button>,
    )
  }
  const stepIndex = STEPS.indexOf(m.status === 'WAITING_FOR_PARTS' ? 'IN_PROGRESS' : m.status)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={m.maintenanceNumber}
        breadcrumbs={[{ label: 'Maintenance', to: '/maintenance' }, { label: m.maintenanceNumber }]}
        meta={
          <>
            <StatusBadge kind="maintenance" value={m.status} />
            <StatusBadge kind="maintenanceType" value={m.type} dot={false} />
          </>
        }
        description={m.complaint}
        actions={actions}
      />
      {m.status !== 'CANCELLED' ? (
        <Box
          component="ol"
          sx={{ display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto', fontSize: 12, listStyle: 'none', m: 0, p: 0 }}
        >
          {STEPS.map((s, i) => (
            <Box component="li" key={s} sx={{ display: 'flex', flexShrink: 0, alignItems: 'center', gap: 1 }}>
              <Box
                component="span"
                sx={[
                  {
                    display: 'flex',
                    width: 20,
                    height: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    fontSize: 10.5,
                    fontWeight: 600,
                  },
                  i < stepIndex
                    ? { bgcolor: 'primary.main', color: 'primary.contrastText' }
                    : i === stepIndex
                      ? { bgcolor: 'soft.accent.bg', color: 'soft.accent.fg', boxShadow: '0 0 0 2px var(--limoz-palette-primary-main)' }
                      : { bgcolor: 'background.muted', color: 'text.muted' },
                ]}
              >
                {i < stepIndex ? '✓' : i + 1}
              </Box>
              <Box component="span" sx={i === stepIndex ? { fontWeight: 500, color: 'text.primary' } : { color: 'text.muted' }}>
                {s === 'IN_PROGRESS' && m.status === 'WAITING_FOR_PARTS'
                  ? 'Waiting for parts'
                  : s
                      .toLowerCase()
                      .replace(/_/g, ' ')
                      .replace(/^\w/, (c) => c.toUpperCase())}
              </Box>
              {i < STEPS.length - 1 ? <Box component="span" sx={{ height: '1px', width: 24, bgcolor: 'divider' }} aria-hidden /> : null}
            </Box>
          ))}
        </Box>
      ) : (
        <InlineAlert tone="info">This job was cancelled. {m.comments ? m.comments.split('\n').pop() : ''}</InlineAlert>
      )}
      {m.status === 'WAITING_FOR_PARTS' ? (
        <InlineAlert tone="warning" title="Waiting for parts">
          Start work again once the parts are received. Stock is checked when work starts.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="Parts"
          value={formatCurrency(m.partsCost, { compact: true })}
          hint={`${m.parts.length} line${m.parts.length === 1 ? '' : 's'}`}
        />
        <Stat label="Labour" value={formatCurrency(m.laborCost, { compact: true })} />
        <Stat label="Other" value={formatCurrency(m.otherCost, { compact: true })} />
        <Stat label="Total" value={formatCurrency(m.totalCost, { compact: true })} hint="parts + labour + other" />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { xl: 'span 2' } }}>
          <CardHeader title="Job details" />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                {
                  label: 'Vehicle',
                  value: <LinkText to={`/vehicles/${m.vehicleId}?tab=maintenance`}>{m.vehiclePlate}</LinkText>,
                },
                { label: 'Reported', value: `${formatDateTime(m.reportedAt)} · ${m.reportedByName}` },
                { label: 'Odometer', value: formatKm(m.odometerKm) },
                { label: 'Workshop', value: m.workshop },
                { label: 'Technician', value: m.technicianName },
                { label: 'Expected completion', value: m.expectedCompletionAt ? formatDateTime(m.expectedCompletionAt) : null },
                { label: 'Started', value: m.startedAt ? formatDateTime(m.startedAt) : null },
                { label: 'Completed', value: m.completedAt ? formatDateTime(m.completedAt) : null },
                { label: 'Last updated', value: formatDateTime(m.updatedAt) },
                { label: 'Diagnosis', value: m.diagnosis, span: 'full' },
                { label: 'Service performed', value: m.servicePerformed, span: 'full' },
                m.comments && {
                  label: 'Comments',
                  value: (
                    <Box component="pre" sx={{ whiteSpace: 'pre-wrap', fontFamily: (t) => t.typography.fontFamily, m: 0 }}>
                      {m.comments}
                    </Box>
                  ),
                  span: 'full',
                },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Parts used" />
          <DataTable
            stickyHeader={false}
            compact
            rows={m.parts}
            rowKey={(p) => p.partId}
            columns={[
              {
                key: 'partName',
                header: 'Part',
                render: (p) => (
                  <span>
                    <Box component="span" sx={{ display: 'block', color: 'text.primary' }}>
                      {p.partName}
                    </Box>
                    <Box
                      component="span"
                      sx={{ display: 'block', fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 11.5, color: 'text.muted' }}
                    >
                      {p.partNumber}
                    </Box>
                  </span>
                ),
              },
              { key: 'quantity', header: 'Qty', align: 'right', render: (p) => formatNumber(p.quantity) },
              { key: 'total', header: 'Total', align: 'right', render: (p) => formatCurrency(p.quantity * p.unitCost) },
            ]}
            empty={
              <Typography sx={{ px: 2, py: 3, textAlign: 'center', fontSize: 13, color: 'text.muted' }}>No parts on this job.</Typography>
            }
          />
        </Card>
      </Box>
      <StatusDialog job={m} status={dialog} onClose={() => setDialog(null)} />
    </Stack>
  )
}

const COPY = {
  INSPECTION: { title: 'Send for inspection', confirm: 'Start inspection' },
  APPROVED: { title: 'Approve work', confirm: 'Approve' },
  IN_PROGRESS: {
    title: 'Start work',
    confirm: 'Start work',
    description: 'Parts on the job are deducted from stock. The vehicle moves to "In maintenance".',
  },
  WAITING_FOR_PARTS: { title: 'Waiting for parts', confirm: 'Mark waiting' },
  COMPLETED: {
    title: 'Complete job',
    confirm: 'Complete',
    description: 'The vehicle returns to service and preventive schedules matching this work are reset.',
  },
  CANCELLED: { title: 'Cancel job', confirm: 'Cancel job', description: 'Reserved parts are returned to stock.' },
}

function StatusDialog({ job, status, onClose }) {
  const [note, setNote] = useState('')
  const [technician, setTechnician] = useState(job.technicianName ?? '')
  const [service, setService] = useState(job.servicePerformed ?? '')
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/maintenance/${job.id}/status`, body),
    invalidate: [['maintenance'], ['vehicles'], ['dashboard'], ['parts'], ['alerts'], ['dispatch']],
    success: (m) => `${m.maintenanceNumber} is now ${m.status.toLowerCase().replace(/_/g, ' ')}`,
    onSuccess: onClose,
  })
  if (!status) return null
  const copy = COPY[status]
  const submit = async () => {
    setError(null)
    try {
      await change.mutateAsync({ status, note, technicianName: technician, servicePerformed: service })
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
          <Button variant={status === 'CANCELLED' ? 'danger' : 'primary'} onClick={submit} loading={change.isPending}>
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
        {status === 'IN_PROGRESS' ? (
          <Field label="Technician" required error={error?.fieldErrorMap?.technicianName}>
            <SuggestInput suggestions={TECHNICIANS} value={technician} onChange={(e) => setTechnician(e.target.value)} autoFocus />
          </Field>
        ) : null}
        {status === 'COMPLETED' ? (
          <Field label="Service performed" required error={error?.fieldErrorMap?.servicePerformed}>
            <Textarea rows={3} value={service} onChange={(e) => setService(e.target.value)} autoFocus />
          </Field>
        ) : null}
        <Field label={status === 'CANCELLED' ? 'Reason' : 'Note'}>
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </Stack>
    </Dialog>
  )
}
