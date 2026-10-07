import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation } from '@/features/common/hooks'
import { FormPage } from '@/features/common/FormPage'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/Field'
import { ErrorState, PageSpinner } from '@/components/ui/Feedback'

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => v || null)
const schema = z
  .object({
    employeeNumber: z.string().trim().min(2, 'Employee number is required'),
    fullName: z.string().trim().min(3, 'Full name is required'),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ]{9,15}$/, 'Enter a valid phone number, e.g. +250 78x xxx xxx'),
    email: z
      .string()
      .trim()
      .optional()
      .or(z.literal(''))
      .refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Enter a valid email')
      .transform((v) => v || null),
    nationalId: z
      .string()
      .trim()
      .regex(/^\d{16}$/, 'National ID has 16 digits'),
    licenseNumber: z.string().trim().min(3, 'Licence number is required'),
    licenseCategory: z.string().trim().min(1, 'Licence category is required'),
    licenseIssueDate: z.string().min(1, 'Issue date is required'),
    licenseExpiry: z.string().min(1, 'Expiry date is required'),
    employmentStatus: z.enum(['FULL_TIME', 'CONTRACT', 'CASUAL']),
    joiningDate: z.string().min(1, 'Joining date is required'),
    status: z.string().min(1, 'Choose a status'),
    emergencyContactName: optionalText,
    emergencyContactPhone: optionalText,
    notes: optionalText,
  })
  .refine((v) => v.licenseExpiry > v.licenseIssueDate, { path: ['licenseExpiry'], message: 'Expiry must be after the issue date' })

const EMPTY = {
  employeeNumber: '',
  fullName: '',
  phone: '+250 ',
  email: '',
  nationalId: '',
  licenseNumber: '',
  licenseCategory: 'B',
  licenseIssueDate: '',
  licenseExpiry: '',
  employmentStatus: 'FULL_TIME',
  joiningDate: '',
  status: 'AVAILABLE',
  emergencyContactName: '',
  emergencyContactPhone: '',
  notes: '',
}

export default function DriverFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const statuses = useOptions('driver')
  const existing = useQuery({ queryKey: ['drivers', 'detail', id], queryFn: () => http.get(`/drivers/${id}`), enabled: isEdit })
  const [serverError, setServerError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm({ resolver: zodResolver(schema), defaultValues: EMPTY, mode: 'onBlur' })

  useEffect(() => {
    if (existing.data) reset(Object.fromEntries(Object.keys(EMPTY).map((k) => [k, existing.data[k] ?? ''])))
  }, [existing.data, reset])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/drivers/${id}`, values) : http.post('/drivers', values)),
    invalidate: [['drivers'], ['documents'], ['dashboard']],
    success: (d) => `${d.fullName} ${isEdit ? 'updated' : 'added'}`,
    setError,
    onSuccess: (d) => {
      reset(undefined, { keepValues: true })
      navigate(`/drivers/${d.id}`, { replace: true })
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

  return (
    <FormPage
      title={isEdit ? `Edit ${existing.data.fullName}` : 'Add driver'}
      description="The driving licence is tracked as a compliance document and blocks dispatch when expired."
      breadcrumbs={[
        { label: 'Drivers', to: '/drivers' },
        ...(isEdit ? [{ label: existing.data.fullName, to: `/drivers/${id}` }] : []),
        { label: isEdit ? 'Edit' : 'New' },
      ]}
      onSubmit={onSubmit}
      isDirty={isDirty}
      isSubmitting={isSubmitting || save.isPending}
      submitLabel={isEdit ? 'Save changes' : 'Add driver'}
      cancelTo={isEdit ? `/drivers/${id}` : '/drivers'}
      serverError={serverError}
    >
      <FormSection title="Personal details">
        <Field label="Full name" htmlFor="fullName" required error={err('fullName')}>
          <Input id="fullName" {...register('fullName')} invalid={!!errors.fullName} autoFocus={!isEdit} />
        </Field>
        <Field label="Employee number" htmlFor="employeeNumber" required error={err('employeeNumber')}>
          <Input id="employeeNumber" {...register('employeeNumber')} invalid={!!errors.employeeNumber} uppercase />
        </Field>
        <Field label="Phone" htmlFor="phone" required error={err('phone')}>
          <Input id="phone" type="tel" {...register('phone')} invalid={!!errors.phone} />
        </Field>
        <Field label="Email" htmlFor="email" error={err('email')}>
          <Input id="email" type="email" {...register('email')} invalid={!!errors.email} />
        </Field>
        <Field label="National ID" htmlFor="nationalId" required error={err('nationalId')} hint="16 digits">
          <Input id="nationalId" inputMode="numeric" maxLength={16} {...register('nationalId')} invalid={!!errors.nationalId} mono />
        </Field>
      </FormSection>
      <FormSection title="Driving licence" description="Expiry drives the licence-expiring alerts and dispatch validation.">
        <Field label="Licence number" htmlFor="licenseNumber" required error={err('licenseNumber')}>
          <Input id="licenseNumber" {...register('licenseNumber')} invalid={!!errors.licenseNumber} uppercase />
        </Field>
        <Field label="Categories" htmlFor="licenseCategory" required error={err('licenseCategory')} hint="e.g. B, C, D">
          <Input id="licenseCategory" {...register('licenseCategory')} invalid={!!errors.licenseCategory} uppercase />
        </Field>
        <Field label="Issue date" htmlFor="licenseIssueDate" required error={err('licenseIssueDate')}>
          <Input id="licenseIssueDate" type="date" {...register('licenseIssueDate')} invalid={!!errors.licenseIssueDate} />
        </Field>
        <Field label="Expiry date" htmlFor="licenseExpiry" required error={err('licenseExpiry')}>
          <Input id="licenseExpiry" type="date" {...register('licenseExpiry')} invalid={!!errors.licenseExpiry} />
        </Field>
      </FormSection>
      <FormSection title="Employment">
        <Field label="Employment status" htmlFor="employmentStatus" required error={err('employmentStatus')}>
          <Select id="employmentStatus" {...register('employmentStatus')}>
            <option value="FULL_TIME">Full time</option>
            <option value="CONTRACT">Contract</option>
            <option value="CASUAL">Casual</option>
          </Select>
        </Field>
        <Field label="Joining date" htmlFor="joiningDate" required error={err('joiningDate')}>
          <Input id="joiningDate" type="date" {...register('joiningDate')} invalid={!!errors.joiningDate} />
        </Field>
        <Field label="Availability status" htmlFor="status" required error={err('status')}>
          <Select id="status" {...register('status')}>
            {statuses.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
      </FormSection>
      <FormSection title="Emergency contact & notes">
        <Field label="Contact name" htmlFor="emergencyContactName" error={err('emergencyContactName')}>
          <Input id="emergencyContactName" {...register('emergencyContactName')} />
        </Field>
        <Field label="Contact phone" htmlFor="emergencyContactPhone" error={err('emergencyContactPhone')}>
          <Input id="emergencyContactPhone" type="tel" {...register('emergencyContactPhone')} />
        </Field>
        <Field label="Notes" htmlFor="notes" span>
          <Textarea id="notes" rows={3} {...register('notes')} />
        </Field>
      </FormSection>
    </FormPage>
  )
}
