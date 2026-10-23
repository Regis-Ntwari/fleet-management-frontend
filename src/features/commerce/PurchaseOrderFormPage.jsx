import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/Field'
import { ErrorState, InlineAlert, PageSpinner } from '@/components/ui/Feedback'
import { formatCurrency, toInputDate } from '@/utils/format'

const schema = z.object({
  lpoNumber: z.string().trim().min(1, 'Enter the LPO number as shown on the order'),
  institution: z.string().trim().min(1, 'Choose the institution'),
  accountManagerId: z.coerce.number().int().positive('Choose the account manager'),
  receivedOn: z.string().min(1, 'Enter the date received'),
  durationDays: z.coerce.number().int('Whole days').min(1, 'At least one day').max(1095, 'At most three years'),
  description: z.string().trim().min(3, 'Describe the order'),
  amount: z.coerce.number().positive('Enter the total LPO amount'),
  currency: z.string().min(1, 'Choose a currency'),
  notes: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || null),
})

export default function PurchaseOrderFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const institutions = useOptions('institution')
  const currencies = useOptions('currency')
  const managers = useQuery({
    queryKey: ['purchase-orders', 'account-managers'],
    queryFn: () => http.get('/purchase-orders/account-managers'),
  })
  const existing = useQuery({
    queryKey: ['purchase-orders', 'detail', id],
    queryFn: () => http.get(`/purchase-orders/${id}`),
    enabled: isEdit,
  })
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      lpoNumber: '',
      institution: '',
      accountManagerId: '',
      receivedOn: toInputDate(new Date()),
      durationDays: 30,
      description: '',
      amount: '',
      currency: 'RWF',
      notes: '',
    },
    mode: 'onBlur',
  })
  useEffect(() => {
    if (existing.data) {
      const o = existing.data
      reset({
        lpoNumber: o.lpoNumber,
        institution: o.institution,
        accountManagerId: o.accountManagerId,
        receivedOn: o.receivedOn,
        durationDays: o.durationDays,
        description: o.description,
        amount: o.amount,
        currency: o.currency,
        notes: o.notes ?? '',
      })
    }
  }, [existing.data, reset])
  // Default the account manager to the signed-in user when they can manage orders.
  const managerId = watch('accountManagerId')
  useEffect(() => {
    if (!isEdit && !managerId && managers.data?.some((m) => m.id === user?.id)) setValue('accountManagerId', user.id)
  }, [isEdit, managerId, managers.data, user, setValue])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/purchase-orders/${id}`, values) : http.post('/purchase-orders', values)),
    invalidate: [['purchase-orders'], ['deployments']],
    success: (o) => `LPO ${o.lpoNumber} ${isEdit ? 'updated' : 'registered'}`,
    setError,
    onSuccess: (o) => {
      reset(undefined, { keepValues: true })
      navigate(`/commerce/${o.id}`, { replace: true })
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
  const err = (k) => errors[k]?.message
  const o = existing.data

  return (
    <FormPage
      title={isEdit ? `Edit LPO ${o.lpoNumber}` : 'Register LPO'}
      description="Record the customer purchase order as received. Deployments are then registered against it and its balance is tracked."
      breadcrumbs={[
        { label: 'Commerce', to: '/commerce' },
        ...(isEdit ? [{ label: o.lpoNumber, to: `/commerce/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Register LPO'}
      cancelTo={isEdit ? `/commerce/${id}` : '/commerce'}
      serverError={serverError}
    >
      {isEdit && o.originalAmount !== o.amount ? (
        <InlineAlert tone="info" title={`Originally ${formatCurrency(o.originalAmount)}`}>
          The amount has been changed since registration. Every change is kept in the audit trail.
        </InlineAlert>
      ) : null}
      {isEdit && o.committedAmount > 0 ? (
        <InlineAlert tone="warning" title={`${formatCurrency(o.committedAmount)} already deployed`}>
          The amount cannot go below what has been deployed against this order.
        </InlineAlert>
      ) : null}
      <FormSection
        title="Order"
        description="Reference and institution exactly as shown on the received purchase order. Numbers are unique per institution."
      >
        <Field label="Commerce / LPO number" htmlFor="lpoNumber" required error={err('lpoNumber')} hint="e.g. NO.102/F.Y.25.27">
          <Input id="lpoNumber" {...register('lpoNumber')} mono invalid={!!errors.lpoNumber} autoFocus={!isEdit} />
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
        <Field label="Account manager" htmlFor="accountManagerId" required error={err('accountManagerId')}>
          <Select
            id="accountManagerId"
            {...register('accountManagerId')}
            invalid={!!errors.accountManagerId}
            placeholder="Choose the account manager"
          >
            {(managers.data ?? []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date received" htmlFor="receivedOn" required error={err('receivedOn')}>
          <Input id="receivedOn" type="date" {...register('receivedOn')} invalid={!!errors.receivedOn} />
        </Field>
        <Field
          label="LPO duration"
          htmlFor="durationDays"
          required
          error={err('durationDays')}
          hint="Days covered by the order, from the date received."
        >
          <Input
            id="durationDays"
            type="number"
            inputMode="numeric"
            min={1}
            {...register('durationDays')}
            trailing="days"
            invalid={!!errors.durationDays}
          />
        </Field>
        <Field label="Description" htmlFor="description" required error={err('description')} span>
          <Textarea
            id="description"
            rows={3}
            {...register('description')}
            placeholder="Being the above mentioned vehicle to facilitate…"
            invalid={!!errors.description}
          />
        </Field>
      </FormSection>
      <FormSection
        title="Value"
        description="Total value of the purchase order. The original amount is preserved when it is amended later."
      >
        <Field label="Total LPO amount" htmlFor="amount" required error={err('amount')}>
          <Input id="amount" type="number" inputMode="numeric" min={0} step="1000" {...register('amount')} invalid={!!errors.amount} />
        </Field>
        <Field label="Currency" htmlFor="currency" required error={err('currency')}>
          <Select id="currency" {...register('currency')} invalid={!!errors.currency}>
            {currencies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={2} {...register('notes')} placeholder="Payment terms, contact person, attachments…" />
        </Field>
      </FormSection>
    </FormPage>
  )
}
