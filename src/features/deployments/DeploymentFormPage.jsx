import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea, SuggestInput } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { ErrorState, PageSpinner, InlineAlert } from '@/components/ui/Feedback'
import { formatCurrency, formatDate, toInputDateTime } from '@/utils/format'
import { useCompanyOptions, useOptions, useSuggestions, useTariffOptions } from '@/app/ReferenceProvider'

const optionalAmount = z.preprocess((v) => (v === '' || v == null ? null : Number(v)), z.number().min(0, 'Cannot be negative').nullable())

const schema = z
  .object({
    companyId: z.coerce.number().int().positive('Choose the issuing company'),
    institution: z.string().trim().min(1, 'Choose the institution'),
    purchaseOrderId: z.coerce.number().int().positive('Link the purchase order (LPO)'),
    vehicleId: z.coerce.number().int().positive('Choose a vehicle'),
    driverId: z.coerce.number().int().positive('Choose a driver'),
    effectiveDays: z.coerce.number().int('Whole days').min(1, 'At least one day').max(365, 'At most a year'),
    tariffId: z.coerce.number().int().positive('Choose the vehicle category'),
    owner: z.string().min(1, 'Choose the vehicle owner'),
    ownerName: z
      .string()
      .trim()
      .optional()
      .transform((v) => v || null),
    ownerAmount: optionalAmount,
    driverMission: optionalAmount,
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
  .superRefine((v, ctx) => {
    if (v.owner === 'SUBCONTRACTOR' && v.ownerAmount == null)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ownerAmount'], message: 'Enter the amount due to the subcontractor' })
  })

/** Company a vehicle owner maps to (LIMOZ → LIMOZ, GORILLAND → Gorilland…); subcontracted vehicles keep the current choice. */
const companyForOwner = (companies, owner) => companies.find((c) => c.meta.code === owner)?.value ?? null

export default function DeploymentFormPage() {
  const purposes = useSuggestions('tripPurpose')
  const locations = useSuggestions('location')
  const institutions = useOptions('institution')
  const owners = useOptions('vehicleOwner')
  const companies = useCompanyOptions()
  const tariffs = useTariffOptions()
  const { can } = useAuth()
  const { id } = useParams()
  const [search] = useSearchParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const existing = useQuery({ queryKey: ['deployments', 'detail', id], queryFn: () => http.get(`/deployments/${id}`), enabled: isEdit })
  const bookingId = search.get('bookingId')
  const booking = useQuery({
    queryKey: ['bookings', 'detail', bookingId],
    queryFn: () => http.get(`/bookings/${bookingId}`),
    enabled: Boolean(bookingId) && !isEdit,
  })
  const presetOrderId = search.get('purchaseOrderId')
  const presetOrder = useQuery({
    queryKey: ['purchase-orders', 'detail', presetOrderId],
    queryFn: () => http.get(`/purchase-orders/${presetOrderId}`),
    enabled: Boolean(presetOrderId) && !isEdit,
  })
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: () => http.get('/settings'),
    enabled: can('DASHBOARD_VIEW'),
    staleTime: 600_000,
  })
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [serverError, setServerError] = useState(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      companyId: '',
      institution: search.get('institution') ?? '',
      purchaseOrderId: presetOrderId ?? '',
      vehicleId: search.get('vehicleId') ?? '',
      driverId: search.get('driverId') ?? '',
      effectiveDays: 1,
      tariffId: '',
      owner: '',
      ownerName: '',
      ownerAmount: '',
      driverMission: '',
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
    getValues,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = form

  useEffect(() => {
    if (existing.data) {
      const t = existing.data
      reset({
        companyId: t.companyId ?? '',
        institution: t.institution ?? '',
        purchaseOrderId: t.purchaseOrderId ?? '',
        vehicleId: t.vehicleId,
        driverId: t.driverId,
        effectiveDays: t.effectiveDays,
        tariffId: t.tariffId ?? '',
        owner: t.owner,
        ownerName: t.ownerName ?? '',
        ownerAmount: t.ownerAmount ?? '',
        driverMission: t.driverMission ?? '',
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
      const days = Math.max(1, Math.ceil((new Date(b.returnAt) - new Date(b.pickupAt)) / 86_400_000))
      reset({
        ...getValues(),
        vehicleId: b.vehicleId ?? '',
        driverId: b.driverId ?? '',
        institution: b.company ?? b.customerName,
        bookingId: b.id,
        effectiveDays: days,
        startLocation: b.pickupLocation,
        destination: b.dropoffLocation,
        scheduledStartAt: toInputDateTime(b.pickupAt),
        purpose: b.serviceType,
        passengers: b.passengers,
        notes: b.notes ?? '',
      })
    }
  }, [booking.data, isEdit, reset, getValues])

  useEffect(() => {
    if (presetOrder.data && !isEdit) {
      setValue('institution', presetOrder.data.institution)
      setValue('purchaseOrderId', presetOrder.data.id)
    }
  }, [presetOrder.data, isEdit, setValue])

  // Default the issuing company once companies are known.
  const companyId = watch('companyId')
  useEffect(() => {
    if (!companyId && companies.length && !isEdit) setValue('companyId', companies[0].value)
  }, [companyId, companies, isEdit, setValue])

  // When a vehicle is chosen: suggest its driver, take its owner and move the issuing company to the owner.
  const vehicleId = watch('vehicleId')
  useEffect(() => {
    const v = vehicles.options.find((o) => String(o.value) === String(vehicleId))?.meta
    if (!v) return
    const d = drivers.options.find((o) => o.meta.currentVehicleId === v.id)
    if (d && !getValues('driverId')) setValue('driverId', d.value, { shouldDirty: true })
    if (!isEdit || getValues('owner') === '') {
      setValue('owner', v.owner ?? 'LIMOZ', { shouldDirty: true })
      setValue('ownerName', v.ownerName ?? '')
      const c = companyForOwner(companies, v.owner)
      if (c) setValue('companyId', c, { shouldDirty: true })
    }
  }, [vehicleId, vehicles.options, drivers.options, companies, isEdit, setValue, getValues])

  const institution = watch('institution')
  const orders = useQuery({
    queryKey: ['purchase-orders', 'options', institution],
    queryFn: () => http.get('/purchase-orders/options', { params: { institution, includeClosed: isEdit ? 'true' : undefined } }),
    enabled: Boolean(institution),
  })
  const orderOptions = (orders.data ?? []).map((o) => ({
    value: o.id,
    label: o.lpoNumber,
    description: `${formatDate(o.receivedOn)} · ${formatCurrency(o.amount)} · ${o.status === 'OPEN' ? `${formatCurrency(o.remainingAmount)} left` : o.status.toLowerCase()}`,
    keywords: o.description,
    meta: o,
  }))
  const purchaseOrderId = watch('purchaseOrderId')
  const lpo = orderOptions.find((o) => String(o.value) === String(purchaseOrderId))?.meta ?? null
  // Clear the LPO when the institution changes to one it does not belong to.
  useEffect(() => {
    if (purchaseOrderId && orders.data && !orders.data.some((o) => o.id === Number(purchaseOrderId))) setValue('purchaseOrderId', '')
  }, [orders.data, purchaseOrderId, setValue])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/deployments/${id}`, values) : http.post('/deployments', values)),
    invalidate: [['deployments'], ['bookings'], ['dashboard'], ['dispatch'], ['vehicles'], ['purchase-orders'], ['gate']],
    success: (t) => `Deployment ${t.deploymentNumber} ${isEdit ? 'updated' : 'registered'}`,
    setError,
    onSuccess: (t) => {
      reset(undefined, { keepValues: true })
      navigate(`/deployments/${t.id}`, { replace: true })
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
  const owner = watch('owner')
  const subcontracted = owner === 'SUBCONTRACTOR'
  const days = Number(watch('effectiveDays')) || 0
  const tariff = tariffs.find((t) => String(t.value) === String(watch('tariffId')))?.meta
  const company = companies.find((c) => String(c.value) === String(companyId))?.meta
  const amount = tariff ? tariff.dailyRate * Math.max(1, days) : null
  const missionDefault =
    settings.data && days > 0 ? settings.data.missionFirstDayAmount + (days - 1) * settings.data.missionExtraDayAmount : null
  const overDuration = lpo && days > lpo.durationDays
  const overAmount = lpo && amount != null && amount > lpo.remainingAmount + (isEdit ? (existing.data?.amount ?? 0) : 0)
  const err = (k) => errors[k]?.message

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.deploymentNumber}` : 'New deployment'}
      description={
        company
          ? `Numbered ${company.numberPrefix}${subcontracted ? 2 : 1}/…/${new Date(watch('scheduledStartAt') || Date.now()).getFullYear()} on save. Departure and return odometer readings are recorded at the gate.`
          : 'Every deployment is linked to a registered LPO. Departure and return odometer readings are recorded at the gate.'
      }
      breadcrumbs={[
        { label: 'Deployments', to: '/deployments' },
        ...(isEdit ? [{ label: existing.data.deploymentNumber, to: `/deployments/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Register deployment'}
      cancelTo={isEdit ? `/deployments/${id}` : '/deployments'}
      serverError={serverError}
    >
      {booking.data ? (
        <InlineAlert tone="info" title={`Linked to booking ${booking.data.bookingNumber}`}>
          Recording the return will complete the booking.
        </InlineAlert>
      ) : null}
      <FormSection
        title="Order"
        description="The institution's purchase order this deployment is made against. The LPO date and amount come from the registered order."
      >
        <Field label="Company" htmlFor="companyId" required error={err('companyId')} hint="Issues the number and prints the road map.">
          <Select id="companyId" {...register('companyId')} invalid={!!errors.companyId}>
            {companies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Institution" htmlFor="institution" required error={err('institution')}>
          <Select id="institution" {...register('institution')} invalid={!!errors.institution} placeholder="Choose the institution">
            {institutions.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Purchase order (LPO)"
          required
          error={err('purchaseOrderId')}
          hint={
            !institution
              ? 'Choose the institution first.'
              : orders.data && !orders.data.length
                ? 'This institution has no open LPO. Ask the account manager to register it.'
                : undefined
          }
          span
        >
          <Controller
            control={control}
            name="purchaseOrderId"
            render={({ field }) => (
              <Combobox
                options={orderOptions}
                value={field.value}
                onChange={field.onChange}
                loading={orders.isLoading}
                disabled={!institution}
                invalid={!!errors.purchaseOrderId}
                placeholder="Search by LPO number"
              />
            )}
          />
        </Field>
        {lpo ? (
          <Box
            sx={{
              gridColumn: { sm: '1 / -1' },
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' },
              p: 1.5,
              borderRadius: 1,
              bgcolor: 'background.subtle',
              border: 1,
              borderColor: 'divider',
            }}
          >
            <Meta label="LPO date">{formatDate(lpo.receivedOn)}</Meta>
            <Meta label="LPO amount">{formatCurrency(lpo.amount)}</Meta>
            <Meta label="Remaining">{formatCurrency(lpo.remainingAmount)}</Meta>
            <Meta label="Duration">
              {lpo.durationDays} days · until {formatDate(lpo.expiresOn)}
            </Meta>
          </Box>
        ) : null}
        {overDuration || overAmount ? (
          <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
            <InlineAlert tone="warning" title="Check against the LPO">
              {overDuration ? `The deployment runs ${days} days but the LPO covers ${lpo.durationDays}. ` : ''}
              {overAmount
                ? `The amount (${formatCurrency(amount)}) exceeds what is left on the LPO (${formatCurrency(lpo.remainingAmount)}).`
                : ''}{' '}
              You can still save it; the account manager will see it on the LPO.
            </InlineAlert>
          </Box>
        ) : null}
      </FormSection>
      <FormSection
        title="Vehicle & driver"
        description="The vehicle must be in service with valid documents and the driver free with a valid licence. The vehicle's assigned driver is suggested; pick another available driver to reassign."
      >
        <Field label="Plate number" required error={err('vehicleId')}>
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
        <Field
          label="Vehicle owner"
          htmlFor="owner"
          required
          error={err('owner')}
          hint="Taken from the vehicle record. Subcontracted vehicles take the series-2 number."
        >
          <Select id="owner" {...register('owner')} invalid={!!errors.owner} placeholder="Choose the owner">
            {owners.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        {subcontracted ? (
          <>
            <Field label="Subcontractor" htmlFor="ownerName" error={err('ownerName')}>
              <Input id="ownerName" {...register('ownerName')} placeholder="Company that owns the vehicle" />
            </Field>
            <Field
              label="Owner amount"
              htmlFor="ownerAmount"
              required
              error={err('ownerAmount')}
              hint="Amount due to the subcontractor for this deployment."
            >
              <Input
                id="ownerAmount"
                type="number"
                inputMode="numeric"
                min={0}
                {...register('ownerAmount')}
                trailing="RWF"
                invalid={!!errors.ownerAmount}
              />
            </Field>
          </>
        ) : (
          <Field
            label="Driver mission"
            htmlFor="driverMission"
            error={err('driverMission')}
            hint={
              missionDefault != null
                ? `Leave empty to apply the company rule: ${formatCurrency(missionDefault)} for ${days} day${days === 1 ? '' : 's'}.`
                : 'Leave empty to apply the company rule.'
            }
          >
            <Input
              id="driverMission"
              type="number"
              inputMode="numeric"
              min={0}
              {...register('driverMission')}
              trailing="RWF"
              placeholder={missionDefault != null ? String(missionDefault) : ''}
            />
          </Field>
        )}
      </FormSection>
      <FormSection
        title="Assignment"
        description="Effective days and the tariff category decide the deployment amount billed to the institution."
      >
        <Field label="Effective days" htmlFor="effectiveDays" required error={err('effectiveDays')}>
          <Input
            id="effectiveDays"
            type="number"
            inputMode="numeric"
            min={1}
            {...register('effectiveDays')}
            trailing="days"
            invalid={!!errors.effectiveDays}
          />
        </Field>
        <Field
          label="Vehicle category"
          htmlFor="tariffId"
          required
          error={err('tariffId')}
          hint={tariff ? `${formatCurrency(tariff.dailyRate)} per day` : 'CAT1–CAT3, each with a configured daily rate.'}
        >
          <Select id="tariffId" {...register('tariffId')} invalid={!!errors.tariffId} placeholder="Choose the category">
            {tariffs.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Box sx={{ gridColumn: { sm: '1 / -1' } }}>
          <Typography sx={{ fontSize: 13, color: 'text.muted' }}>
            Deployment amount:{' '}
            <Box component="span" sx={{ fontWeight: 600, color: 'text.primary' }}>
              {amount != null ? formatCurrency(amount) : '—'}
            </Box>
            {tariff ? ` (${formatCurrency(tariff.dailyRate)} × ${Math.max(1, days)} day${days === 1 ? '' : 's'})` : ''}
          </Typography>
        </Box>
        <Field label="Scheduled start" htmlFor="scheduledStartAt" required error={err('scheduledStartAt')}>
          <Input id="scheduledStartAt" type="datetime-local" {...register('scheduledStartAt')} invalid={!!errors.scheduledStartAt} />
        </Field>
        <Field label="Purpose" htmlFor="purpose" required error={err('purpose')}>
          <SuggestInput id="purpose" suggestions={purposes} {...register('purpose')} invalid={!!errors.purpose} />
        </Field>
        <Field label="Start location" htmlFor="startLocation" required error={err('startLocation')}>
          <SuggestInput id="startLocation" suggestions={locations} {...register('startLocation')} invalid={!!errors.startLocation} />
        </Field>
        <Field label="Destination" htmlFor="destination" required error={err('destination')}>
          <SuggestInput id="destination" suggestions={locations} {...register('destination')} invalid={!!errors.destination} />
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
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={3} {...register('notes')} placeholder="Contact on site, special requests, mission details…" />
        </Field>
      </FormSection>
    </FormPage>
  )
}

function Meta({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.muted' }}>
        {label}
      </Typography>
      <Typography sx={{ mt: 0.25, fontSize: 13, fontWeight: 500 }}>{children}</Typography>
    </Box>
  )
}
