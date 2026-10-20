import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { http } from '@/api/client'
import { useApiMutation } from '@/features/common/hooks'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'
import { formatKm } from '@/utils/format'

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

/**
 * Moves a trip through its lifecycle (dispatch, start, complete, cancel). Shared by the trip
 * detail screen and the driver workspace, where a driver only ever starts and completes.
 * `status` is the target status; null keeps the dialog closed.
 */
export function TripTransitionDialog({ trip, status, vehicle, onClose, onDone }) {
  const [values, setValues] = useState({ startOdometer: '', endOdometer: '', fuelUsedLitres: '', maxSpeedKph: '', reason: '' })
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/trips/${trip.id}/status`, body),
    invalidate: [['trips'], ['vehicles'], ['drivers'], ['bookings'], ['dashboard'], ['dispatch'], ['me']],
    success: (t) => `Trip ${t.tripNumber} is now ${t.status.toLowerCase().replace('_', ' ')}`,
    onSuccess: (t) => {
      onDone?.(t)
      onClose()
    },
  })
  if (!status || !trip) return null
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
      {/* useFlexGap so the negative margin on the distance note can pull it closer to the field above. */}
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
