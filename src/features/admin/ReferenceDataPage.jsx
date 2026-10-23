import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import ListSubheader from '@mui/material/ListSubheader'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutlined'
import PauseCircleOutlineIcon from '@mui/icons-material/PauseCircleOutlined'
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutlined'
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward'
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward'
import LockOutlinedIcon from '@mui/icons-material/LockOutlined'
import { http } from '@/api/client'
import { useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Card, CardBody, CardHeader } from '@/components/ui/Card'
import { DataTable } from '@/components/ui/DataTable'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog'
import { EmptyState, ErrorState, InlineAlert, Skeleton } from '@/components/ui/Feedback'
import { humanize } from '@/utils/format'

const INVALIDATE = [['lookups'], ['reference']]
const TONES = [
  { value: 'neutral', label: 'Grey' },
  { value: 'success', label: 'Green' },
  { value: 'info', label: 'Blue' },
  { value: 'accent', label: 'Accent' },
  { value: 'warning', label: 'Amber' },
  { value: 'danger', label: 'Red' },
]
const KIND_COPY = {
  coded: 'Each value has a stable code stored on records. Codes cannot change; labels and colours can.',
  text: 'Plain suggestions offered in a free-text field. People can still type something else.',
  status: 'Workflow states driven by business rules. Rename or recolour them; states cannot be added or removed.',
}

/** Administration → Reference data: every dropdown and suggestion list in one place. */
export default function ReferenceDataPage() {
  const lists = useQuery({ queryKey: ['lookups'], queryFn: () => http.get('/lookups'), staleTime: 30_000 })
  const [params, setParams] = useSearchParams()
  const selectedKey = params.get('list') ?? lists.data?.[0]?.key
  const selected = lists.data?.find((l) => l.key === selectedKey) ?? null
  const select = (key) => setParams({ list: key }, { replace: true })

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Reference data"
        description="The values behind every dropdown and suggestion box. Changes apply immediately to every form; retired values stay on existing records."
      />
      {lists.isError ? (
        <ErrorState error={lists.error} onRetry={lists.refetch} />
      ) : (
        <Box
          sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: '280px minmax(0, 1fr)' }, alignItems: 'start' }}
        >
          <Card>
            {lists.isLoading ? (
              <Box sx={{ p: 2 }}>
                <Skeleton height={320} />
              </Box>
            ) : (
              <ListNav lists={lists.data ?? []} selectedKey={selectedKey} onSelect={select} />
            )}
          </Card>
          {selected ? <ListPanel key={selected.key} list={selected} /> : lists.isLoading ? <Skeleton height={400} /> : null}
        </Box>
      )}
    </Stack>
  )
}

function ListNav({ lists, selectedKey, onSelect }) {
  const groups = [...new Set(lists.map((l) => l.group))]
  return (
    <Box component="nav" aria-label="Reference lists" sx={{ py: 1 }}>
      {groups.map((group) => (
        <List key={group} dense subheader={<ListSubheader component="p">{group}</ListSubheader>} sx={{ px: 1 }}>
          {lists
            .filter((l) => l.group === group)
            .map((l) => (
              <ListItemButton key={l.key} selected={l.key === selectedKey} onClick={() => onSelect(l.key)} sx={{ borderRadius: 1 }}>
                <ListItemText primary={l.name} slotProps={{ primary: { noWrap: true, sx: { fontSize: 13.5 } } }} />
                <Typography className="tabular" sx={{ fontSize: 12, color: 'text.muted', ml: 1 }}>
                  {l.items.filter((i) => i.active).length}
                </Typography>
              </ListItemButton>
            ))}
        </List>
      ))}
    </Box>
  )
}

function ListPanel({ list }) {
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const isStatus = list.kind === 'status'
  const toggle = useApiMutation({
    mutationFn: (i) => http.patch(`/lookups/${list.key}/items/${i.id}/status`, { active: !i.active }),
    invalidate: INVALIDATE,
    success: (i) => `${i.label} ${i.active ? 'activated' : 'retired'}`,
    onSuccess: () => setToggling(null),
  })
  const remove = useApiMutation({
    mutationFn: (i) => http.delete(`/lookups/${list.key}/items/${i.id}`),
    invalidate: INVALIDATE,
    success: (_, i) => `${i.label} deleted`,
    onSuccess: () => setDeleting(null),
  })
  const reorder = useApiMutation({
    mutationFn: (ids) => http.put(`/lookups/${list.key}/order`, { ids }),
    invalidate: INVALIDATE,
  })
  const move = (item, delta) => {
    const ids = list.items.map((i) => i.id)
    const from = ids.indexOf(item.id)
    const to = from + delta
    if (to < 0 || to >= ids.length) return
    ids.splice(from, 1)
    ids.splice(to, 0, item.id)
    reorder.mutate(ids)
  }

  const columns = [
    {
      key: 'label',
      header: 'Value',
      render: (i) => (
        <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Badge tone={i.tone} size="sm" dot>
            {i.label}
          </Badge>
          {list.kind === 'coded' || isStatus ? (
            <Box component="span" sx={{ fontSize: 12, color: 'text.muted', fontFamily: (t) => t.typography.fontFamilyMono }}>
              {i.value}
            </Box>
          ) : null}
          {i.system ? (
            <Box component="span" title="Used by business rules" sx={{ display: 'inline-flex', color: 'text.faint' }}>
              <LockOutlinedIcon sx={{ fontSize: 14 }} aria-label="Used by business rules" />
            </Box>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (i) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 420, color: 'text.secondary' }}>
          {i.description ?? (
            <Box component="span" sx={{ color: 'text.faint' }}>
              —
            </Box>
          )}
        </Box>
      ),
      hideBelow: 'md',
    },
    {
      key: 'usageCount',
      header: 'In use',
      align: 'right',
      render: (i) => (
        <Box component="span" className="tabular" sx={{ color: i.usageCount ? 'text.primary' : 'text.faint' }}>
          {i.usageCount}
        </Box>
      ),
      hideBelow: 'sm',
    },
    {
      key: 'active',
      header: 'Status',
      render: (i) =>
        i.active ? (
          <Badge tone="success" size="sm" dot>
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" size="sm" dot>
            Retired
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (i, index) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton
            label="Move up"
            icon={ArrowUpwardIcon}
            size="xs"
            disabled={index === 0 || reorder.isPending}
            onClick={() => move(i, -1)}
          />
          <IconButton
            label="Move down"
            icon={ArrowDownwardIcon}
            size="xs"
            disabled={index === list.items.length - 1 || reorder.isPending}
            onClick={() => move(i, 1)}
          />
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(i)
              setOpen(true)
            }}
          />
          {!isStatus ? (
            <>
              <IconButton
                label={i.system ? 'Used by business rules' : i.active ? 'Retire' : 'Activate'}
                icon={i.active ? PauseCircleOutlineIcon : PlayCircleOutlineIcon}
                size="xs"
                disabled={i.system}
                onClick={() => setToggling(i)}
              />
              <IconButton
                label={i.system ? 'Used by business rules' : i.usageCount ? 'Still in use: retire it instead' : 'Delete'}
                icon={DeleteOutlineIcon}
                size="xs"
                disabled={i.system || i.usageCount > 0}
                onClick={() => setDeleting(i)}
              />
            </>
          ) : null}
        </Box>
      ),
    },
  ]

  return (
    <Card>
      <CardHeader
        title={list.name}
        description={list.description}
        actions={
          !isStatus ? (
            <Button
              variant="primary"
              size="sm"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add value
            </Button>
          ) : null
        }
      />
      <CardBody sx={{ pb: 1.5 }}>
        <InlineAlert tone={isStatus ? 'info' : 'neutral'}>
          {KIND_COPY[list.kind]}
          {list.usedBy.length
            ? ` Stored on ${list.usedBy
                .map((u) => humanize(u.split('.')[0]))
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(', ')}.`
            : ''}
        </InlineAlert>
      </CardBody>
      <DataTable
        columns={columns}
        rows={list.items}
        rowKey={(i) => i.id}
        stickyHeader={false}
        empty={<EmptyState title="No values yet" description="Add the first value to offer it in forms." compact />}
      />
      <ItemDialog open={open} onClose={() => setOpen(false)} list={list} item={editing} />
      <ConfirmDialog
        open={Boolean(toggling)}
        onClose={() => setToggling(null)}
        onConfirm={() => toggle.mutate(toggling)}
        loading={toggle.isPending}
        tone={toggling?.active ? 'danger' : 'primary'}
        title={toggling?.active ? `Retire "${toggling.label}"?` : `Activate "${toggling?.label}"?`}
        description={
          toggling?.active ? 'It stops being offered in forms. Records that already use it keep it.' : 'It is offered in forms again.'
        }
        confirmLabel={toggling?.active ? 'Retire' : 'Activate'}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting)}
        loading={remove.isPending}
        title={`Delete "${deleting?.label}"?`}
        description="Only values no record uses can be deleted. This cannot be undone."
        confirmLabel="Delete value"
      />
    </Card>
  )
}

function ItemDialog({ open, onClose, list, item }) {
  const isEdit = Boolean(item)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: item
      ? { label: item.label, value: item.value, tone: item.tone, description: item.description ?? '' }
      : { label: '', value: '', tone: 'neutral', description: '' },
  })
  const save = useApiMutation({
    mutationFn: (v) => {
      const body = { label: v.label, tone: v.tone, description: v.description || null }
      return isEdit
        ? http.put(`/lookups/${list.key}/items/${item.id}`, body)
        : http.post(`/lookups/${list.key}/items`, { ...body, value: v.value })
    },
    invalidate: INVALIDATE,
    success: isEdit ? 'Value updated' : 'Value added',
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
  const showCode = list.kind !== 'text'
  const showTone = list.kind !== 'text'
  const tone = watch('tone')
  const label = watch('label')
  return (
    <Dialog
      open
      onClose={onClose}
      size="sm"
      title={isEdit ? `Edit value · ${item.label}` : `Add to ${list.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Add value'}
          </Button>
        </>
      }
    >
      <Box component="form" onSubmit={onSubmit} noValidate sx={{ display: 'grid', gap: 2 }}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Label" required error={errors.label?.message} hint="What people see in the dropdown.">
          <Input {...register('label', { required: 'Required' })} autoFocus invalid={!!errors.label} />
        </Field>
        {showCode ? (
          <Field
            label="Code"
            error={errors.value?.message}
            hint={
              isEdit ? 'Codes are stored on records and cannot change.' : 'Left blank, it is derived from the label. Cannot change later.'
            }
          >
            <Input {...register('value')} uppercase mono disabled={isEdit} invalid={!!errors.value} />
          </Field>
        ) : null}
        {showTone ? (
          <Field label="Colour" error={errors.tone?.message}>
            <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: '1fr auto', alignItems: 'center' }}>
              <Select {...register('tone')}>
                {TONES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
              <Badge tone={tone} dot>
                {label || 'Preview'}
              </Badge>
            </Box>
          </Field>
        ) : null}
        <Field label="Description" error={errors.description?.message} hint="Optional note for administrators.">
          <Textarea rows={2} {...register('description')} />
        </Field>
      </Box>
    </Dialog>
  )
}
