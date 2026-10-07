import { useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import EditIcon from '@mui/icons-material/Edit'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import StopIcon from '@mui/icons-material/Stop'
import BlockIcon from '@mui/icons-material/Block'
import SendIcon from '@mui/icons-material/Send'
import UndoIcon from '@mui/icons-material/Undo'
import PlaceIcon from '@mui/icons-material/Place'
import ScheduleIcon from '@mui/icons-material/Schedule'
import SpeedIcon from '@mui/icons-material/Speed'
import PeopleIcon from '@mui/icons-material/People'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DescriptionList, Timeline } from '@/components/ui/Display'
import { StatusBadge } from '@/components/ui/Badge'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { ErrorState, LinkText, NotFoundInline, Skeleton, InlineAlert } from '@/components/ui/Feedback'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { formatDateTime, formatDuration, formatKm, formatLitres, formatNumber, formatSmartDateTime } from '@/utils/format'

export default function TripDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const trip = useQuery({ queryKey: ['trips', 'detail', id], queryFn: () => http.get(`/trips/${id}`) })
  const [dialog, setDialog] = useState(null)
  const vehicle = useQuery({
    queryKey: ['vehicles', 'detail', String(trip.data?.vehicleId)],
    queryFn: () => http.get(`/vehicles/${trip.data.vehicleId}`),
    enabled: Boolean(trip.data),
  })

  if (trip.isLoading)
    return (
      <Stack spacing={2}>
        <Skeleton height={32} width={256} />
        <Skeleton height={256} />
      </Stack>
    )
  if (trip.isError)
    return trip.error.isNotFound ? (
      <NotFoundInline what="trip" backTo="/trips" backLabel="Back to trips" />
    ) : (
      <ErrorState error={trip.error} onRetry={trip.refetch} />
    )
  const t = trip.data
  const manage = can('TRIP_MANAGE')
  const actions = []
  if (manage) {
    if (t.status === 'PLANNED')
      actions.push(
        <Button key="d" variant="primary" icon={SendIcon} onClick={() => setDialog('DISPATCHED')}>
          Dispatch
        </Button>,
      )
    if (t.status === 'DISPATCHED')
      actions.push(
        <Button key="s" variant="primary" icon={PlayArrowIcon} onClick={() => setDialog('IN_PROGRESS')}>
          Start trip
        </Button>,
        <Button key="u" icon={UndoIcon} onClick={() => setDialog('PLANNED')}>
          Back to planned
        </Button>,
      )
    if (t.status === 'IN_PROGRESS')
      actions.push(
        <Button key="c" variant="primary" icon={StopIcon} onClick={() => setDialog('COMPLETED')}>
          Complete trip
        </Button>,
      )
    if (['PLANNED', 'DISPATCHED'].includes(t.status))
      actions.push(
        <Button key="e" icon={EditIcon} to={`/trips/${t.id}/edit`}>
          Edit
        </Button>,
        <Button key="x" variant="danger-soft" icon={BlockIcon} onClick={() => setDialog('CANCELLED')}>
          Cancel
        </Button>,
      )
  }

  const timeline = [
    { id: 'created', at: t.createdAt, title: 'Trip planned', tone: 'neutral' },
    t.startedAt && {
      id: 'started',
      at: t.startedAt,
      title: `Trip started at ${formatKm(t.startOdometer)}`,
      tone: 'accent',
      icon: PlayArrowIcon,
    },
    t.endedAt && {
      id: 'ended',
      at: t.endedAt,
      title: `Trip completed at ${formatKm(t.endOdometer)}`,
      description: `${formatKm(t.distanceKm)} · ${formatDuration(t.durationMinutes)}`,
      tone: 'success',
      icon: StopIcon,
    },
    t.status === 'CANCELLED' && {
      id: 'cancelled',
      at: t.updatedAt,
      title: 'Trip cancelled',
      description: t.notes,
      tone: 'danger',
      icon: BlockIcon,
    },
  ].filter(Boolean)

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title={t.tripNumber}
        breadcrumbs={[{ label: 'Trips', to: '/trips' }, { label: t.tripNumber }]}
        meta={<StatusBadge kind="trip" value={t.status} />}
        description={`${t.startLocation} → ${t.destination} · ${t.purpose}`}
        actions={actions}
      />
      {t.status === 'IN_PROGRESS' ? (
        <InlineAlert tone="info" title="Trip in progress">
          Started {formatSmartDateTime(t.startedAt)} at {formatKm(t.startOdometer)}. Complete the trip to record the final odometer reading.
        </InlineAlert>
      ) : null}
      <StatGrid cols={4}>
        <Stat
          label="Distance"
          value={t.distanceKm != null ? formatNumber(t.distanceKm) : '—'}
          unit="km"
          icon={SpeedIcon}
          hint={
            t.startOdometer != null
              ? `${formatKm(t.startOdometer)} → ${t.endOdometer != null ? formatKm(t.endOdometer) : '…'}`
              : 'Recorded on completion'
          }
        />
        <Stat
          label="Duration"
          value={formatDuration(t.durationMinutes)}
          icon={ScheduleIcon}
          hint={t.startedAt ? `Started ${formatSmartDateTime(t.startedAt)}` : `Scheduled ${formatSmartDateTime(t.scheduledStartAt)}`}
        />
        <Stat label="Passengers" value={t.passengers} icon={PeopleIcon} hint={t.customerName ?? 'No customer'} />
        <Stat
          label="Fuel used"
          value={t.fuelUsedLitres != null ? formatLitres(t.fuelUsedLitres) : '—'}
          hint={t.maxSpeedKph ? `Max ${t.maxSpeedKph} km/h` : null}
        />
      </StatGrid>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xl: 'repeat(3, minmax(0, 1fr))' } }}>
        <Card sx={{ gridColumn: { xl: 'span 2' } }}>
          <CardHeader title="Details" />
          <CardBody>
            <DescriptionList
              columns={3}
              items={[
                {
                  label: 'Vehicle',
                  value: <LinkText to={`/vehicles/${t.vehicleId}`}>{t.vehiclePlate}</LinkText>,
                },
                {
                  label: 'Driver',
                  value: <LinkText to={`/drivers/${t.driverId}`}>{t.driverName}</LinkText>,
                },
                {
                  label: 'Booking',
                  value: t.bookingId ? <LinkText to={`/bookings/${t.bookingId}`}>{t.bookingNumber}</LinkText> : 'None',
                },
                { label: 'Scheduled start', value: formatDateTime(t.scheduledStartAt) },
                { label: 'Started', value: t.startedAt ? formatDateTime(t.startedAt) : null },
                { label: 'Ended', value: t.endedAt ? formatDateTime(t.endedAt) : null },
                {
                  label: 'From',
                  value: (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <PlaceIcon sx={{ fontSize: 14, color: 'text.muted' }} aria-hidden />
                      {t.startLocation}
                    </Box>
                  ),
                },
                {
                  label: 'To',
                  value: (
                    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75 }}>
                      <PlaceIcon sx={{ fontSize: 14, color: 'text.muted' }} aria-hidden />
                      {t.destination}
                    </Box>
                  ),
                },
                { label: 'Purpose', value: t.purpose },
                { label: 'Customer', value: t.customerName },
                t.notes && { label: 'Notes', value: t.notes, span: 'full' },
              ]}
            />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Timeline" />
          <CardBody>
            <Timeline items={timeline} renderTime={formatSmartDateTime} />
          </CardBody>
        </Card>
      </Box>
      <TransitionDialog
        trip={t}
        status={dialog}
        vehicle={vehicle.data}
        onClose={() => setDialog(null)}
        onDone={() => {
          trip.refetch()
          if (dialog === 'CANCELLED') navigate(`/trips/${t.id}`)
        }}
      />
    </Stack>
  )
}

const COPY = {
  DISPATCHED: {
    title: 'Dispatch trip',
    description: 'Confirms the vehicle and driver are released for this trip. Documents and licence validity are re-checked.',
    confirm: 'Dispatch',
  },
  IN_PROGRESS: {
    title: 'Start trip',
    description: 'Record the odometer as the vehicle leaves. Defaults to the vehicle’s current reading.',
    confirm: 'Start trip',
  },
  COMPLETED: {
    title: 'Complete trip',
    description: 'Enter the odometer at arrival. Distance and duration are calculated automatically.',
    confirm: 'Complete trip',
  },
  CANCELLED: {
    title: 'Cancel trip',
    description: 'The trip is kept for the record and marked cancelled. A linked booking returns to confirmed.',
    confirm: 'Cancel trip',
  },
  PLANNED: { title: 'Return to planned', description: 'Undo the dispatch so the trip can be edited again.', confirm: 'Return to planned' },
}

function TransitionDialog({ trip, status, vehicle, onClose, onDone }) {
  const [values, setValues] = useState({ startOdometer: '', endOdometer: '', fuelUsedLitres: '', maxSpeedKph: '', reason: '' })
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/trips/${trip.id}/status`, body),
    invalidate: [['trips'], ['vehicles'], ['drivers'], ['bookings'], ['dashboard'], ['dispatch']],
    success: (t) => `Trip ${t.tripNumber} is now ${t.status.toLowerCase().replace('_', ' ')}`,
    onSuccess: () => {
      onDone()
      onClose()
    },
  })
  if (!status) return null
  const copy = COPY[status]
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const submit = async () => {
    setError(null)
    try {
      await change.mutateAsync({ status, ...values })
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
          <Button
            variant={status === 'CANCELLED' ? 'danger' : 'primary'}
            onClick={submit}
            loading={change.isPending}
            disabled={status === 'CANCELLED' && !values.reason.trim()}
          >
            {copy.confirm}
          </Button>
        </>
      }
    >
      {/* useFlexGap so the negative margin on the distance note can pull it closer to the field above (old `-mt-2`). */}
      <Stack spacing={2} useFlexGap>
        {error ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        {status === 'IN_PROGRESS' ? (
          <Field
            label="Start odometer"
            hint={vehicle ? `Vehicle currently reads ${formatKm(vehicle.odometerKm)}` : undefined}
            error={error?.fieldErrorMap?.startOdometer}
          >
            <Input
              type="number"
              inputMode="numeric"
              placeholder={vehicle ? String(vehicle.odometerKm) : ''}
              value={values.startOdometer}
              onChange={set('startOdometer')}
              trailing="km"
              autoFocus
            />
          </Field>
        ) : null}
        {status === 'COMPLETED' ? (
          <>
            <Field
              label="End odometer"
              required
              hint={`Started at ${formatKm(trip.startOdometer)}`}
              error={error?.fieldErrorMap?.endOdometer}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={trip.startOdometer}
                value={values.endOdometer}
                onChange={set('endOdometer')}
                trailing="km"
                autoFocus
              />
            </Field>
            {values.endOdometer && Number(values.endOdometer) >= trip.startOdometer ? (
              <Typography sx={{ mt: -1, fontSize: 12.5, color: 'text.muted' }}>
                Distance will be recorded as{' '}
                <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                  {formatKm(Number(values.endOdometer) - trip.startOdometer)}
                </Box>
                .
              </Typography>
            ) : null}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 1.5 }}>
              <Field label="Fuel used" hint="Optional">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  value={values.fuelUsedLitres}
                  onChange={set('fuelUsedLitres')}
                  trailing="L"
                />
              </Field>
              <Field label="Max speed" hint="Optional">
                <Input type="number" inputMode="numeric" value={values.maxSpeedKph} onChange={set('maxSpeedKph')} trailing="km/h" />
              </Field>
            </Box>
          </>
        ) : null}
        {status === 'CANCELLED' ? (
          <Field label="Reason" required>
            <Textarea
              rows={3}
              value={values.reason}
              onChange={set('reason')}
              autoFocus
              placeholder="Client cancelled, vehicle reallocated, flight delayed…"
            />
          </Field>
        ) : null}
      </Stack>
    </Dialog>
  )
}
