import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, useVehicleOptions } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { Button, IconButton } from '@/components/ui/Button'
import { ErrorState, PageSpinner } from '@/components/ui/Feedback'
import { formatCurrency, formatKm, toInputDateTime } from '@/utils/format'
import { TECHNICIANS, WORKSHOPS } from '@/api/mock/data'

const schema = z.object({
  vehicleId: z.coerce.number().int().positive('Choose a vehicle'),
  complaint: z.string().trim().min(5, 'Describe the complaint'),
  type: z.string().min(1, 'Choose a type'),
  workshop: z.string().trim().min(2, 'Workshop is required'),
  technicianName: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  expectedCompletionAt: z
    .string()
    .optional()
    .transform((v) => v || null),
  odometerKm: z.coerce.number().min(0, 'Enter the odometer'),
  diagnosis: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  servicePerformed: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  laborCost: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0, 'Cannot be negative')),
  otherCost: z.preprocess((v) => (v === '' || v == null ? 0 : Number(v)), z.number().min(0, 'Cannot be negative')),
  parts: z.array(
    z.object({
      partId: z.coerce.number().int().positive('Choose a part'),
      quantity: z.coerce.number().int('Whole number').min(1, 'At least 1'),
    }),
  ),
  comments: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
})

export default function MaintenanceFormPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const types = useOptions('maintenanceType')
  const vehicles = useVehicleOptions()
  const parts = useQuery({ queryKey: ['parts', 'all'], queryFn: () => http.get('/spare-parts', { params: { size: 100 } }) })
  const existing = useQuery({ queryKey: ['maintenance', 'detail', id], queryFn: () => http.get(`/maintenance/${id}`), enabled: isEdit })
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
      complaint: '',
      type: 'CORRECTIVE',
      workshop: WORKSHOPS[0],
      technicianName: '',
      expectedCompletionAt: '',
      odometerKm: '',
      diagnosis: '',
      servicePerformed: '',
      laborCost: '',
      otherCost: '',
      parts: [],
      comments: '',
    },
    mode: 'onBlur',
  })
  const partsArray = useFieldArray({ control, name: 'parts' })

  useEffect(() => {
    if (existing.data) {
      const m = existing.data
      reset({
        vehicleId: m.vehicleId,
        complaint: m.complaint,
        type: m.type,
        workshop: m.workshop,
        technicianName: m.technicianName ?? '',
        expectedCompletionAt: m.expectedCompletionAt ? toInputDateTime(m.expectedCompletionAt) : '',
        odometerKm: m.odometerKm,
        diagnosis: m.diagnosis ?? '',
        servicePerformed: m.servicePerformed ?? '',
        laborCost: m.laborCost,
        otherCost: m.otherCost,
        parts: m.parts.map((p) => ({ partId: p.partId, quantity: p.quantity })),
        comments: m.comments ?? '',
      })
    }
  }, [existing.data, reset])

  const vehicleId = watch('vehicleId')
  const vehicleDetail = useQuery({
    queryKey: ['vehicles', 'detail', String(vehicleId)],
    queryFn: () => http.get(`/vehicles/${vehicleId}`),
    enabled: Boolean(vehicleId) && !isEdit,
  })
  useEffect(() => {
    if (!isEdit && vehicleDetail.data) setValue('odometerKm', vehicleDetail.data.odometerKm)
  }, [vehicleDetail.data, isEdit, setValue])

  const partOptions = (parts.data?.content ?? []).map((p) => ({
    value: p.id,
    label: `${p.name}`,
    description: `${p.partNumber} · ${formatCurrency(p.unitCost)} · ${p.currentStock} in stock`,
    meta: p,
  }))
  const watchedParts = watch('parts')
  const partsCost = (watchedParts ?? []).reduce((s, p) => {
    const part = parts.data?.content?.find((x) => x.id === Number(p.partId))
    return s + (part ? part.unitCost * (Number(p.quantity) || 0) : 0)
  }, 0)
  const total = partsCost + (Number(watch('laborCost')) || 0) + (Number(watch('otherCost')) || 0)

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/maintenance/${id}`, values) : http.post('/maintenance', values)),
    invalidate: [['maintenance'], ['vehicles'], ['dashboard'], ['parts']],
    success: (m) => `${m.maintenanceNumber} ${isEdit ? 'updated' : 'reported'}`,
    setError,
    onSuccess: (m) => {
      reset(undefined, { keepValues: true })
      navigate(`/maintenance/${m.id}`, { replace: true })
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({
        ...values,
        expectedCompletionAt: values.expectedCompletionAt ? new Date(values.expectedCompletionAt).toISOString() : null,
      })
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  if (isEdit && existing.isLoading) return <PageSpinner />
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} />
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.maintenanceNumber}` : 'Report maintenance'}
      description="Parts are reserved from stock when work starts. Total cost = parts + labour + other."
      breadcrumbs={[
        { label: 'Maintenance', to: '/maintenance' },
        ...(isEdit ? [{ label: existing.data.maintenanceNumber, to: `/maintenance/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Report'}
      cancelTo={isEdit ? `/maintenance/${id}` : '/maintenance'}
      serverError={serverError}
    >
      <FormSection title="Job">
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
        <Field label="Type" htmlFor="type" required error={err('type')}>
          <Select id="type" {...register('type')} invalid={!!errors.type}>
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Complaint / problem" htmlFor="complaint" required error={err('complaint')} span>
          <Textarea
            id="complaint"
            rows={3}
            {...register('complaint')}
            invalid={!!errors.complaint}
            autoFocus={!isEdit && Boolean(search.get('vehicleId'))}
          />
        </Field>
        <Field label="Workshop" htmlFor="workshop" required error={err('workshop')}>
          <SuggestInput id="workshop" suggestions={WORKSHOPS} {...register('workshop')} invalid={!!errors.workshop} />
        </Field>
        <Field label="Technician" htmlFor="technicianName" error={err('technicianName')} hint="Required before work can start.">
          <SuggestInput id="technicianName" suggestions={TECHNICIANS} {...register('technicianName')} />
        </Field>
        <Field
          label="Odometer"
          htmlFor="odometerKm"
          required
          error={err('odometerKm')}
          hint={vehicleDetail.data ? `Vehicle reads ${formatKm(vehicleDetail.data.odometerKm)}` : undefined}
        >
          <Input
            id="odometerKm"
            type="number"
            inputMode="numeric"
            {...register('odometerKm')}
            invalid={!!errors.odometerKm}
            trailing="km"
          />
        </Field>
        <Field label="Expected completion" htmlFor="expectedCompletionAt" error={err('expectedCompletionAt')}>
          <Input id="expectedCompletionAt" type="datetime-local" {...register('expectedCompletionAt')} />
        </Field>
      </FormSection>
      <FormSection title="Diagnosis & work" description="Fill in as the job progresses. Service performed is required to complete the job.">
        <Field label="Diagnosis" htmlFor="diagnosis" span>
          <Textarea id="diagnosis" rows={3} {...register('diagnosis')} />
        </Field>
        {isEdit ? (
          <Field label="Service performed" htmlFor="servicePerformed" span>
            <Textarea id="servicePerformed" rows={3} {...register('servicePerformed')} />
          </Field>
        ) : null}
      </FormSection>
      <FormSection title="Parts & cost" description={`Parts ${formatCurrency(partsCost)} · total ${formatCurrency(total)}`}>
        <Stack spacing={1} sx={{ gridColumn: { sm: '1 / -1' } }}>
          {partsArray.fields.map((f, idx) => (
            <Box key={f.id} sx={{ display: 'grid', gridTemplateColumns: '1fr 96px 36px', alignItems: 'start', gap: 1 }}>
              <Field error={errors.parts?.[idx]?.partId?.message}>
                <Controller
                  control={control}
                  name={`parts.${idx}.partId`}
                  render={({ field }) => (
                    <Combobox
                      options={partOptions}
                      value={field.value}
                      onChange={field.onChange}
                      loading={parts.isLoading}
                      placeholder="Choose a part"
                      invalid={!!errors.parts?.[idx]?.partId}
                    />
                  )}
                />
              </Field>
              <Field error={errors.parts?.[idx]?.quantity?.message}>
                <Input type="number" inputMode="numeric" min={1} {...register(`parts.${idx}.quantity`)} aria-label="Quantity" />
              </Field>
              <IconButton label="Remove part" icon={DeleteIcon} onClick={() => partsArray.remove(idx)} />
            </Box>
          ))}
          <Button size="sm" icon={AddIcon} onClick={() => partsArray.append({ partId: '', quantity: 1 })} sx={{ alignSelf: 'flex-start' }}>
            Add part
          </Button>
        </Stack>
        <Field label="Labour cost" htmlFor="laborCost" error={err('laborCost')}>
          <Input id="laborCost" type="number" inputMode="numeric" {...register('laborCost')} trailing="RWF" />
        </Field>
        <Field label="Other costs" htmlFor="otherCost" error={err('otherCost')}>
          <Input id="otherCost" type="number" inputMode="numeric" {...register('otherCost')} trailing="RWF" />
        </Field>
        <Field label="Comments" htmlFor="comments" span>
          <Textarea id="comments" rows={2} {...register('comments')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
