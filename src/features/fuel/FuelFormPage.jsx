import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ErrorState, PageSpinner } from '@/components/ui/Feedback'
import { formatCurrency, formatKm, toInputDateTime } from '@/utils/format'
import { STATIONS } from '@/api/mock/data'

const schema = z.object({
  vehicleId: z.coerce.number().int().positive('Choose a vehicle'),
  driverId: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().int().nullable()),
  station: z.string().trim().min(2, 'Station is required'),
  transactedAt: z.string().min(1, 'Date and time are required'),
  fuelType: z.string().min(1, 'Choose a fuel type'),
  litres: z.coerce.number().positive('Litres must be greater than zero').max(1000, 'Not plausible for one fill'),
  pricePerLitre: z.coerce.number().positive('Price must be greater than zero'),
  odometerKm: z.coerce.number().min(0, 'Enter the odometer reading'),
  receiptNumber: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
})

export default function FuelFormPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const fuelTypes = useOptions('fuelType')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const existing = useQuery({ queryKey: ['fuel', 'detail', id], queryFn: () => http.get(`/fuel/${id}`), enabled: isEdit })
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
      station: '',
      transactedAt: toInputDateTime(new Date()),
      fuelType: 'DIESEL',
      litres: '',
      pricePerLitre: 1720,
      odometerKm: '',
      receiptNumber: '',
      notes: '',
    },
    mode: 'onBlur',
  })

  useEffect(() => {
    if (existing.data) {
      const f = existing.data
      reset({
        vehicleId: f.vehicleId,
        driverId: f.driverId ?? '',
        station: f.station,
        transactedAt: toInputDateTime(f.transactedAt),
        fuelType: f.fuelType,
        litres: f.litres,
        pricePerLitre: f.pricePerLitre,
        odometerKm: f.odometerKm,
        receiptNumber: f.receiptNumber ?? '',
        notes: f.notes ?? '',
      })
    }
  }, [existing.data, reset])

  const vehicleId = watch('vehicleId')
  const selected = vehicles.options.find((o) => String(o.value) === String(vehicleId))?.meta
  const vehicleDetail = useQuery({
    queryKey: ['vehicles', 'detail', String(vehicleId)],
    queryFn: () => http.get(`/vehicles/${vehicleId}`),
    enabled: Boolean(vehicleId),
  })

  useEffect(() => {
    if (!isEdit && vehicleDetail.data) {
      setValue('fuelType', vehicleDetail.data.fuelType === 'HYBRID' ? 'PETROL' : vehicleDetail.data.fuelType)
      setValue('odometerKm', vehicleDetail.data.odometerKm)
      if (vehicleDetail.data.currentDriverId) setValue('driverId', vehicleDetail.data.currentDriverId)
      setValue('pricePerLitre', vehicleDetail.data.fuelType === 'DIESEL' ? 1720 : 1790)
    }
  }, [vehicleDetail.data, isEdit, setValue])

  const litres = Number(watch('litres'))
  const price = Number(watch('pricePerLitre'))
  const total = litres > 0 && price > 0 ? Math.round(litres * price) : null

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/fuel/${id}`, values) : http.post('/fuel', values)),
    invalidate: [['fuel'], ['vehicles'], ['dashboard'], ['alerts']],
    success: (f) => `Fuel recorded for ${f.vehiclePlate}${f.anomaly ? ' (flagged for review)' : ''}`,
    setError,
    onSuccess: () => {
      reset(undefined, { keepValues: true })
      navigate('/fuel', { replace: true })
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({ ...values, transactedAt: new Date(values.transactedAt).toISOString() })
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  if (isEdit && existing.isLoading) return <PageSpinner />
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} />
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? 'Edit fuel transaction' : 'Record fuel'}
      description="Total cost and consumption are calculated for you. The odometer must not go backwards between fills."
      breadcrumbs={[{ label: 'Fuel', to: '/fuel' }, { label: isEdit ? 'Edit' : 'New' }]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Record fuel'}
      cancelTo="/fuel"
      serverError={serverError}
    >
      <FormSection title="Vehicle">
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
        <Field label="Driver" error={err('driverId')} hint="Defaults to the current driver.">
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <Combobox
                options={drivers.options}
                value={field.value}
                onChange={(v) => field.onChange(v ?? '')}
                loading={drivers.isLoading}
                placeholder="Optional"
              />
            )}
          />
        </Field>
      </FormSection>
      <FormSection title="Transaction">
        <Field label="Station" htmlFor="station" required error={err('station')}>
          <SuggestInput id="station" suggestions={STATIONS} {...register('station')} invalid={!!errors.station} />
        </Field>
        <Field label="Date & time" htmlFor="transactedAt" required error={err('transactedAt')}>
          <Input
            id="transactedAt"
            type="datetime-local"
            max={toInputDateTime(new Date())}
            {...register('transactedAt')}
            invalid={!!errors.transactedAt}
          />
        </Field>
        <Field label="Fuel type" htmlFor="fuelType" required error={err('fuelType')}>
          <Select id="fuelType" {...register('fuelType')} invalid={!!errors.fuelType}>
            {fuelTypes.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Receipt number"
          htmlFor="receiptNumber"
          error={err('receiptNumber')}
          hint="Duplicates for the same station are rejected."
        >
          <Input id="receiptNumber" {...register('receiptNumber')} />
        </Field>
        <Field label="Litres" htmlFor="litres" required error={err('litres')}>
          <Input id="litres" type="number" inputMode="decimal" step="0.01" {...register('litres')} invalid={!!errors.litres} trailing="L" />
        </Field>
        <Field label="Price per litre" htmlFor="pricePerLitre" required error={err('pricePerLitre')}>
          <Input
            id="pricePerLitre"
            type="number"
            inputMode="numeric"
            {...register('pricePerLitre')}
            invalid={!!errors.pricePerLitre}
            trailing="RWF"
          />
        </Field>
        <Field
          label="Odometer"
          htmlFor="odometerKm"
          required
          error={err('odometerKm')}
          hint={
            vehicleDetail.data
              ? `Vehicle currently reads ${formatKm(vehicleDetail.data.odometerKm)}`
              : selected
                ? 'Loading vehicle…'
                : undefined
          }
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
        <Field label="Total" hint="Calculated">
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              height: 36,
              px: 1.5,
              borderRadius: 1,
              border: 1,
              borderColor: 'divider',
              bgcolor: 'background.subtle',
              fontSize: 14,
              fontWeight: 500,
            }}
          >
            {total != null ? formatCurrency(total) : '—'}
          </Box>
        </Field>
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={2} {...register('notes')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
