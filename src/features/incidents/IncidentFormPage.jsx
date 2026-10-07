import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Box from '@mui/material/Box'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ErrorState, PageSpinner, InlineAlert } from '@/components/ui/Feedback'
import { toInputDateTime } from '@/utils/format'
import { LOCATIONS } from '@/api/mock/data'

const schema = z.object({
  vehicleId: z.coerce.number().int().positive('Choose a vehicle'),
  driverId: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().nullable()),
  occurredAt: z
    .string()
    .min(1, 'Date and time are required')
    .refine((v) => new Date(v) <= new Date(), 'Cannot be in the future'),
  location: z.string().trim().min(2, 'Location is required'),
  type: z.string().min(1, 'Choose a type'),
  severity: z.string().min(1, 'Choose a severity'),
  description: z.string().trim().min(10, 'Describe what happened (at least 10 characters)'),
  investigation: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  correctiveAction: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  estimatedCost: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0, 'Cannot be negative').nullable()),
})

export default function IncidentFormPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const types = useOptions('incidentType')
  const severities = useOptions('severity')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const existing = useQuery({ queryKey: ['incidents', 'detail', id], queryFn: () => http.get(`/incidents/${id}`), enabled: isEdit })
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicleId: search.get('vehicleId') ?? '',
      driverId: '',
      occurredAt: toInputDateTime(new Date()),
      location: '',
      type: '',
      severity: 'MEDIUM',
      description: '',
      investigation: '',
      correctiveAction: '',
      estimatedCost: '',
    },
    mode: 'onBlur',
  })
  useEffect(() => {
    if (existing.data) {
      const i = existing.data
      reset({
        vehicleId: i.vehicleId,
        driverId: i.driverId ?? '',
        occurredAt: toInputDateTime(i.occurredAt),
        location: i.location,
        type: i.type,
        severity: i.severity,
        description: i.description,
        investigation: i.investigation ?? '',
        correctiveAction: i.correctiveAction ?? '',
        estimatedCost: i.estimatedCost ?? '',
      })
    }
  }, [existing.data, reset])

  const vehicleId = watch('vehicleId')
  useEffect(() => {
    if (isEdit) return
    const d = drivers.options.find((o) => String(o.meta.currentVehicleId) === String(vehicleId))
    if (d && !watch('driverId')) setValue('driverId', d.value)
  }, [vehicleId, drivers.options, isEdit, setValue, watch])

  const type = watch('type')
  const severity = watch('severity')

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/incidents/${id}`, values) : http.post('/incidents', values)),
    invalidate: [['incidents'], ['vehicles'], ['dashboard'], ['alerts']],
    success: (i) => `${i.incidentNumber} ${isEdit ? 'updated' : 'reported'}`,
    setError,
    onSuccess: (i) => {
      reset(undefined, { keepValues: true })
      navigate(`/incidents/${i.id}`, { replace: true })
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({ ...values, occurredAt: new Date(values.occurredAt).toISOString() })
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  if (isEdit && existing.isLoading) return <PageSpinner />
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} />
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.incidentNumber}` : 'Report incident'}
      description="Record the facts first. Investigation notes and corrective actions can be added as the case progresses."
      breadcrumbs={[
        { label: 'Incidents', to: '/incidents' },
        ...(isEdit ? [{ label: existing.data.incidentNumber, to: `/incidents/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Report incident'}
      cancelTo={isEdit ? `/incidents/${id}` : '/incidents'}
      serverError={serverError}
    >
      <FormSection title="What happened">
        <Field label="Vehicle" required error={err('vehicleId')}>
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <Combobox
                options={vehicles.options}
                value={field.value}
                onChange={field.onChange}
                loading={vehicles.isLoading}
                invalid={!!errors.vehicleId}
                disabled={isEdit}
                placeholder="Search by plate"
              />
            )}
          />
        </Field>
        <Field label="Driver" error={err('driverId')}>
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <Combobox
                options={drivers.options}
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                loading={drivers.isLoading}
                placeholder="If a driver was involved"
              />
            )}
          />
        </Field>
        <Field label="Date & time" htmlFor="occurredAt" required error={err('occurredAt')}>
          <Input
            id="occurredAt"
            type="datetime-local"
            max={toInputDateTime(new Date())}
            {...register('occurredAt')}
            invalid={!!errors.occurredAt}
          />
        </Field>
        <Field label="Location" htmlFor="location" required error={err('location')}>
          <SuggestInput id="location" suggestions={LOCATIONS} {...register('location')} invalid={!!errors.location} />
        </Field>
        <Field label="Type" htmlFor="type" required error={err('type')}>
          <Select id="type" {...register('type')} invalid={!!errors.type} placeholder="Choose type">
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Severity" htmlFor="severity" required error={err('severity')}>
          <Select id="severity" {...register('severity')} invalid={!!errors.severity}>
            {severities.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        {!isEdit && ['ACCIDENT', 'BREAKDOWN'].includes(type) && ['HIGH', 'CRITICAL'].includes(severity) ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="warning">
              A high-severity accident or breakdown automatically takes the vehicle out of service until the workshop clears it.
            </InlineAlert>
          </Box>
        ) : null}
        <Field label="Description" htmlFor="description" required error={err('description')} span>
          <Textarea id="description" rows={4} {...register('description')} invalid={!!errors.description} />
        </Field>
        <Field label="Estimated cost" htmlFor="estimatedCost" error={err('estimatedCost')}>
          <Input id="estimatedCost" type="number" inputMode="numeric" {...register('estimatedCost')} trailing="RWF" />
        </Field>
      </FormSection>
      {isEdit ? (
        <FormSection title="Follow-up" description="Also editable from the incident page when changing status.">
          <Field label="Investigation" htmlFor="investigation" span>
            <Textarea id="investigation" rows={3} {...register('investigation')} />
          </Field>
          <Field label="Corrective action" htmlFor="correctiveAction" span>
            <Textarea id="correctiveAction" rows={3} {...register('correctiveAction')} />
          </Field>
        </FormSection>
      ) : null}
    </FormPage>
  )
}
