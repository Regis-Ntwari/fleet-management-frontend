import { useState } from 'react'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined'
import { http } from '@/api/client'
import { useApiMutation } from '@/features/common/hooks'
import { useDepartments } from '@/features/admin/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState, InlineAlert, LinkText } from '@/components/ui/Feedback'

const INVALIDATE = [['departments'], ['users'], ['incidents'], ['vehicles', 'departments']]

export default function DepartmentsPage() {
  const departments = useDepartments()
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const toggle = useApiMutation({
    mutationFn: (d) => http.patch(`/departments/${d.id}/status`, { active: !d.active }),
    invalidate: INVALIDATE,
    success: (d) => `${d.name} ${d.active ? 'activated' : 'deactivated'}`,
    onSuccess: () => setToggling(null),
  })
  const remove = useApiMutation({
    mutationFn: (d) => http.delete(`/departments/${d.id}`),
    invalidate: INVALIDATE,
    success: (_, d) => `${d.name} deleted`,
    onSuccess: () => setDeleting(null),
  })
  const columns = [
    {
      key: 'name',
      header: 'Department',
      render: (d) => (
        <Box component="span">
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
            {d.name}
          </Box>
          <Box
            component="span"
            sx={{ display: 'block', fontSize: 12, color: 'text.muted', fontFamily: (t) => t.typography.fontFamilyMono }}
          >
            {d.code}
          </Box>
        </Box>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (d) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 420, color: 'text.secondary' }}>
          {d.description ?? (
            <Box component="span" sx={{ color: 'text.faint' }}>
              —
            </Box>
          )}
        </Box>
      ),
      hideBelow: 'md',
    },
    {
      key: 'members',
      header: 'Members',
      align: 'right',
      render: (d) => (
        <LinkText to={`/admin/users?departmentId=${d.id}`} className="tabular">
          {d.memberCount}
        </LinkText>
      ),
    },
    {
      key: 'incidents',
      header: 'Open incidents',
      align: 'right',
      render: (d) =>
        d.openIncidentCount ? (
          <LinkText to={`/incidents?departmentId=${d.id}&status=OPEN,UNDER_INVESTIGATION`} className="tabular">
            {d.openIncidentCount}
          </LinkText>
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            0
          </Box>
        ),
      hideBelow: 'sm',
    },
    {
      key: 'active',
      header: 'Status',
      render: (d) =>
        d.active ? (
          <Badge tone="success" size="sm" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm" dot>
            Inactive
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (d) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(d)
              setOpen(true)
            }}
          />
          <IconButton
            label={d.active ? 'Deactivate' : 'Activate'}
            icon={d.active ? PauseCircleOutlineIcon : PlayCircleOutlineIcon}
            size="xs"
            onClick={() => setToggling(d)}
          />
          <IconButton
            label={d.memberCount ? 'Move its members first' : 'Delete'}
            icon={DeleteOutlineIcon}
            size="xs"
            disabled={d.memberCount > 0}
            onClick={() => setDeleting(d)}
          />
        </Box>
      ),
    },
  ]
  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Departments"
        description="Every user belongs to one department. An incident is assigned to a department, and everyone in it is notified when it arrives or is handed over."
        actions={
          <Button
            variant="primary"
            icon={AddIcon}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            New department
          </Button>
        }
      />
      <Card>
        <DataTable
          columns={columns}
          rows={departments.departments}
          isLoading={departments.isLoading}
          error={departments.isError ? departments.error : null}
          onRetry={departments.refetch}
          empty={<EmptyState title="No departments yet" compact />}
        />
      </Card>
      <DepartmentDialog open={open} onClose={() => setOpen(false)} department={editing} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={() => toggle.mutate(toggling)}
        loading={toggle.isPending}
        tone={toggling?.active ? 'danger' : 'primary'}
        title={toggling?.active ? `Deactivate ${toggling.name}?` : `Activate ${toggling?.name}?`}
        description={
          toggling?.active
            ? 'It stops appearing in pickers. Existing members and incidents keep their link until they are moved.'
            : 'It becomes available again when assigning users and incidents.'
        }
        confirmLabel={toggling?.active ? 'Deactivate' : 'Activate'}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        loading={remove.isPending}
        title={`Delete ${deleting?.name}?`}
        description="Departments with incident history cannot be deleted; deactivate them instead."
        confirmLabel="Delete department"
      />
    </Stack>
  )
}

function DepartmentDialog({ open, onClose, department }) {
  const isEdit = Boolean(department)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: department
      ? { name: department.name, code: department.code, description: department.description ?? '' }
      : { name: '', code: '', description: '' },
  })
  const save = useApiMutation({
    mutationFn: (v) => {
      const body = { name: v.name, code: v.code, description: v.description || null }
      return isEdit ? http.put(`/departments/${department.id}`, body) : http.post('/departments', body)
    },
    invalidate: INVALIDATE,
    success: isEdit ? 'Department updated' : 'Department created',
    setError: setFieldError,
    onSuccess: () => {
      reset()
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
      size="sm"
      title={isEdit ? `Edit department · ${department.name}` : 'New department'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Create department'}
          </Button>
        </>
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Name" required error={errors.name?.message}>
          <Input {...register('name', { required: 'Required' })} autoFocus invalid={!!errors.name} />
        </Field>
        <Field label="Code" error={errors.code?.message} hint="Short tag shown in lists. Left blank, it is derived from the name.">
          <Input {...register('code')} uppercase mono maxLength={12} invalid={!!errors.code} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <Textarea rows={2} {...register('description')} />
        </Field>
      </Box>
    </Dialog>
  )
}
