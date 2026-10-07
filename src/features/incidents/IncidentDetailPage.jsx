import { useState } from 'react'
import { useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { visuallyHidden } from '@mui/utils'
import EditIcon from '@mui/icons-material/Edit'
import SearchIcon from '@mui/icons-material/Search'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import LockIcon from '@mui/icons-material/Lock'
import ReplayIcon from '@mui/icons-material/Replay'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import UploadIcon from '@mui/icons-material/Upload'
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
import { ErrorState, NotFoundInline, Skeleton, InlineAlert, LinkText } from '@/components/ui/Feedback'
import { formatBytes, formatCurrency, formatDateTime, formatSmartDateTime } from '@/utils/format'

export default function IncidentDetailPage() {
  const { id } = useParams()
  const { can } = useAuth()
  const incident = useQuery({ queryKey: ['incidents', 'detail', id], queryFn: () => http.get(`/incidents/${id}`) })
  const [dialog, setDialog] = useState(null)
  const attach = useApiMutation({
    mutationFn: (file) => http.post(`/incidents/${id}/attachments`, { fileName: file.name, contentType: file.type, sizeBytes: file.size }),
    invalidate: [['incidents']],
    success: 'Attachment added',
  })

  if (incident.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (incident.isError)
    return incident.error.isNotFound ? (
      <NotFoundInline what="incident" backTo="/incidents" backLabel="Back to incidents" />
    ) : (
      <ErrorState error={incident.error} onRetry={incident.refetch} />
    )
  const i = incident.data
  const manage = can('INCIDENT_MANAGE')
  const actions = []
  if (manage) {
    if (i.status === 'OPEN')
      actions.push(
        <Button key="inv" variant="primary" icon={SearchIcon} onClick={() => setDialog('UNDER_INVESTIGATION')}>
          Open investigation
        </Button>,
      )
    if (['OPEN', 'UNDER_INVESTIGATION'].includes(i.status))
      actions.push(
        <Button
          key="res"
          variant={i.status === 'UNDER_INVESTIGATION' ? 'primary' : 'secondary'}
          icon={CheckCircleIcon}
          onClick={() => setDialog('RESOLVED')}
        >
          Resolve
        </Button>,
      )
    if (i.status === 'RESOLVED')
      actions.push(
        <Button key="close" variant="primary" icon={LockIcon} onClick={() => setDialog('CLOSED')}>
          Close
        </Button>,
        <Button key="reopen" icon={ReplayIcon} onClick={() => setDialog('UNDER_INVESTIGATION')}>
          Reopen
        </Button>,
      )
    if (i.status !== 'CLOSED')
      actions.push(
        <Button key="edit" icon={EditIcon} to={`/incidents/${i.id}/edit`}>
          Edit
        </Button>,
      )
  }
  const timeline = i.history
    .map((h, idx) => ({
      id: `${idx}-${h.at}`,
      at: h.at,
      title: h.action,
      description: h.note ? `${h.note} — ${h.byName}` : h.byName,
      tone: h.action.includes('Closed')
        ? 'neutral'
        : h.action.includes('resolved')
          ? 'success'
          : h.action.includes('Investigation')
            ? 'warning'
            : h.action.includes('out of service')
              ? 'danger'
              : 'info',
    }))
    .reverse()

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={i.incidentNumber}
        breadcrumbs={[{ label: 'Incidents', to: '/incidents' }, { label: i.incidentNumber }]}
        meta={
          <>
            <StatusBadge kind="incident" value={i.status} />
            <StatusBadge kind="severity" value={i.severity} />
          </>
        }
        description={`${formatDateTime(i.occurredAt)} · ${i.location}`}
        actions={actions}
      />
      {i.status === 'CLOSED' ? (
        <InlineAlert tone="info">This incident is closed and read-only. The full history is retained below.</InlineAlert>
      ) : null}
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Stack spacing={2} sx={{ gridColumn: { xl: 'span 2' } }}>
          <Card>
            <CardHeader title="Incident" />
            <CardBody>
              <DescriptionList
                columns={3}
                items={[
                  {
                    label: 'Vehicle',
                    value: <LinkText to={`/vehicles/${i.vehicleId}?tab=incidents`}>{i.vehiclePlate}</LinkText>,
                  },
                  {
                    label: 'Driver',
                    value: i.driverId ? <LinkText to={`/drivers/${i.driverId}`}>{i.driverName}</LinkText> : null,
                  },
                  { label: 'Type', value: <StatusBadge kind="incidentType" value={i.type} size="sm" dot={false} /> },
                  { label: 'Occurred', value: formatDateTime(i.occurredAt) },
                  { label: 'Location', value: i.location },
                  { label: 'Estimated cost', value: formatCurrency(i.estimatedCost) },
                  { label: 'Description', value: i.description, span: 'full' },
                  {
                    label: 'Investigation',
                    value: i.investigation ?? (
                      <Box component="span" sx={{ color: 'text.faint' }}>
                        Not started
                      </Box>
                    ),
                    span: 'full',
                  },
                  {
                    label: 'Corrective action',
                    value: i.correctiveAction ?? (
                      <Box component="span" sx={{ color: 'text.faint' }}>
                        None recorded
                      </Box>
                    ),
                    span: 'full',
                  },
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Attachments"
              description="Photos, police reports, statements"
              actions={
                manage && i.status !== 'CLOSED' ? (
                  <Box
                    component="label"
                    sx={{
                      display: 'inline-flex',
                      height: 32,
                      cursor: 'pointer',
                      alignItems: 'center',
                      gap: 0.75,
                      borderRadius: 1,
                      border: 1,
                      borderColor: 'divider',
                      px: 1.25,
                      fontSize: 13,
                      fontWeight: 500,
                      '&:hover': { bgcolor: 'background.subtle' },
                    }}
                  >
                    <UploadIcon sx={{ fontSize: 16 }} aria-hidden /> Upload
                    <Box
                      component="input"
                      type="file"
                      sx={visuallyHidden}
                      accept="image/*,.pdf"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) attach.mutate(f)
                        e.target.value = ''
                      }}
                    />
                  </Box>
                ) : null
              }
            />
            <CardBody flush>
              {i.attachments.length === 0 ? (
                <Typography sx={{ px: 2.5, py: 3, textAlign: 'center', fontSize: 13, color: 'text.muted' }}>No attachments yet.</Typography>
              ) : (
                <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
                  {i.attachments.map((a) => (
                    <Box
                      component="li"
                      key={a.id}
                      sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: 2.5, py: 1.25, fontSize: 13 }}
                    >
                      <AttachFileIcon sx={{ fontSize: 16, color: 'text.muted' }} aria-hidden />
                      <Box
                        component="span"
                        sx={{
                          minWidth: 0,
                          flex: 1,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                          color: 'text.primary',
                        }}
                      >
                        {a.fileName}
                      </Box>
                      <Box component="span" sx={{ color: 'text.muted' }}>
                        {formatBytes(a.sizeBytes)} · {formatSmartDateTime(a.uploadedAt)}
                      </Box>
                    </Box>
                  ))}
                </Box>
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
      <StatusDialog incident={i} status={dialog} onClose={() => setDialog(null)} />
    </Stack>
  )
}

const COPY = {
  UNDER_INVESTIGATION: {
    title: 'Open investigation',
    confirm: 'Open investigation',
    field: 'investigation',
    label: 'Investigation notes',
    required: false,
  },
  RESOLVED: { title: 'Resolve incident', confirm: 'Mark resolved', field: 'correctiveAction', label: 'Corrective action', required: true },
  CLOSED: { title: 'Close incident', confirm: 'Close incident', field: 'note', label: 'Closing note', required: true },
}

function StatusDialog({ incident, status, onClose }) {
  const [text, setText] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/incidents/${incident.id}/status`, body),
    invalidate: [['incidents'], ['dashboard'], ['alerts'], ['vehicles']],
    success: 'Incident updated',
    onSuccess: onClose,
  })
  if (!status) return null
  const copy = COPY[status]
  const existing = status === 'RESOLVED' ? incident.correctiveAction : status === 'UNDER_INVESTIGATION' ? incident.investigation : null
  const submit = async () => {
    setError(null)
    try {
      await change.mutateAsync({ status, [copy.field]: text, note: status === 'CLOSED' ? text : note })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={copy.title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" onClick={submit} loading={change.isPending} disabled={copy.required && !text.trim() && !existing}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label={copy.label} required={copy.required && !existing} hint={existing ? `Currently: ${existing}` : undefined}>
          <Textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
        </Field>
        {status !== 'CLOSED' ? (
          <Field label="Note for the history">
            <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        ) : null}
      </Stack>
    </Dialog>
  )
}
