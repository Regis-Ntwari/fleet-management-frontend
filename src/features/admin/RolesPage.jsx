import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import LockIcon from '@mui/icons-material/Lock'
import { http } from '@/api/client'
import { useApiMutation } from '@/features/common/hooks'
import { usePermissions, useRoles } from '@/features/admin/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState, InlineAlert } from '@/components/ui/Feedback'
import { formatRelative } from '@/utils/format'

export default function RolesPage() {
  const roles = useRoles()
  const permissions = usePermissions()
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const total = permissions.all.length
  const remove = useApiMutation({
    mutationFn: (r) => http.delete(`/roles/${r.id}`),
    invalidate: [['roles'], ['reference']],
    success: (_, r) => `${r.name} deleted`,
    onSuccess: () => setDeleting(null),
  })
  const columns = [
    {
      key: 'name',
      header: 'Role',
      render: (r) => (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <StatusBadge kind="role" value={r.code} dot={false} />
          {r.system ? (
            <Badge tone="neutral" size="sm">
              <LockIcon sx={{ fontSize: 11, mr: 0.5, verticalAlign: '-1px' }} aria-hidden />
              System
            </Badge>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (r) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 420, color: 'text.secondary' }}>
          {r.description ?? (
            <Box component="span" sx={{ color: 'text.faint' }}>
              —
            </Box>
          )}
        </Box>
      ),
      hideBelow: 'md',
    },
    {
      key: 'permissions',
      header: 'Permissions',
      align: 'right',
      render: (r) => (
        <Box component="span" className="tabular">
          {r.permissions.length}
          <Box component="span" sx={{ color: 'text.muted' }}>
            {' '}
            / {total || '…'}
          </Box>
        </Box>
      ),
    },
    {
      key: 'users',
      header: 'Users',
      align: 'right',
      render: (r) => (
        <Box component="span" className="tabular">
          {r.userCount}
          {r.userCount !== r.activeUserCount ? (
            <Box component="span" sx={{ color: 'text.muted' }}>
              {' '}
              ({r.activeUserCount} active)
            </Box>
          ) : null}
        </Box>
      ),
    },
    { key: 'updatedAt', header: 'Updated', render: (r) => formatRelative(r.updatedAt), hideBelow: 'lg' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(r)
              setOpen(true)
            }}
          />
          <IconButton
            label={r.system ? 'System roles cannot be deleted' : r.userCount ? 'Move its users first' : 'Delete'}
            icon={DeleteOutlineIcon}
            size="xs"
            disabled={r.system || r.userCount > 0}
            onClick={() => setDeleting(r)}
          />
        </Box>
      ),
    },
  ]
  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Roles"
        description="A role is a named bundle of permissions. Users never hold permissions directly: they get exactly what their role carries. The permission list itself is fixed by the system."
        actions={
          <Button
            variant="primary"
            icon={AddIcon}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            New role
          </Button>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={roles.roles}
          isLoading={roles.isLoading}
          error={roles.isError ? roles.error : null}
          onRetry={roles.refetch}
          empty={<EmptyState title="No roles yet" compact />}
        />
      </Card>
      {open ? <RoleDialog key={editing?.id ?? 'new'} onClose={() => setOpen(false)} role={editing} groups={permissions.groups} /> : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="The role is removed permanently. Nobody holds it, so no account loses access."
        confirmLabel="Delete role"
      />
    </Stack>
  )
}

function RoleDialog({ onClose, role, groups }) {
  const isEdit = Boolean(role)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(() => new Set(role?.permissions ?? []))
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    clearErrors,
    formState: { errors },
  } = useForm({ values: role ? { name: role.name, description: role.description ?? '' } : { name: '', description: '' } })
  const allCodes = useMemo(() => groups.flatMap((g) => g.permissions.map((p) => p.code)), [groups])
  const save = useApiMutation({
    mutationFn: (v) => {
      const body = { name: v.name, description: v.description || null, permissions: [...selected] }
      return isEdit ? http.put(`/roles/${role.id}`, body) : http.post('/roles', body)
    },
    invalidate: [['roles'], ['reference'], ['users']],
    success: isEdit ? 'Role updated' : 'Role created',
    setError: setFieldError,
    onSuccess: () => {
      reset()
      onClose()
    },
  })
  const onSubmit = handleSubmit(async (v) => {
    setError(null)
    if (!role?.system && selected.size === 0) {
      setFieldError('permissions', { type: 'manual', message: 'Pick at least one permission.' })
      return
    }
    try {
      await save.mutateAsync(v)
    } catch (e) {
      if (!e.fieldErrors?.length) setError(e)
    }
  })
  const locked = Boolean(role?.system)
  const toggle = (code, on) => {
    clearErrors('permissions')
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(code)
      else next.delete(code)
      return next
    })
  }
  const toggleGroup = (codes, on) => {
    clearErrors('permissions')
    setSelected((prev) => {
      const next = new Set(prev)
      codes.forEach((c) => (on ? next.add(c) : next.delete(c)))
      return next
    })
  }
  const count = locked ? allCodes.length : selected.size
  return (
    <Dialog
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit role · ${role.name}` : 'New role'}
      description={
        locked
          ? 'System roles always hold every permission; only the name and description can change.'
          : `${count} of ${allCodes.length} permissions selected.`
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save role' : 'Create role'}
          </Button>
        </>
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'minmax(0, 1fr) minmax(0, 2fr)' } }}>
          <Field label="Name" required error={errors.name?.message} hint={isEdit ? `Code ${role.code} stays the same.` : undefined}>
            <Input {...register('name', { required: 'Required' })} autoFocus invalid={!!errors.name} />
          </Field>
          <Field label="Description" error={errors.description?.message}>
            <Textarea rows={1} {...register('description')} placeholder="Who holds this role and what it is for" />
          </Field>
        </Box>
        <Box>
          <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', mb: 1 }}>
            <Typography component="h3" variant="h3">
              Permissions
            </Typography>
            {!locked ? (
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <Button size="xs" variant="link" onClick={() => toggleGroup(allCodes, true)}>
                  Select all
                </Button>
                <Button size="xs" variant="link" onClick={() => toggleGroup(allCodes, false)}>
                  Clear
                </Button>
              </Box>
            ) : null}
          </Box>
          {errors.permissions?.message ? (
            <InlineAlert tone="danger" sx={{ mb: 1.5 }}>
              {errors.permissions.message}
            </InlineAlert>
          ) : null}
          <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' } }}>
            {groups.map((g) => {
              const codes = g.permissions.map((p) => p.code)
              const on = codes.filter((c) => locked || selected.has(c)).length
              return (
                <Box key={g.group} sx={{ border: 1, borderColor: 'divider', borderRadius: '8px', overflow: 'hidden' }}>
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 1,
                      py: 0.25,
                      borderBottom: 1,
                      borderColor: 'divider',
                      bgcolor: 'background.subtle',
                    }}
                  >
                    <Checkbox
                      size="small"
                      checked={on === codes.length}
                      indeterminate={on > 0 && on < codes.length}
                      disabled={locked}
                      onChange={(e) => toggleGroup(codes, e.target.checked)}
                      slotProps={{ input: { 'aria-label': `All ${g.group} permissions` } }}
                    />
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{g.group}</Typography>
                    <Typography sx={{ ml: 'auto', fontSize: 12, color: 'text.muted' }} className="tabular">
                      {on}/{codes.length}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', px: 1, py: 0.5 }}>
                    {g.permissions.map((p) => (
                      <FormControlLabel
                        key={p.code}
                        sx={{ mx: 0, alignItems: 'flex-start', '& .MuiFormControlLabel-label': { pt: 0.9 } }}
                        control={
                          <Checkbox
                            size="small"
                            checked={locked || selected.has(p.code)}
                            disabled={locked}
                            onChange={(e) => toggle(p.code, e.target.checked)}
                          />
                        }
                        label={
                          <Box component="span" sx={{ display: 'block' }}>
                            <Box component="span" sx={{ display: 'block', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                              {p.label}
                            </Box>
                            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted', lineHeight: 1.35 }}>
                              {p.description}
                            </Box>
                          </Box>
                        }
                      />
                    ))}
                  </Box>
                </Box>
              )
            })}
          </Box>
        </Box>
      </Box>
    </Dialog>
  )
}
