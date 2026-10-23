import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import UploadIcon from '@mui/icons-material/Upload'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, Switch, Textarea } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/Feedback'

const mono = (t) => t.typography.fontFamilyMono
const LOGO_MAX_BYTES = 300 * 1024

/**
 * Operating companies: each issues deployment numbers under its own prefix, prints its own
 * road map letterhead and keeps its own stock.
 */
export function CompaniesTab() {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => http.get('/companies') })
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const manage = can('SETTINGS_MANAGE')
  const invalidate = [['companies'], ['reference'], ['deployments'], ['parts']]
  const refresh = () => {
    companies.refetch()
    queryClient.invalidateQueries({ queryKey: ['reference'] })
  }
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/companies/${id}`),
    invalidate,
    success: 'Company deleted',
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
  })
  const toggle = useApiMutation({
    mutationFn: (c) => http.put(`/companies/${c.id}`, { active: !c.active }),
    invalidate,
    onSuccess: refresh,
  })
  return (
    <Card>
      <CardHeader
        title="Companies"
        description="Each company issues deployments under its own number prefix (GSL1/00001/2026, LIMOZ1/…), prints its own road map and keeps its own stock."
        actions={
          manage ? (
            <Button
              size="sm"
              variant="primary"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add company
            </Button>
          ) : null
        }
      />
      <DataTable
        stickyHeader={false}
        isLoading={companies.isLoading}
        rows={companies.data ?? []}
        columns={[
          {
            key: 'name',
            header: 'Company',
            render: (c) => (
              <span>
                <Box component="span" sx={{ display: 'block', fontWeight: 500 }}>
                  {c.name}
                </Box>
                <Box component="span" sx={{ display: 'block', fontSize: 11.5, color: 'text.muted' }}>
                  {c.legalName}
                </Box>
              </span>
            ),
          },
          { key: 'numberPrefix', header: 'Prefix', sx: { fontFamily: mono, fontSize: 12.5 } },
          { key: 'tin', header: 'TIN', sx: { fontFamily: mono, fontSize: 12.5 }, hideBelow: 'md' },
          { key: 'phone', header: 'Phone', hideBelow: 'lg' },
          { key: 'deploymentCount', header: 'Deployments', align: 'right', hideBelow: 'sm' },
          { key: 'partCount', header: 'Parts', align: 'right', hideBelow: 'sm' },
          { key: 'userCount', header: 'Users', align: 'right', hideBelow: 'md' },
          {
            key: 'active',
            header: 'Active',
            render: (c) =>
              manage ? (
                <Switch size="sm" checked={c.active} onChange={() => toggle.mutate(c)} label={`${c.name} active`} />
              ) : c.active ? (
                'Yes'
              ) : (
                'No'
              ),
          },
          manage && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (c) => (
              <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                <IconButton
                  label="Edit"
                  icon={EditIcon}
                  size="xs"
                  onClick={() => {
                    setEditing(c)
                    setOpen(true)
                  }}
                />
                <IconButton
                  label="Delete"
                  icon={DeleteIcon}
                  size="xs"
                  onClick={() => setDeleting(c)}
                  disabled={c.deploymentCount > 0 || c.partCount > 0 || c.userCount > 0}
                />
              </Box>
            ),
          },
        ]}
      />
      <CompanyDialog open={open} onClose={() => setOpen(false)} company={editing} onSaved={refresh} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="Only companies without deployments, stock or users can be deleted."
        confirmLabel="Delete"
      />
    </Card>
  )
}

const readLogo = (file) =>
  new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Choose an image file (PNG, JPG or SVG).'))
    if (file.size > LOGO_MAX_BYTES) return reject(new Error('Use a logo under 300 KB.'))
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('The file could not be read.'))
    reader.readAsDataURL(file)
  })

function CompanyDialog({ open, onClose, company, onSaved }) {
  const isEdit = Boolean(company)
  const [error, setError] = useState(null)
  const [logo, setLogo] = useState(null)
  const fileRef = useRef(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: company
      ? {
          name: company.name,
          code: company.code,
          legalName: company.legalName,
          numberPrefix: company.numberPrefix,
          tin: company.tin ?? '',
          address: company.address ?? '',
          phone: company.phone ?? '',
          email: company.email ?? '',
          roadMapTitle: company.roadMapTitle ?? '',
        }
      : { name: '', code: '', legalName: '', numberPrefix: '', tin: '', address: '', phone: '', email: '', roadMapTitle: '' },
  })
  const currentLogo = logo === null ? (company?.logoDataUrl ?? null) : logo || null
  const save = useApiMutation({
    mutationFn: (v) => {
      const body = { ...v, logoDataUrl: currentLogo }
      return isEdit ? http.put(`/companies/${company.id}`, body) : http.post('/companies', body)
    },
    invalidate: [['companies'], ['reference']],
    success: isEdit ? 'Company updated' : 'Company added',
    setError: setFieldError,
    onSuccess: () => {
      reset()
      setLogo(null)
      onSaved()
      onClose()
    },
  })
  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    try {
      await save.mutateAsync(v)
    } catch (e) {
      if (!e.fieldErrors?.length) setError(e)
    }
  })
  const pickLogo = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      setLogo(await readLogo(file))
      setError(null)
    } catch (err) {
      setError(err)
    }
  }
  if (!open) return null
  const prefixFrozen = isEdit && company.deploymentCount > 0
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${company.name}` : 'Add company'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Add company'}
          </Button>
        </>
      }
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}
      >
        {error ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="danger">{error.message}</InlineAlert>
          </Box>
        ) : null}
        <Field label="Short name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Required' })} autoFocus />
        </Field>
        <Field label="Code" required error={errors.code?.message} hint="Matches the vehicle owner value (e.g. GORILLAND).">
          <Input {...register('code', { required: 'Required' })} mono uppercase disabled={isEdit} />
        </Field>
        <Field label="Legal name" required error={errors.legalName?.message} hint="Printed on the road map letterhead.">
          <Input {...register('legalName', { required: 'Required' })} />
        </Field>
        <Field
          label="Deployment number prefix"
          required
          error={errors.numberPrefix?.message}
          hint={prefixFrozen ? 'Frozen: deployments have been numbered with it.' : 'e.g. GSL → GSL1/00001/2026 and GSL2/00001/2026.'}
        >
          <Input {...register('numberPrefix', { required: 'Required' })} mono uppercase disabled={prefixFrozen} />
        </Field>
        <Field label="TIN / VAT" error={errors.tin?.message}>
          <Input {...register('tin')} mono />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input {...register('phone')} />
        </Field>
        <Field label="Email" error={errors.email?.message}>
          <Input type="email" {...register('email')} />
        </Field>
        <Field label="Address" error={errors.address?.message}>
          <Input {...register('address')} />
        </Field>
        <Field
          label="Road map title"
          error={errors.roadMapTitle?.message}
          hint="Leave empty for the standard trilingual title."
          sx={{ gridColumn: { sm: 'span 2' } }}
        >
          <Textarea rows={2} {...register('roadMapTitle')} />
        </Field>
        <Box sx={{ gridColumn: { sm: 'span 2' } }}>
          <Field label="Logo" error={errors.logoDataUrl?.message} hint="Shown on the road map. PNG, JPG or SVG under 300 KB.">
            <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
              <Box
                sx={{
                  width: 56,
                  height: 56,
                  borderRadius: '50%',
                  border: 1,
                  borderColor: 'divider',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  bgcolor: 'background.subtle',
                  flexShrink: 0,
                }}
              >
                {currentLogo ? (
                  <Box component="img" src={currentLogo} alt="Logo preview" sx={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Typography sx={{ fontSize: 11, color: 'text.muted' }}>None</Typography>
                )}
              </Box>
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickLogo} />
              <Button size="sm" icon={UploadIcon} onClick={() => fileRef.current?.click()}>
                {currentLogo ? 'Replace logo' : 'Upload logo'}
              </Button>
              {currentLogo ? (
                <Button size="sm" variant="ghost" onClick={() => setLogo('')}>
                  Remove
                </Button>
              ) : null}
            </Stack>
          </Field>
        </Box>
      </Box>
    </Dialog>
  )
}
