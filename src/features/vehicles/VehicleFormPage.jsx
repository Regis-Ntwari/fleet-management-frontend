import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Box from '@mui/material/Box'
import { http } from '@/api/client'
import { useCategoryOptions, useOptions } from '@/app/ReferenceProvider'
import { useApiMutation } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { ErrorState, PageSpinner, InlineAlert } from '@/components/ui/Feedback'
import { formatKm } from '@/utils/format'

const currentYear = new Date().getFullYear()
const optionalNumber = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0, 'Cannot be negative').nullable())
const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => v || null)

const schema = z.object({
  plateNumber: z
    .string()
    .trim()
    .min(3, 'Plate number is required')
    .regex(/^[A-Za-z]{2,3}\s?\d{3}\s?[A-Za-z]$/, 'Use the Rwandan format, e.g. RAD 123 A'),
  fleetNumber: z.string().trim().min(2, 'Fleet number is required'),
  make: z.string().trim().min(1, 'Make is required'),
  model: z.string().trim().min(1, 'Model is required'),
  year: z.coerce
    .number()
    .int('Whole year')
    .min(1990, 'From 1990 onwards')
    .max(currentYear + 1, `No later than ${currentYear + 1}`),
  categoryId: z.coerce.number().int().positive('Choose a category'),
  bodyType: optionalText,
  fuelType: z.string().min(1, 'Choose a fuel type'),
  transmission: z.string().min(1, 'Choose a transmission'),
  engineNumber: optionalText,
  vin: z
    .string()
    .trim()
    .optional()
    .or(z.literal(''))
    .refine((v) => !v || v.length === 17, 'A VIN has exactly 17 characters')
    .transform((v) => v || null),
  color: z.string().trim().min(1, 'Colour is required'),
  odometerKm: z.coerce.number().min(0, 'Cannot be negative').max(3_000_000, 'Unrealistic value'),
  seatingCapacity: z.coerce.number().int('Whole number').min(1, 'At least 1').max(80, 'At most 80'),
  purchaseDate: optionalText,
  acquisitionCost: optionalNumber,
  insurer: optionalText,
  insurancePolicyNumber: optionalText,
  insuranceExpiry: optionalText,
  department: optionalText,
  status: z.string().min(1, 'Choose a status'),
  notes: optionalText,
  odometerCorrectionReason: optionalText,
})

const EMPTY = {
  plateNumber: '',
  fleetNumber: '',
  make: '',
  model: '',
  year: currentYear,
  categoryId: '',
  bodyType: '',
  fuelType: 'DIESEL',
  transmission: 'AUTOMATIC',
  engineNumber: '',
  vin: '',
  color: '',
  odometerKm: 0,
  seatingCapacity: 5,
  purchaseDate: '',
  acquisitionCost: '',
  insurer: '',
  insurancePolicyNumber: '',
  insuranceExpiry: '',
  department: '',
  status: 'AVAILABLE',
  notes: '',
  odometerCorrectionReason: '',
}

export default function VehicleFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const categories = useCategoryOptions()
  const fuelTypes = useOptions('fuelType')
  const transmissions = useOptions('transmission')
  const statuses = useOptions('vehicle')
  const departments = useQuery({ queryKey: ['vehicles', 'departments'], queryFn: () => http.get('/vehicles/departments') })
  const existing = useQuery({ queryKey: ['vehicles', 'detail', id], queryFn: () => http.get(`/vehicles/${id}`), enabled: isEdit })
  const [serverError, setServerError] = useState(null)

  const form = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: 'onBlur' })
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = form

  useEffect(() => {
    if (existing.data) {
      const v = existing.data
      reset({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, v[k] ?? ''])), odometerCorrectionReason: '' })
    }
  }, [existing.data, reset])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/vehicles/${id}`, values) : http.post('/vehicles', values)),
    invalidate: [['vehicles'], ['dashboard'], ['reference']],
    success: (v) => `${v.plateNumber} ${isEdit ? 'updated' : 'added to the fleet'}`,
    setError,
    onSuccess: (v) => {
      reset(undefined, { keepValues: true })
      navigate(`/vehicles/${v.id}`, { replace: true })
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync(values)
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  if (isEdit && existing.isLoading) return <PageSpinner />
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} />

  const odometer = Number(watch('odometerKm'))
  const odometerDecreased = isEdit && existing.data && odometer < existing.data.odometerKm
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.plateNumber}` : 'Add vehicle'}
      description={
        isEdit
          ? 'Changes are audited. Operational history is never overwritten.'
          : 'Register a new vehicle in the fleet. Documents and service schedules can be added from the vehicle page.'
      }
      breadcrumbs={[
        { label: 'Vehicles', to: '/vehicles' },
        ...(isEdit ? [{ label: existing.data.plateNumber, to: `/vehicles/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Add vehicle'}
      cancelTo={isEdit ? `/vehicles/${id}` : '/vehicles'}
      serverError={serverError}
    >
      <FormSection title="Identity" description="Registration and fleet identifiers. Plate numbers must be unique.">
        <Field label="Plate number" htmlFor="plateNumber" required error={err('plateNumber')} hint="e.g. RAD 123 A">
          <Input id="plateNumber" {...register('plateNumber')} invalid={!!errors.plateNumber} uppercase autoFocus={!isEdit} />
        </Field>
        <Field label="Fleet number" htmlFor="fleetNumber" required error={err('fleetNumber')}>
          <Input id="fleetNumber" {...register('fleetNumber')} invalid={!!errors.fleetNumber} uppercase />
        </Field>
        <Field label="Make" htmlFor="make" required error={err('make')}>
          <Input id="make" {...register('make')} invalid={!!errors.make} />
        </Field>
        <Field label="Model" htmlFor="model" required error={err('model')}>
          <Input id="model" {...register('model')} invalid={!!errors.model} />
        </Field>
        <Field label="Year" htmlFor="year" required error={err('year')}>
          <Input id="year" type="number" inputMode="numeric" {...register('year')} invalid={!!errors.year} />
        </Field>
        <Field label="Category" htmlFor="categoryId" required error={err('categoryId')}>
          <Select id="categoryId" {...register('categoryId')} invalid={!!errors.categoryId} placeholder="Choose a category">
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Colour" htmlFor="color" required error={err('color')}>
          <Input id="color" {...register('color')} invalid={!!errors.color} />
        </Field>
        <Field label="Body type" htmlFor="bodyType" error={err('bodyType')}>
          <Input id="bodyType" {...register('bodyType')} placeholder="Station wagon, saloon, coach…" />
        </Field>
      </FormSection>

      <FormSection title="Technical" description="Drivetrain, identifiers and capacity.">
        <Field label="Fuel type" htmlFor="fuelType" required error={err('fuelType')}>
          <Select id="fuelType" {...register('fuelType')} invalid={!!errors.fuelType}>
            {fuelTypes.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Transmission" htmlFor="transmission" required error={err('transmission')}>
          <Select id="transmission" {...register('transmission')} invalid={!!errors.transmission}>
            {transmissions.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Engine number" htmlFor="engineNumber" error={err('engineNumber')}>
          <Input id="engineNumber" {...register('engineNumber')} />
        </Field>
        <Field label="Chassis / VIN" htmlFor="vin" error={err('vin')} hint="17 characters">
          <Input id="vin" {...register('vin')} invalid={!!errors.vin} mono uppercase maxLength={17} />
        </Field>
        <Field label="Seating capacity" htmlFor="seatingCapacity" required error={err('seatingCapacity')}>
          <Input
            id="seatingCapacity"
            type="number"
            inputMode="numeric"
            {...register('seatingCapacity')}
            invalid={!!errors.seatingCapacity}
          />
        </Field>
        <Field
          label="Odometer"
          htmlFor="odometerKm"
          required
          error={err('odometerKm')}
          hint={isEdit ? `Currently ${formatKm(existing.data.odometerKm)}` : undefined}
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
        {odometerDecreased ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="warning" title="Odometer is lower than the current reading">
              Odometer values normally only increase. If the previous reading was wrong, give a reason so the correction is recorded in the
              audit log.
            </InlineAlert>
            <Field
              label="Correction reason"
              htmlFor="odometerCorrectionReason"
              sx={{ mt: 1.5 }}
              required
              error={err('odometerCorrectionReason')}
            >
              <Input
                id="odometerCorrectionReason"
                {...register('odometerCorrectionReason')}
                placeholder="e.g. Cluster replaced on 12 Mar; reading reset"
              />
            </Field>
          </Box>
        ) : null}
      </FormSection>

      <FormSection
        title="Acquisition & insurance"
        description="Used for cost reporting and compliance alerts. Insurance certificates are tracked under Documents."
      >
        <Field label="Purchase date" htmlFor="purchaseDate" error={err('purchaseDate')}>
          <Input id="purchaseDate" type="date" {...register('purchaseDate')} />
        </Field>
        <Field label="Acquisition cost" htmlFor="acquisitionCost" error={err('acquisitionCost')}>
          <Input id="acquisitionCost" type="number" inputMode="numeric" {...register('acquisitionCost')} trailing="RWF" />
        </Field>
        <Field label="Insurer" htmlFor="insurer" error={err('insurer')}>
          <Input id="insurer" {...register('insurer')} />
        </Field>
        <Field label="Policy number" htmlFor="insurancePolicyNumber" error={err('insurancePolicyNumber')}>
          <Input id="insurancePolicyNumber" {...register('insurancePolicyNumber')} />
        </Field>
        <Field label="Insurance expiry" htmlFor="insuranceExpiry" error={err('insuranceExpiry')}>
          <Input id="insuranceExpiry" type="date" {...register('insuranceExpiry')} />
        </Field>
        <Field label="Department" htmlFor="department" error={err('department')}>
          <SuggestInput id="department" suggestions={departments.data ?? []} {...register('department')} />
        </Field>
      </FormSection>

      <FormSection
        title="Operational"
        description="Status is normally driven by assignments, trips and maintenance. Change it here only for exceptional cases."
      >
        <Field label="Operational status" htmlFor="status" required error={err('status')}>
          <Select id="status" {...register('status')} invalid={!!errors.status}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="notes" error={err('notes')} span>
          <Textarea id="notes" rows={3} {...register('notes')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
