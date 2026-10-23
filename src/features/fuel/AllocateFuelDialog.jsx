import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { http } from '@/api/client'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field, Input, SuggestInput, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'
import { toInputDateTime } from '@/utils/format'
import { useSuggestions } from '@/app/ReferenceProvider'

const initialValues = (a, vehicleId) => ({
  vehicleId: a?.vehicleId ?? vehicleId ?? '',
  driverId: a?.driverId ?? '',
  litres: a?.litresAllocated ?? '',
  station: a?.station ?? '',
  dueAt: a?.dueAt ? toInputDateTime(a.dueAt) : '',
  purpose: a?.purpose ?? '',
  notes: a?.notes ?? '',
})

/**
 * The fleet officer tells a driver how much fuel to put in a vehicle. The driver is pre-filled
 * from the vehicle's current assignment; the allocation lands in the driver's workspace.
 */
export function AllocateFuelDialog({ open, onClose, allocation, defaultVehicleId, onSaved }) {
  // Mounted only while open so every opening starts from a clean form.
  return open ? <AllocateFuelForm onClose={onClose} allocation={allocation} defaultVehicleId={defaultVehicleId} onSaved={onSaved} /> : null
}

function AllocateFuelForm({ onClose, allocation, defaultVehicleId, onSaved }) {
  const stations = useSuggestions('fuelStation')
  const isEdit = Boolean(allocation)
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [values, setValues] = useState(() => initialValues(allocation, defaultVehicleId))
  const [error, setError] = useState(null)

  const vehicle = useQuery({
    queryKey: ['vehicles', 'detail', String(values.vehicleId)],
    queryFn: () => http.get(`/vehicles/${values.vehicleId}`),
    enabled: Boolean(values.vehicleId) && !isEdit,
  })
  // Until the officer picks someone else, the driver is whoever currently holds the vehicle.
  const driverId = values.driverId !== '' ? values.driverId : (vehicle.data?.currentDriverId ?? '')

  const save = useApiMutation({
    mutationFn: (body) => (isEdit ? http.put(`/fuel/allocations/${allocation.id}`, body) : http.post('/fuel/allocations', body)),
    invalidate: [['fuel'], ['notifications']],
    success: (r) => (isEdit ? `${r.requestNumber} updated` : `${r.litresAllocated} L allocated to ${r.driverName}`),
    onSuccess: (r) => {
      onSaved?.(r)
      onClose()
    },
  })

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const fieldError = (k) => error?.fieldErrorMap?.[k]
  const submit = async () => {
    setError(null)
    try {
      await save.mutateAsync({ ...values, driverId, dueAt: values.dueAt ? new Date(values.dueAt).toISOString() : null })
    } catch (e) {
      setError(e)
    }
  }
  const noDriver = Boolean(values.vehicleId) && !isEdit && vehicle.data && !vehicle.data.currentDriverId

  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${allocation.requestNumber}` : 'Allocate fuel'}
      description={
        isEdit
          ? 'The driver is told about the change. Only allocations still awaiting a fill-up can be edited.'
          : 'The driver sees the allocation in their workspace, fills up and submits the receipt for you to verify.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>
            {isEdit ? 'Save changes' : 'Allocate fuel'}
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
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <Field label="Vehicle" required error={fieldError('vehicleId')}>
            <Combobox
              options={vehicles.options}
              value={values.vehicleId}
              onChange={(v) => setValues((s) => ({ ...s, vehicleId: v ?? '', driverId: '' }))}
              loading={vehicles.isLoading}
              invalid={!!fieldError('vehicleId')}
              disabled={isEdit}
              placeholder="Search by plate"
              autoFocus={!isEdit}
            />
          </Field>
          <Field
            label="Driver"
            required
            error={fieldError('driverId')}
            hint={noDriver ? 'This vehicle has no current driver; pick who will fill up.' : 'Defaults to the vehicle’s current driver.'}
          >
            <Combobox
              options={drivers.options}
              value={driverId}
              onChange={(v) => setValues((s) => ({ ...s, driverId: v ?? '' }))}
              loading={drivers.isLoading}
              invalid={!!fieldError('driverId')}
              disabled={isEdit}
            />
          </Field>
          <Field label="Litres to fill" required error={fieldError('litres')} hint="The driver may go up to 10% over to top the tank off.">
            <Input
              type="number"
              inputMode="decimal"
              step="0.5"
              value={values.litres}
              onChange={set('litres')}
              trailing="L"
              invalid={!!fieldError('litres')}
            />
          </Field>
          <Field label="Station" error={fieldError('station')} hint="Optional. Leave empty to let the driver choose.">
            <SuggestInput suggestions={stations} value={values.station} onChange={set('station')} />
          </Field>
          <Field label="Fill up by" error={fieldError('dueAt')} hint="Optional deadline.">
            <Input type="datetime-local" value={values.dueAt} onChange={set('dueAt')} invalid={!!fieldError('dueAt')} />
          </Field>
          <Field label="Purpose" error={fieldError('purpose')}>
            <Input value={values.purpose} onChange={set('purpose')} placeholder="Airport transfers this week" />
          </Field>
        </Box>
        <Field label="Note to the driver" hint="Optional">
          <Textarea rows={2} value={values.notes} onChange={set('notes')} />
        </Field>
      </Stack>
    </Dialog>
  )
}
