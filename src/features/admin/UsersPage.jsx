import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import KeyIcon from '@mui/icons-material/Key'
import PersonOffIcon from '@mui/icons-material/PersonOff'
import HowToRegIcon from '@mui/icons-material/HowToReg'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select, Field, Input } from '@/components/ui/Field'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { Avatar } from '@/components/ui/Avatar'
import { SegmentedControl } from '@/components/ui/Tabs'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState, InlineAlert } from '@/components/ui/Feedback'
import { formatRelative, formatDate } from '@/utils/format'

export default function UsersPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const { user: me } = useAuth()
  const roles = useOptions('role')
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [resetting, setResetting] = useState(null)
  const [toggling, setToggling] = useState(null)
  const params = useMemo(
    () => ({ q: state.q, role: state.role, active: state.active, page: state.page, size: state.size, sort: state.sort }),
    [state],
  )
  const query = usePagedQuery(['users', 'list'], '/users', params)
  const toggle = useApiMutation({
    mutationFn: (u) => http.patch(`/users/${u.id}/status`, { active: !u.active }),
    invalidate: [['users']],
    success: (u) => `${u.firstName} ${u.lastName} ${u.active ? 'activated' : 'deactivated'}`,
    onSuccess: () => setToggling(null),
  })
  const columns = [
    {
      key: 'name',
      header: 'User',
      sortKey: 'lastName',
      render: (u) => (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
          <Avatar name={`${u.firstName} ${u.lastName}`} size="sm" />
          <Box component="span">
            <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
              {u.firstName} {u.lastName}
              {u.id === me.id ? (
                <Box component="span" sx={{ ml: 0.75, fontSize: 11, color: 'text.muted' }}>
                  (you)
                </Box>
              ) : null}
            </Box>
            <Box component="span" sx={{ display: 'block', fontSize: 12, color: 'text.muted' }}>
              {u.email}
            </Box>
          </Box>
        </Box>
      ),
    },
    { key: 'role', header: 'Role', sortKey: 'role', render: (u) => <StatusBadge kind="role" value={u.role} size="sm" dot={false} /> },
    { key: 'phone', header: 'Phone', hideBelow: 'lg' },
    {
      key: 'active',
      header: 'Status',
      render: (u) =>
        u.active ? (
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
      key: 'lastLoginAt',
      header: 'Last login',
      sortKey: 'lastLoginAt',
      render: (u) =>
        u.lastLoginAt ? (
          formatRelative(u.lastLoginAt)
        ) : (
          <Box component="span" sx={{ color: 'text.faint' }}>
            never
          </Box>
        ),
      hideBelow: 'md',
    },
    { key: 'createdAt', header: 'Created', render: (u) => formatDate(u.createdAt), hideBelow: 'xl' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (u) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(u)
              setOpen(true)
            }}
          />
          <IconButton label="Reset password" icon={KeyIcon} size="xs" onClick={() => setResetting(u)} />
          <IconButton
            label={u.active ? 'Deactivate' : 'Activate'}
            icon={u.active ? PersonOffIcon : HowToRegIcon}
            size="xs"
            onClick={() => setToggling(u)}
            disabled={u.id === me.id}
          />
        </Box>
      ),
    },
  ]
  return (
    <Box>
      <PageHeader
        title="Users"
        description="Accounts and roles. Permissions are enforced on the backend for every request."
        actions={
          <Button
            variant="primary"
            icon={AddIcon}
            onClick={() => {
              setEditing(null)
              setOpen(true)
            }}
          >
            Add user
          </Button>
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Name, email, phone…"
        defaultSort="lastName,asc"
        filters={
          <>
            <Select
              value={state.role ?? ''}
              onChange={(e) => update({ role: e.target.value })}
              compact
              placeholder="Any role"
              aria-label="Role"
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
            <SegmentedControl
              label="Status"
              value={state.active ?? ''}
              onChange={(v) => update({ active: v })}
              options={[
                { value: '', label: 'All' },
                { value: 'true', label: 'Active' },
                { value: 'false', label: 'Inactive' },
              ]}
            />
          </>
        }
        empty={<EmptyState title="No users match" compact />}
      />
      <UserDialog open={open} onClose={() => setOpen(false)} user={editing} roles={roles} />
      <ResetDialog user={resetting} onClose={() => setResetting(null)} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={() => toggle.mutate(toggling)}
        loading={toggle.isPending}
        tone={toggling?.active ? 'danger' : 'primary'}
        title={toggling?.active ? `Deactivate ${toggling.firstName}?` : `Activate ${toggling?.firstName}?`}
        description={
          toggling?.active
            ? 'They will be signed out and unable to sign in until reactivated. Their audit history is kept.'
            : 'They will be able to sign in again with their existing password.'
        }
        confirmLabel={toggling?.active ? 'Deactivate' : 'Activate'}
      />
    </Box>
  )
}

function UserDialog({ open, onClose, user, roles }) {
  const isEdit = Boolean(user)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: user
      ? { firstName: user.firstName, lastName: user.lastName, email: user.email, phone: user.phone ?? '', role: user.role, password: '' }
      : { firstName: '', lastName: '', email: '', phone: '', role: 'VIEWER', password: '' },
  })
  const save = useApiMutation({
    mutationFn: (v) =>
      isEdit
        ? http.put(`/users/${user.id}`, {
            firstName: v.firstName,
            lastName: v.lastName,
            email: v.email,
            phone: v.phone || null,
            role: v.role,
          })
        : http.post('/users', v),
    invalidate: [['users']],
    success: isEdit ? 'User updated' : 'User created',
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
      title={isEdit ? 'Edit user' : 'Add user'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Create user'}
          </Button>
        </>
      }
    >
      <Box
        component="form"
        onSubmit={onSubmit}
        noValidate
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))' } }}
      >
        {error ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="danger">{error.message}</InlineAlert>
          </Box>
        ) : null}
        <Field label="First name" required error={errors.firstName?.message}>
          <Input {...register('firstName', { required: 'Required' })} autoFocus />
        </Field>
        <Field label="Last name" required error={errors.lastName?.message}>
          <Input {...register('lastName', { required: 'Required' })} />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" {...register('email', { required: 'Required' })} />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input type="tel" {...register('phone')} />
        </Field>
        <Field label="Role" required error={errors.role?.message}>
          <Select {...register('role')}>
            {roles.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
        {!isEdit ? (
          <Field
            label="Temporary password"
            required
            error={errors.password?.message}
            hint="At least 10 characters. Stored hashed with BCrypt on the backend."
          >
            <Input
              type="password"
              autoComplete="new-password"
              {...register('password', { required: 'Required', minLength: { value: 10, message: 'At least 10 characters' } })}
            />
          </Field>
        ) : null}
      </Box>
    </Dialog>
  )
}

function ResetDialog({ user, onClose }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const resetPw = useApiMutation({
    mutationFn: () => http.post(`/users/${user.id}/reset-password`, { password }),
    invalidate: [],
    success: 'Password reset',
    onSuccess: onClose,
  })
  if (!user) return null
  const submit = async () => {
    setError(null)
    try {
      await resetPw.mutateAsync()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Reset password · ${user.firstName} ${user.lastName}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={resetPw.isPending} disabled={password.length < 10}>
            Reset password
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="New password" required hint="At least 10 characters. Share it securely and ask the user to change it.">
          <Input type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
      </Stack>
    </Dialog>
  )
}
