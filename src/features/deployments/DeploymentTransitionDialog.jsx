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
    title: 'Dispatch deployment',
    description: 'Confirms the vehicle and driver are released for this deployment. Documents and licence validity are re-checked.',
    confirm: 'Dispatch',
  },
  IN_PROGRESS: {
    title: 'Record departure',
    description: 'Record the odometer as the vehicle leaves the gate. Defaults to the vehicle’s current reading.',
    confirm: 'Record departure',
  },
  COMPLETED: {
    title: 'Record return',
    description: 'Enter the odometer as the vehicle returns to Kacyiru. Distance and duration are calculated automatically.',
    confirm: 'Record return',
  },
  CANCELLED: {
    title: 'Cancel deployment',
    description: 'The deployment is kept for the record and marked cancelled. A linked booking returns to confirmed.',
    confirm: 'Cancel deployment',
  },
  PLANNED: {
    title: 'Return to planned',
    description: 'Undo the dispatch so the deployment can be edited again.',
    confirm: 'Return to planned',
  },
}

/**
 * Moves a deployment through its lifecycle (dispatch, depart, return, cancel). Shared by the
 * deployment detail screen, the gate and the driver workspace, where only departure and return
 * are recorded. `status` is the target status; null keeps the dialog closed.
 */
export function DeploymentTransitionDialog({ deployment, status, vehicle, onClose, onDone }) {
  const [values, setValues] = useState({ startOdometer: '', endOdometer: '', fuelUsedLitres: '', maxSpeedKph: '', reason: '' })
  const [error, setError] = useState(null)
  const change = useApiMutation({
    mutationFn: (body) => http.patch(`/deployments/${deployment.id}/status`, body),
    invalidate: [
      ['deployments'],
      ['vehicles'],
      ['drivers'],
      ['bookings'],
      ['dashboard'],
      ['dispatch'],
      ['me'],
      ['gate'],
      ['purchase-orders'],
    ],
    success: (t) =>
      t.status === 'IN_PROGRESS'
        ? `${t.vehiclePlate} departed on ${t.deploymentNumber}`
        : t.status === 'COMPLETED'
          ? `${t.vehiclePlate} returned · ${formatKm(t.distanceKm)}`
          : `Deployment ${t.deploymentNumber} is now ${t.status.toLowerCase().replace('_', ' ')}`,
    onSuccess: (t) => {
      onDone?.(t)
      onClose()
    },
  })
  if (!status || !deployment) return null
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
  const lowerThanStart = status === 'COMPLETED' && values.endOdometer !== '' && Number(values.endOdometer) < deployment.startOdometer
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
        <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>
          <Box component="span" sx={{ fontFamily: (t) => t.typography.fontFamilyMono, color: 'text.primary' }}>
            {deployment.deploymentNumber}
          </Box>
          {' · '}
          {deployment.vehiclePlate} · {deployment.driverName}
        </Typography>
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
              hint={`Departed at ${formatKm(deployment.startOdometer)}`}
              error={
                error?.fieldErrorMap?.endOdometer ??
                (lowerThanStart ? 'Lower than the departure reading. Check it with the driver.' : undefined)
              }
            >
              <Input
                type="number"
                inputMode="numeric"
                min={deployment.startOdometer}
                value={values.endOdometer}
                onChange={set('endOdometer')}
                trailing="km"
                invalid={lowerThanStart}
                autoFocus
              />
            </Field>
            {values.endOdometer && Number(values.endOdometer) >= deployment.startOdometer ? (
              <Typography sx={{ mt: -1, fontSize: 12.5, color: 'text.muted' }}>
                Distance will be recorded as{' '}
                <Box component="span" sx={{ fontWeight: 500, color: 'text.primary' }}>
                  {formatKm(Number(values.endOdometer) - deployment.startOdometer)}
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
              placeholder="Client cancelled, vehicle reallocated, mission postponed…"
            />
          </Field>
        ) : null}
      </Stack>
    </Dialog>
  )
}

/** @deprecated kept so older imports keep working during the rename. */
export const TripTransitionDialog = DeploymentTransitionDialog
