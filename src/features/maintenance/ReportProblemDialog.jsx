import { useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, useVehicleOptions } from '@/features/common/hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Combobox } from '@/components/ui/Combobox'
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'
import { formatKm } from '@/utils/format'

const initial = (vehicle) => ({
  vehicleId: vehicle?.id ?? '',
  complaint: '',
  type: 'CORRECTIVE',
  odometerKm: vehicle?.odometerKm ?? '',
  urgent: false,
  comments: '',
})

/**
 * A driver reports a problem with the vehicle they are driving. The workshop is notified and a
 * maintenance record opens as "Reported". With `pickVehicle` office staff can report any vehicle.
 */
export function ReportProblemDialog({ open, onClose, vehicle, pickVehicle = false, onDone }) {
  // Mounted only while open so every report starts blank.
  return open ? <ReportProblemForm onClose={onClose} vehicle={vehicle} pickVehicle={pickVehicle} onDone={onDone} /> : null
}

function ReportProblemForm({ onClose, vehicle, pickVehicle, onDone }) {
  const types = useOptions('maintenanceType')
  const vehicles = useVehicleOptions({}, { enabled: pickVehicle })
  const [values, setValues] = useState(() => initial(vehicle))
  const [error, setError] = useState(null)

  const report = useApiMutation({
    mutationFn: (body) => http.post('/maintenance/report', body),
    invalidate: [['maintenance'], ['vehicles'], ['me'], ['dashboard'], ['alerts'], ['notifications']],
    success: (m) => `${m.vehiclePlate} reported to the workshop as ${m.maintenanceNumber}`,
    onSuccess: (m) => {
      onDone?.(m)
      onClose()
    },
  })

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const fieldError = (k) => error?.fieldErrorMap?.[k]
  const submit = async () => {
    setError(null)
    try {
      await report.mutateAsync(values)
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Report a problem"
      description={
        vehicle && !pickVehicle
          ? `${vehicle.plateNumber} · ${vehicle.make} ${vehicle.model}. The workshop is notified straight away.`
          : 'Opens a maintenance record and notifies the workshop.'
      }
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={values.urgent ? 'danger' : 'primary'} onClick={submit} loading={report.isPending}>
            {values.urgent ? 'Report as urgent' : 'Send to workshop'}
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
        {pickVehicle ? (
          <Field label="Vehicle" required error={fieldError('vehicleId')}>
            <Combobox
              options={vehicles.options}
              value={values.vehicleId}
              onChange={(v) => setValues((s) => ({ ...s, vehicleId: v ?? '' }))}
              loading={vehicles.isLoading}
              invalid={!!fieldError('vehicleId')}
              placeholder="Search by plate"
            />
          </Field>
        ) : null}
        <Field label="What is wrong?" required error={fieldError('complaint')}>
          <Textarea
            rows={3}
            value={values.complaint}
            onChange={set('complaint')}
            invalid={!!fieldError('complaint')}
            autoFocus
            placeholder="Brakes squeal when stopping, warning light on the dashboard, slow puncture rear left…"
          />
        </Field>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Field label="Type" error={fieldError('type')}>
            <Select value={values.type} onChange={set('type')}>
              {types.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Odometer" error={fieldError('odometerKm')} hint={vehicle ? `Last read ${formatKm(vehicle.odometerKm)}` : undefined}>
            <Input
              type="number"
              inputMode="numeric"
              value={values.odometerKm}
              onChange={set('odometerKm')}
              trailing="km"
              invalid={!!fieldError('odometerKm')}
            />
          </Field>
        </Box>
        <Box
          component="label"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 1.5,
            cursor: 'pointer',
            borderRadius: 1.5,
            border: 1,
            borderColor: values.urgent ? 'error.main' : 'edge.main',
            bgcolor: values.urgent ? 'soft.danger.bg' : 'transparent',
            px: 1.5,
            py: 1,
          }}
        >
          <Box component="span" sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 13.5, fontWeight: 500 }}>Not safe to drive</Typography>
            <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
              Takes the vehicle off the road now and alerts the workshop as urgent.
            </Typography>
          </Box>
          <Switch checked={values.urgent} onChange={(checked) => setValues((v) => ({ ...v, urgent: checked }))} label="Not safe to drive" />
        </Box>
        <Field label="Anything else" hint="Optional">
          <Textarea rows={2} value={values.comments} onChange={set('comments')} />
        </Field>
      </Stack>
    </Dialog>
  )
}
