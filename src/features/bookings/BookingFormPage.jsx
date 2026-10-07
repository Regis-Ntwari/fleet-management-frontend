import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { http } from '@/api/client'
import { useCategoryOptions, useOptions } from '@/app/ReferenceProvider'
import { useApiMutation } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { ErrorState, PageSpinner } from '@/components/ui/Feedback'
import { toInputDateTime } from '@/utils/format'
import { LOCATIONS } from '@/api/mock/data'

const schema = z
  .object({
    customerName: z.string().trim().min(2, 'Customer name is required'),
    company: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null),
    contactPhone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{9,15}$/, 'Enter a valid phone number'),
    contactEmail: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email')
      .transform((v) => v || null),
    requestedCategoryId: z.coerce.number().int().positive('Choose a category'),
    pickupLocation: z.string().trim().min(2, 'Pickup location is required'),
    dropoffLocation: z.string().trim().min(2, 'Drop-off location is required'),
    pickupAt: z.string().min(1, 'Pickup time is required'),
    returnAt: z.string().min(1, 'Return time is required'),
    serviceType: z.string().min(1, 'Choose a service type'),
    passengers: z.coerce.number().int('Whole number').min(1, 'At least one passenger'),
    quotedAmount: z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0, 'Cannot be negative').nullable()),
    notes: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null),
  })
  .refine((v) => new Date(v.returnAt) > new Date(v.pickupAt), { path: ['returnAt'], message: 'Return must be after pickup' })

export default function BookingFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const categories = useCategoryOptions()
  const serviceTypes = useOptions('serviceType')
  const existing = useQuery({ queryKey: ['bookings', 'detail', id], queryFn: () => http.get(`/bookings/${id}`), enabled: isEdit })
  const [serverError, setServerError] = useState(null)
  // Default pickup is tomorrow; computed once so render stays pure.
  const [initial] = useState(() => {
    const pickup = new Date(Date.now() + 86_400_000)
    return { pickupAt: toInputDateTime(pickup), returnAt: toInputDateTime(new Date(pickup.getTime() + 3 * 3600_000)) }
  })
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      company: '',
      contactPhone: '+250 ',
      contactEmail: '',
      requestedCategoryId: '',
      pickupLocation: 'Kigali International Airport',
      dropoffLocation: '',
      pickupAt: initial.pickupAt,
      returnAt: initial.returnAt,
      serviceType: 'Airport transfer',
      passengers: 1,
      quotedAmount: '',
      notes: '',
    },
    mode: 'onBlur',
  })
  useEffect(() => {
    if (existing.data) {
      const b = existing.data
      reset({
        customerName: b.customerName,
        company: b.company ?? '',
        contactPhone: b.contactPhone,
        contactEmail: b.contactEmail ?? '',
        requestedCategoryId: b.requestedCategoryId,
        pickupLocation: b.pickupLocation,
        dropoffLocation: b.dropoffLocation,
        pickupAt: toInputDateTime(b.pickupAt),
        returnAt: toInputDateTime(b.returnAt),
        serviceType: b.serviceType,
        passengers: b.passengers,
        quotedAmount: b.quotedAmount ?? '',
        notes: b.notes ?? '',
      })
    }
  }, [existing.data, reset])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/bookings/${id}`, values) : http.post('/bookings', values)),
    invalidate: [['bookings'], ['dashboard'], ['dispatch'], ['alerts']],
    success: (b) => `Booking ${b.bookingNumber} ${isEdit ? 'updated' : 'created'}`,
    setError,
    onSuccess: (b) => {
      reset(undefined, { keepValues: true })
      navigate(`/bookings/${b.id}`, { replace: true })
    },
  })
  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({
        ...values,
        pickupAt: new Date(values.pickupAt).toISOString(),
        returnAt: new Date(values.returnAt).toISOString(),
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
      title={isEdit ? `Edit ${existing.data.bookingNumber}` : 'New booking'}
      description="Capture the request first; assign a vehicle and driver from the booking page once confirmed."
      breadcrumbs={[
        { label: 'Bookings', to: '/bookings' },
        ...(isEdit ? [{ label: existing.data.bookingNumber, to: `/bookings/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Create booking'}
      cancelTo={isEdit ? `/bookings/${id}` : '/bookings'}
      serverError={serverError}
    >
      <FormSection title="Customer">
        <Field label="Customer name" htmlFor="customerName" required error={err('customerName')}>
          <Input id="customerName" {...register('customerName')} invalid={!!errors.customerName} autoFocus={!isEdit} />
        </Field>
        <Field label="Company" htmlFor="company" error={err('company')}>
          <Input id="company" {...register('company')} />
        </Field>
        <Field label="Contact phone" htmlFor="contactPhone" required error={err('contactPhone')}>
          <Input id="contactPhone" type="tel" {...register('contactPhone')} invalid={!!errors.contactPhone} />
        </Field>
        <Field label="Contact email" htmlFor="contactEmail" error={err('contactEmail')}>
          <Input id="contactEmail" type="email" {...register('contactEmail')} invalid={!!errors.contactEmail} />
        </Field>
      </FormSection>
      <FormSection title="Service">
        <Field label="Service type" htmlFor="serviceType" required error={err('serviceType')}>
          <Select id="serviceType" {...register('serviceType')} invalid={!!errors.serviceType}>
            {serviceTypes.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Vehicle category requested" htmlFor="requestedCategoryId" required error={err('requestedCategoryId')}>
          <Select
            id="requestedCategoryId"
            {...register('requestedCategoryId')}
            invalid={!!errors.requestedCategoryId}
            placeholder="Choose a category"
          >
            {categories.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Passengers" htmlFor="passengers" required error={err('passengers')}>
          <Input id="passengers" type="number" inputMode="numeric" min={1} {...register('passengers')} invalid={!!errors.passengers} />
        </Field>
        <Field label="Quoted amount" htmlFor="quotedAmount" error={err('quotedAmount')}>
          <Input id="quotedAmount" type="number" inputMode="numeric" {...register('quotedAmount')} trailing="RWF" />
        </Field>
      </FormSection>
      <FormSection title="Itinerary">
        <Field label="Pickup location" htmlFor="pickupLocation" required error={err('pickupLocation')}>
          <SuggestInput id="pickupLocation" suggestions={LOCATIONS} {...register('pickupLocation')} invalid={!!errors.pickupLocation} />
        </Field>
        <Field label="Drop-off location" htmlFor="dropoffLocation" required error={err('dropoffLocation')}>
          <SuggestInput id="dropoffLocation" suggestions={LOCATIONS} {...register('dropoffLocation')} invalid={!!errors.dropoffLocation} />
        </Field>
        <Field label="Pickup" htmlFor="pickupAt" required error={err('pickupAt')}>
          <Input id="pickupAt" type="datetime-local" {...register('pickupAt')} invalid={!!errors.pickupAt} />
        </Field>
        <Field label="Return" htmlFor="returnAt" required error={err('returnAt')}>
          <Input id="returnAt" type="datetime-local" {...register('returnAt')} invalid={!!errors.returnAt} />
        </Field>
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={3} {...register('notes')} placeholder="Flight number, language preference, child seats, invoicing…" />
        </Field>
      </FormSection>
    </FormPage>
  )
}
