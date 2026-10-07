import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { http } from '@/api/client'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ErrorState, PageSpinner, InlineAlert } from '@/components/ui/Feedback'
import { toInputDateTime } from '@/utils/format'
import { LOCATIONS, TRIP_PURPOSES } from '@/api/mock/data'

const schema = z.object({
  vehicleId: z.coerce.number().int().positive('Choose a vehicle'),
  driverId: z.coerce.number().int().positive('Choose a driver'),
  customerName: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
  bookingId: z.coerce.number().int().optional().nullable(),
  startLocation: z.string().trim().min(2, 'Start location is required'),
  destination: z.string().trim().min(2, 'Destination is required'),
  scheduledStartAt: z.string().min(1, 'Scheduled start is required'),
  purpose: z.string().trim().min(2, 'Purpose is required'),
  passengers: z.coerce.number().int('Whole number').min(0, 'Cannot be negative'),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
})

export default function TripFormPage() {
  const { id } = useParams()
  const [search] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['trips', 'detail', id], queryFn: () => http.get(`/trips/${id}`), enabled: isEdit })
  const bookingId = search.get('bookingId')
  const booking = useQuery({
    queryKey: ['bookings', 'detail', bookingId],
    queryFn: () => http.get(`/bookings/${bookingId}`),
    enabled: Boolean(bookingId) && !isEdit,
  })
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [serverError, setServerError] = useState(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      vehicleId: search.get('vehicleId') ?? '',
      driverId: search.get('driverId') ?? '',
      customerName: '',
      bookingId: bookingId ?? null,
      startLocation: '',
      destination: '',
      scheduledStartAt: toInputDateTime(new Date(Date.now() + 3600_000)),
      purpose: '',
      passengers: 1,
      notes: '',
    },
    mode: 'onBlur',
  })
  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = form

  useEffect(() => {
    if (existing.data) {
      const t = existing.data
      reset({
        vehicleId: t.vehicleId,
        driverId: t.driverId,
        customerName: t.customerName ?? '',
        bookingId: t.bookingId,
        startLocation: t.startLocation,
        destination: t.destination,
        scheduledStartAt: toInputDateTime(t.scheduledStartAt),
        purpose: t.purpose,
        passengers: t.passengers,
        notes: t.notes ?? '',
      })
    }
  }, [existing.data, reset])

  useEffect(() => {
    if (booking.data && !isEdit) {
      const b = booking.data
      reset({
        vehicleId: b.vehicleId ?? '',
        driverId: b.driverId ?? '',
        customerName: b.company ?? b.customerName,
        bookingId: b.id,
        startLocation: b.pickupLocation,
        destination: b.dropoffLocation,
        scheduledStartAt: toInputDateTime(b.pickupAt),
        purpose: b.serviceType,
        passengers: b.passengers,
        notes: b.notes ?? '',
      })
    }
  }, [booking.data, isEdit, reset])

  // When a vehicle with a current driver is chosen, suggest that driver.
  const vehicleId = watch('vehicleId')
  useEffect(() => {
    const v = vehicles.options.find((o) => String(o.value) === String(vehicleId))?.meta
    const d = drivers.options.find((o) => o.meta.currentVehicleId === v?.id)
    if (v && d && !watch('driverId')) setValue('driverId', d.value, { shouldDirty: true })
  }, [vehicleId, vehicles.options, drivers.options, setValue, watch])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/trips/${id}`, values) : http.post('/trips', values)),
    invalidate: [['trips'], ['bookings'], ['dashboard'], ['dispatch'], ['vehicles']],
    success: (t) => `Trip ${t.tripNumber} ${isEdit ? 'updated' : 'planned'}`,
    setError,
    onSuccess: (t) => {
      reset(undefined, { keepValues: true })
      navigate(`/trips/${t.id}`, { replace: true })
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({ ...values, scheduledStartAt: new Date(values.scheduledStartAt).toISOString() })
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  if (isEdit && existing.isLoading) return <PageSpinner />
  if (isEdit && existing.isError) return <ErrorState error={existing.error} onRetry={existing.refetch} />
  const selectedVehicle = vehicles.options.find((o) => String(o.value) === String(vehicleId))?.meta
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.tripNumber}` : 'Plan trip'}
      description="Start and end odometer readings are captured when the trip starts and completes; distance and duration are calculated for you."
      breadcrumbs={[
        { label: 'Trips', to: '/trips' },
        ...(isEdit ? [{ label: existing.data.tripNumber, to: `/trips/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Plan trip'}
      cancelTo={isEdit ? `/trips/${id}` : '/trips'}
      serverError={serverError}
    >
      {booking.data ? (
        <InlineAlert tone="info" title={`Linked to booking ${booking.data.bookingNumber}`}>
          Completing this trip will complete the booking.
        </InlineAlert>
      ) : null}
      <FormSection
        title="Resources"
        description="The vehicle must be in service with valid documents and the driver free with a valid licence. Conflicts are checked when you save."
      >
        <Field label="Vehicle" required error={err('vehicleId')}>
          <Controller
            control={control}
            name="vehicleId"
            render={({ field }) => (
              <Combobox
                options={vehicles.options.filter((o) => !['IN_MAINTENANCE', 'OUT_OF_SERVICE', 'INACTIVE'].includes(o.meta.status))}
                value={field.value}
                onChange={field.onChange}
                loading={vehicles.isLoading}
                invalid={!!errors.vehicleId}
                placeholder="Search by plate or model"
              />
            )}
          />
        </Field>
        <Field
          label="Driver"
          required
          error={err('driverId')}
          hint={selectedVehicle?.status === 'ASSIGNED' ? 'Suggested from the current assignment.' : undefined}
        >
          <Controller
            control={control}
            name="driverId"
            render={({ field }) => (
              <Combobox
                options={drivers.options}
                value={field.value}
                onChange={field.onChange}
                loading={drivers.isLoading}
                invalid={!!errors.driverId}
                placeholder="Search by name"
              />
            )}
          />
        </Field>
      </FormSection>
      <FormSection title="Journey">
        <Field label="Start location" htmlFor="startLocation" required error={err('startLocation')}>
          <SuggestInput id="startLocation" suggestions={LOCATIONS} {...register('startLocation')} invalid={!!errors.startLocation} />
        </Field>
        <Field label="Destination" htmlFor="destination" required error={err('destination')}>
          <SuggestInput id="destination" suggestions={LOCATIONS} {...register('destination')} invalid={!!errors.destination} />
        </Field>
        <Field label="Scheduled start" htmlFor="scheduledStartAt" required error={err('scheduledStartAt')}>
          <Input id="scheduledStartAt" type="datetime-local" {...register('scheduledStartAt')} invalid={!!errors.scheduledStartAt} />
        </Field>
        <Field label="Purpose" htmlFor="purpose" required error={err('purpose')}>
          <SuggestInput id="purpose" suggestions={TRIP_PURPOSES} {...register('purpose')} invalid={!!errors.purpose} />
        </Field>
        <Field
          label="Passengers"
          htmlFor="passengers"
          required
          error={err('passengers')}
          hint={selectedVehicle ? `${selectedVehicle.plateNumber} seats ${selectedVehicle.meta?.seatingCapacity ?? ''}`.trim() : undefined}
        >
          <Input id="passengers" type="number" inputMode="numeric" min={0} {...register('passengers')} invalid={!!errors.passengers} />
        </Field>
        <Field label="Customer / client" htmlFor="customerName" error={err('customerName')}>
          <Input id="customerName" {...register('customerName')} placeholder="Company or passenger name" />
        </Field>
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={3} {...register('notes')} placeholder="Flight numbers, special requests, contact on arrival…" />
        </Field>
      </FormSection>
    </FormPage>
  )
}
