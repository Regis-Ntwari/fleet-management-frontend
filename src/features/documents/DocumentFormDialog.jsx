import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import { visuallyHidden } from '@mui/utils'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import { http } from '@/api/client'
import { useOptions } from '@/app/ReferenceProvider'
import { useApiMutation, useDriverOptions, useVehicleOptions } from '@/features/common/hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Combobox } from '@/components/ui/Combobox'
import { InlineAlert } from '@/components/ui/Feedback'
import { formatBytes } from '@/utils/format'

const schema = z
  .object({
    ownerType: z.enum(['VEHICLE', 'DRIVER']),
    ownerId: z.coerce.number().int().positive('Choose the owner'),
    type: z.string().min(1, 'Choose a document type'),
    number: z.string().trim().min(1, 'Document number is required'),
    issueDate: z.string().min(1, 'Issue date is required'),
    expiryDate: z.string().min(1, 'Expiry date is required'),
    notes: z.string().optional(),
  })
  .refine((v) => v.expiryDate > v.issueDate, { path: ['expiryDate'], message: 'Expiry must be after the issue date' })

/** Create or edit a compliance document for a vehicle or driver. */
export function DocumentFormDialog({ open, onClose, document, ownerType: fixedOwnerType, ownerId: fixedOwnerId, onSaved }) {
  const isEdit = Boolean(document)
  const types = useOptions('documentType')
  const vehicles = useVehicleOptions()
  const drivers = useDriverOptions()
  const [file, setFile] = useState(null)
  const [serverError, setServerError] = useState(null)
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      ownerType: fixedOwnerType ?? 'VEHICLE',
      ownerId: fixedOwnerId ?? '',
      type: '',
      number: '',
      issueDate: '',
      expiryDate: '',
      notes: '',
    },
  })
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = form

  useEffect(() => {
    if (!open) return
    setServerError(null)
    setFile(null)
    reset(
      document
        ? {
            ownerType: document.ownerType,
            ownerId: document.ownerId,
            type: document.type,
            number: document.number,
            issueDate: document.issueDate,
            expiryDate: document.expiryDate,
            notes: document.notes ?? '',
          }
        : {
            ownerType: fixedOwnerType ?? 'VEHICLE',
            ownerId: fixedOwnerId ?? '',
            type: '',
            number: '',
            issueDate: '',
            expiryDate: '',
            notes: '',
          },
    )
  }, [open, document, fixedOwnerType, fixedOwnerId, reset])

  const save = useApiMutation({
    mutationFn: (values) => (isEdit ? http.put(`/documents/${document.id}`, values) : http.post('/documents', values)),
    invalidate: [['documents'], ['vehicles'], ['drivers'], ['alerts'], ['dashboard']],
    success: isEdit ? 'Document updated' : 'Document added',
    setError,
    onSuccess: (d) => {
      onSaved?.(d)
      onClose()
    },
  })

  const ownerType = watch('ownerType')
  const ownerOptions = ownerType === 'DRIVER' ? drivers.options : vehicles.options
  const ownerId = watch('ownerId')

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    try {
      await save.mutateAsync({
        ...values,
        attachment: file ? { fileName: file.name, contentType: file.type, sizeBytes: file.size } : undefined,
      })
    } catch (e) {
      if (!e.fieldErrors?.length) setServerError(e)
    }
  })

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit document' : 'Add document'}
      description="Expiry warnings and dispatch checks are driven by the expiry date."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={isSubmitting || save.isPending}>
            {isEdit ? 'Save' : 'Add document'}
          </Button>
        </>
      }
    >
      <Stack component="form" onSubmit={onSubmit} noValidate spacing={2}>
        {serverError ? (
          <InlineAlert tone="danger" title={serverError.title}>
            {serverError.message}
          </InlineAlert>
        ) : null}
        {!fixedOwnerId && !isEdit ? (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: '140px 1fr' } }}>
            <Field label="Owner" required error={errors.ownerType?.message}>
              <Select
                {...register('ownerType')}
                onChange={(e) => {
                  setValue('ownerType', e.target.value)
                  setValue('ownerId', '')
                }}
              >
                <option value="VEHICLE">Vehicle</option>
                <option value="DRIVER">Driver</option>
              </Select>
            </Field>
            <Field label={ownerType === 'DRIVER' ? 'Driver' : 'Vehicle'} required error={errors.ownerId?.message}>
              <Combobox
                options={ownerOptions}
                value={ownerId}
                onChange={(v) => setValue('ownerId', v ?? '', { shouldValidate: true })}
                loading={vehicles.isLoading || drivers.isLoading}
                invalid={!!errors.ownerId}
              />
            </Field>
          </Box>
        ) : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <Field label="Document type" required error={errors.type?.message}>
            <Select {...register('type')} invalid={!!errors.type} placeholder="Choose type" autoFocus>
              {types
                .filter((t) =>
                  ownerType === 'DRIVER' ? ['DRIVER_LICENCE', 'PERMIT', 'OTHER'].includes(t.value) : t.value !== 'DRIVER_LICENCE',
                )
                .map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Number" required error={errors.number?.message}>
            <Input {...register('number')} invalid={!!errors.number} uppercase />
          </Field>
          <Field label="Issue date" required error={errors.issueDate?.message}>
            <Input type="date" {...register('issueDate')} invalid={!!errors.issueDate} />
          </Field>
          <Field label="Expiry date" required error={errors.expiryDate?.message}>
            <Input type="date" {...register('expiryDate')} invalid={!!errors.expiryDate} />
          </Field>
        </Box>
        <Field
          label="Attachment"
          hint={
            document?.attachment && !file
              ? `Current: ${document.attachment.fileName}`
              : 'PDF or image up to 10 MB. Stored through the backend file service.'
          }
        >
          <Box
            component="label"
            sx={{
              display: 'flex',
              height: 36,
              cursor: 'pointer',
              alignItems: 'center',
              gap: 1,
              borderRadius: 1,
              border: '1px dashed',
              borderColor: 'edge.strong',
              px: 1.5,
              fontSize: 13,
              color: 'text.muted',
              '&:hover': { bgcolor: 'background.subtle' },
            }}
          >
            <AttachFileIcon sx={{ fontSize: 16 }} aria-hidden />
            <Box component="span" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {file ? `${file.name} · ${formatBytes(file.size)}` : 'Choose file…'}
            </Box>
            <Box
              component="input"
              type="file"
              accept=".pdf,image/*"
              sx={visuallyHidden}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Box>
        </Field>
        <Field label="Notes">
          <Textarea rows={2} {...register('notes')} />
        </Field>
      </Stack>
    </Dialog>
  )
}
