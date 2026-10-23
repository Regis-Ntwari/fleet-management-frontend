import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useApiMutation } from '@/features/common/hooks'
import { Card, CardHeader } from '@/components/ui/Card'
import { Button, IconButton } from '@/components/ui/Button'
import { Field, Input, Switch, Textarea } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/DataTable'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/Feedback'
import { formatCurrency } from '@/utils/format'

const mono = (t) => t.typography.fontFamilyMono

/** Tariff categories (CAT1–CAT3) a deployment is billed under, each with a configured daily rate. */
export function TariffsTab() {
  const { can } = useAuth()
  const queryClient = useQueryClient()
  const tariffs = useQuery({ queryKey: ['tariffs'], queryFn: () => http.get('/tariffs') })
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const manage = can('SETTINGS_MANAGE')
  const refresh = () => {
    tariffs.refetch()
    queryClient.invalidateQueries({ queryKey: ['reference'] })
  }
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/tariffs/${id}`),
    invalidate: [['tariffs'], ['reference']],
    success: 'Category deleted',
    onSuccess: () => {
      setDeleting(null)
      refresh()
    },
  })
  const toggle = useApiMutation({
    mutationFn: (t) => http.put(`/tariffs/${t.id}`, { active: !t.active }),
    invalidate: [['tariffs'], ['reference']],
    onSuccess: refresh,
  })
  return (
    <Card>
      <CardHeader
        title="Deployment tariffs"
        description="Vehicle categories a deployment is billed under. The daily rate times the effective days gives the deployment amount; existing deployments keep the rate they were registered at."
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
              Add category
            </Button>
          ) : null
        }
      />
      <DataTable
        stickyHeader={false}
        isLoading={tariffs.isLoading}
        rows={tariffs.data ?? []}
        columns={[
          { key: 'code', header: 'Code', sx: { fontFamily: mono, fontSize: 12.5, fontWeight: 500 } },
          { key: 'name', header: 'Name' },
          { key: 'description', header: 'Description', hideBelow: 'md' },
          { key: 'dailyRate', header: 'Rate per day', align: 'right', render: (t) => formatCurrency(t.dailyRate) },
          { key: 'deploymentCount', header: 'Deployments', align: 'right', hideBelow: 'sm' },
          {
            key: 'active',
            header: 'Active',
            render: (t) =>
              manage ? (
                <Switch size="sm" checked={t.active} onChange={() => toggle.mutate(t)} label={`${t.code} active`} />
              ) : t.active ? (
                'Yes'
              ) : (
                'No'
              ),
          },
          manage && {
            key: 'actions',
            header: '',
            align: 'right',
            render: (t) => (
              <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
                <IconButton
                  label="Edit"
                  icon={EditIcon}
                  size="xs"
                  onClick={() => {
                    setEditing(t)
                    setOpen(true)
                  }}
                />
                <IconButton label="Delete" icon={DeleteIcon} size="xs" onClick={() => setDeleting(t)} disabled={t.deploymentCount > 0} />
              </Box>
            ),
          },
        ]}
      />
      <TariffDialog open={open} onClose={() => setOpen(false)} tariff={editing} onSaved={refresh} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title={`Delete ${deleting?.code}?`}
        description="Only categories with no deployments can be deleted."
        confirmLabel="Delete"
      />
    </Card>
  )
}

function TariffDialog({ open, onClose, tariff, onSaved }) {
  const isEdit = Boolean(tariff)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: tariff
      ? { code: tariff.code, name: tariff.name, dailyRate: tariff.dailyRate, description: tariff.description ?? '' }
      : { code: '', name: '', dailyRate: '', description: '' },
  })
  const save = useApiMutation({
    mutationFn: (v) => (isEdit ? http.put(`/tariffs/${tariff.id}`, v) : http.post('/tariffs', v)),
    invalidate: [['tariffs'], ['reference']],
    success: isEdit ? 'Category updated' : 'Category added',
    setError: setFieldError,
    onSuccess: () => {
      reset()
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
  if (!open) return null
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${tariff.code}` : 'Add category'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <Stack component="form" onSubmit={onSubmit} noValidate spacing={2}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Code" required error={errors.code?.message} hint="e.g. CAT1">
          <Input {...register('code', { required: 'Required' })} mono uppercase disabled={isEdit} autoFocus={!isEdit} />
        </Field>
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Required' })} />
        </Field>
        <Field label="Rate per day" required error={errors.dailyRate?.message}>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step="1000"
            {...register('dailyRate', { required: 'Required' })}
            trailing="RWF"
          />
        </Field>
        <Field label="Description">
          <Textarea rows={2} {...register('description')} />
        </Field>
      </Stack>
    </Dialog>
  )
}
