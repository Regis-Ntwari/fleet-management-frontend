import { useState } from 'react'
import Stack from '@mui/material/Stack'
import { http } from '@/api/client'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { InlineAlert } from '@/components/ui/Feedback'
import { toInputDateTime } from '@/utils/format'

const PURPOSES = ['Pool assignment', 'Dedicated client driver', 'VIP protocol driver', 'Safari season', 'Depot shuttle', 'Temporary cover']

/** Assign a driver to a vehicle. Either side can be fixed by the caller. */
export function AssignDriverDialog({ open, onClose, vehicleId: fixedVehicleId, driverId: fixedDriverId, onAssigned }) {
  const [vehicleId, setVehicleId] = useState(fixedVehicleId ?? null)
  const [driverId, setDriverId] = useState(fixedDriverId ?? null)
  const [purpose, setPurpose] = useState('Pool assignment')
  const [startAt, setStartAt] = useState(toInputDateTime(new Date()))
  const [comments, setComments] = useState('')
  const [error, setError] = useState(null)
  const vehicles = useVehicleOptions({ status: 'AVAILABLE,RESERVED' })
  const drivers = useDriverOptions({ status: 'AVAILABLE' })

  const assign = useApiMutation({
    mutationFn: (body) => http.post('/assignments', body),
    invalidate: [['assignments'], ['vehicles'], ['drivers'], ['dashboard'], ['dispatch']],
    success: (a) => `${a.driverName} assigned to ${a.vehiclePlate}`,
    onSuccess: (a) => {
      onAssigned?.(a)
      onClose()
    },
  })

  const submit = async () => {
    setError(null)
    try {
      await assign.mutateAsync({ vehicleId, driverId, purpose, startAt: startAt ? new Date(startAt).toISOString() : undefined, comments })
    } catch (e) {
      setError(e)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Assign driver"
      description="The vehicle must be available with valid documents; the driver must be free with a valid licence."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={assign.isPending} disabled={!vehicleId || !driverId || !purpose.trim()}>
            Assign
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
        {!fixedVehicleId ? (
          <Field label="Vehicle" required>
            <Combobox
              options={vehicles.options}
              value={vehicleId}
              onChange={setVehicleId}
              loading={vehicles.isLoading}
              placeholder="Choose an available vehicle"
            />
          </Field>
        ) : null}
        {!fixedDriverId ? (
          <Field label="Driver" required>
            <Combobox
              options={drivers.options}
              value={driverId}
              onChange={setDriverId}
              loading={drivers.isLoading}
              placeholder="Choose an available driver"
            />
          </Field>
        ) : null}
        <Field label="Purpose" required htmlFor="assign-purpose">
          <SuggestInput
            id="assign-purpose"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
            suggestions={PURPOSES}
            autoFocus={Boolean(fixedVehicleId && fixedDriverId)}
          />
        </Field>
        <Field label="Start" htmlFor="assign-start" hint="Odometer at assignment is taken from the vehicle automatically.">
          <Input id="assign-start" type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} />
        </Field>
        <Field label="Comments" htmlFor="assign-comments">
          <Textarea id="assign-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>
      </Stack>
    </Dialog>
  )
}

export function EndAssignmentDialog({ open, onClose, assignment, onEnded }) {
  const [odometer, setOdometer] = useState('')
  const [comments, setComments] = useState('')
  const [error, setError] = useState(null)
  const end = useApiMutation({
    mutationFn: (body) => http.patch(`/assignments/${assignment.id}/end`, body),
    invalidate: [['assignments'], ['vehicles'], ['drivers'], ['dashboard'], ['dispatch']],
    success: 'Assignment ended',
    onSuccess: (a) => {
      onEnded?.(a)
      onClose()
    },
  })
  if (!assignment) return null
  const submit = async () => {
    setError(null)
    try {
      await end.mutateAsync({ odometerAtEnd: odometer, comments })
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`End assignment · ${assignment.vehiclePlate}`}
      description={`${assignment.driverName} will be released and the vehicle returns to the pool.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={end.isPending}>
            End assignment
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field
          label="Odometer at return"
          htmlFor="end-odo"
          hint={`Leave blank to use the vehicle's current reading. Started at ${assignment.odometerAtStart.toLocaleString()} km.`}
        >
          <Input
            id="end-odo"
            type="number"
            inputMode="numeric"
            value={odometer}
            onChange={(e) => setOdometer(e.target.value)}
            trailing="km"
            autoFocus
          />
        </Field>
        <Field label="Comments" htmlFor="end-comments">
          <Textarea id="end-comments" rows={2} value={comments} onChange={(e) => setComments(e.target.value)} />
        </Field>
      </Stack>
    </Dialog>
  )
}
