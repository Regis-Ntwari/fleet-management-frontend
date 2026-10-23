import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { http } from '@/api/client'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { InlineAlert } from '@/components/ui/Feedback'
import { formatKm } from '@/utils/format'

/**
 * Replaces the vehicle on a dispatched or out deployment. The original keeps its history and is
 * marked "Replaced"; a new deployment is issued for the remaining days and dispatched at once.
 */
export function ReplaceDeploymentDialog({ deployment, open, onClose, onDone }) {
  if (!open || !deployment) return null
  return <ReplaceForm deployment={deployment} onClose={onClose} onDone={onDone} />
}

/** Mounted only while the dialog is open, so the form starts fresh for every deployment. */
function ReplaceForm({ deployment, onClose, onDone }) {
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const out = deployment.status === 'IN_PROGRESS'
  const [values, setValues] = useState(() => {
    const elapsed = out ? Math.max(1, Math.ceil((Date.now() - new Date(deployment.startedAt).getTime()) / 86_400_000)) : 0
    return {
      vehicleId: '',
      driverId: deployment.driverId,
      endOdometer: '',
      remainingDays: String(Math.max(1, deployment.effectiveDays - elapsed)),
      reason: '',
    }
  })
  const [error, setError] = useState(null)
  const replace = useApiMutation({
    mutationFn: (body) => http.post(`/deployments/${deployment.id}/replace`, body),
    invalidate: [['deployments'], ['vehicles'], ['drivers'], ['dashboard'], ['dispatch'], ['gate'], ['purchase-orders']],
    success: (r) => `${r.original.deploymentNumber} replaced by ${r.replacement.deploymentNumber}`,
    onSuccess: (r) => {
      onDone?.(r)
      onClose()
    },
  })
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const submit = async () => {
    setError(null)
    try {
      await replace.mutateAsync(values)
    } catch (e) {
      setError(e)
    }
  }
  const fe = (k) => error?.fieldErrorMap?.[k]
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Replace ${deployment.vehiclePlate}`}
      description={
        out
          ? `${deployment.vehiclePlate} is out on ${deployment.deploymentNumber}. Its return reading is recorded now and a new deployment is issued for the remaining days.`
          : `${deployment.deploymentNumber} keeps its history and is marked replaced; a new deployment is issued and dispatched for the replacement vehicle.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Back
          </Button>
          <Button variant="primary" onClick={submit} loading={replace.isPending} disabled={!values.vehicleId || !values.reason.trim()}>
            Replace vehicle
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error && !error.fieldErrors?.length ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        <Field label="Replacement vehicle" required error={fe('vehicleId')}>
          <Combobox
            options={vehicles.options.filter(
              (o) =>
                o.value !== deployment.vehicleId && !['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE', 'ON_TRIP'].includes(o.meta.status),
            )}
            value={values.vehicleId}
            onChange={(v) => setValues((x) => ({ ...x, vehicleId: v ?? '' }))}
            loading={vehicles.isLoading}
            placeholder="Search by plate or model"
            autoFocus
          />
        </Field>
        <Field label="Driver" error={fe('driverId')} hint="Keeps the current driver unless you choose another.">
          <Combobox
            options={drivers.options}
            value={values.driverId}
            onChange={(v) => setValues((x) => ({ ...x, driverId: v ?? '' }))}
            loading={drivers.isLoading}
            placeholder="Search by name"
          />
        </Field>
        <Box sx={{ display: 'grid', gridTemplateColumns: out ? 'repeat(2, 1fr)' : '1fr', gap: 1.5 }}>
          {out ? (
            <Field label="Return odometer" required hint={`Departed at ${formatKm(deployment.startOdometer)}`} error={fe('endOdometer')}>
              <Input
                type="number"
                inputMode="numeric"
                min={deployment.startOdometer}
                value={values.endOdometer}
                onChange={set('endOdometer')}
                trailing="km"
              />
            </Field>
          ) : null}
          <Field label="Remaining days" required hint={`Of ${deployment.effectiveDays} effective days.`} error={fe('remainingDays')}>
            <Input type="number" inputMode="numeric" min={1} value={values.remainingDays} onChange={set('remainingDays')} trailing="days" />
          </Field>
        </Box>
        <Field label="Reason" required error={fe('reason')}>
          <Textarea
            rows={3}
            value={values.reason}
            onChange={set('reason')}
            placeholder="Breakdown, accident, client request, maintenance due…"
          />
        </Field>
      </Stack>
    </Dialog>
  )
}
