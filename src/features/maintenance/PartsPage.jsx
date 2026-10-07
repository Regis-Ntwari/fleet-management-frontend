import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import AddBoxIcon from '@mui/icons-material/AddBox'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select, Field, Input } from '@/components/ui/Field'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/Tabs'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState, InlineAlert } from '@/components/ui/Feedback'
import { formatCurrency, formatNumber } from '@/utils/format'

export default function PartsPage() {
  const [state, update, reset] = useSearchState({ size: 25 })
  const { can } = useAuth()
  const categories = useQuery({ queryKey: ['parts', 'categories'], queryFn: () => http.get('/spare-parts/categories') })
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [adjusting, setAdjusting] = useState(null)
  const params = useMemo(
    () => ({ q: state.q, category: state.category, lowStock: state.lowStock, page: state.page, size: state.size, sort: state.sort }),
    [state],
  )
  const query = usePagedQuery(['parts', 'list'], '/spare-parts', params)
  const manage = can('PARTS_MANAGE')
  const columns = [
    {
      key: 'name',
      header: 'Part',
      sortKey: 'name',
      render: (p) => (
        <span>
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
            {p.name}
          </Box>
          <Box
            component="span"
            sx={{ display: 'block', fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 11.5, color: 'text.muted' }}
          >
            {p.partNumber}
          </Box>
        </span>
      ),
    },
    { key: 'category', header: 'Category', sortKey: 'category', hideBelow: 'md' },
    { key: 'supplier', header: 'Supplier', hideBelow: 'lg' },
    { key: 'unitCost', header: 'Unit cost', sortKey: 'unitCost', align: 'right', render: (p) => formatCurrency(p.unitCost) },
    {
      key: 'currentStock',
      header: 'In stock',
      sortKey: 'currentStock',
      align: 'right',
      render: (p) => (
        <Box component="span" sx={p.lowStock ? { fontWeight: 500, color: 'soft.danger.fg' } : undefined}>
          {formatNumber(p.currentStock)}
        </Box>
      ),
    },
    { key: 'minimumStock', header: 'Min', align: 'right', hideBelow: 'sm' },
    { key: 'stockValue', header: 'Stock value', align: 'right', render: (p) => formatCurrency(p.stockValue), hideBelow: 'xl' },
    {
      key: 'lowStock',
      header: '',
      render: (p) =>
        p.lowStock ? (
          <Badge tone="danger" size="sm" dot>
            Reorder
          </Badge>
        ) : null,
    },
    manage && {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <Box component="span" sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.25 }}>
          <IconButton label="Adjust stock" icon={AddBoxIcon} size="xs" onClick={() => setAdjusting(p)} />
          <IconButton
            label="Edit"
            icon={EditIcon}
            size="xs"
            onClick={() => {
              setEditing(p)
              setOpen(true)
            }}
          />
        </Box>
      ),
    },
  ]
  return (
    <Box>
      <PageHeader
        title="Spare parts"
        description="Workshop stock. Parts are deducted when a job starts and returned if it is cancelled."
        actions={
          manage ? (
            <Button
              variant="primary"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add part
            </Button>
          ) : null
        }
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Part number, name, supplier…"
        defaultSort="name,asc"
        filters={
          <>
            <SegmentedControl
              label="Stock"
              value={state.lowStock ?? ''}
              onChange={(v) => update({ lowStock: v })}
              options={[
                { value: '', label: 'All' },
                { value: 'true', label: 'Below minimum' },
              ]}
            />
            <Select
              value={state.category ?? ''}
              onChange={(e) => update({ category: e.target.value })}
              compact
              placeholder="All categories"
              aria-label="Category"
            >
              {(categories.data ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </>
        }
        empty={<EmptyState icon={Inventory2Icon} title="No parts match" compact />}
      />
      <PartDialog open={open} onClose={() => setOpen(false)} part={editing} />
      <AdjustDialog part={adjusting} onClose={() => setAdjusting(null)} />
    </Box>
  )
}

function PartDialog({ open, onClose, part }) {
  const isEdit = Boolean(part)
  const [error, setError] = useState(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm({
    values: part
      ? {
          partNumber: part.partNumber,
          name: part.name,
          category: part.category,
          supplier: part.supplier,
          unitCost: part.unitCost,
          minimumStock: part.minimumStock,
          currentStock: part.currentStock,
        }
      : { partNumber: '', name: '', category: '', supplier: '', unitCost: '', minimumStock: 1, currentStock: 0 },
  })
  const save = useApiMutation({
    mutationFn: (v) => (isEdit ? http.put(`/spare-parts/${part.id}`, v) : http.post('/spare-parts', v)),
    invalidate: [['parts']],
    success: isEdit ? 'Part updated' : 'Part added',
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
      setError(e)
    }
  })
  if (!open) return null
  const fe = (k) => errors[k]?.message ?? error?.fieldErrorMap?.[k]
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? 'Edit part' : 'Add part'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={save.isPending}>
            {isEdit ? 'Save' : 'Add part'}
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
        {error && !error.fieldErrors?.length ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="danger">{error.message}</InlineAlert>
          </Box>
        ) : null}
        <Field label="Part number" required error={fe('partNumber')}>
          <Input {...register('partNumber', { required: 'Required' })} mono uppercase autoFocus />
        </Field>
        <Field label="Name" required error={fe('name')}>
          <Input {...register('name', { required: 'Required' })} />
        </Field>
        <Field label="Category" required error={fe('category')}>
          <Input {...register('category', { required: 'Required' })} />
        </Field>
        <Field label="Supplier" required error={fe('supplier')}>
          <Input {...register('supplier', { required: 'Required' })} />
        </Field>
        <Field label="Unit cost" required error={fe('unitCost')}>
          <Input type="number" inputMode="numeric" {...register('unitCost', { required: 'Required' })} trailing="RWF" />
        </Field>
        <Field label="Minimum stock" required error={fe('minimumStock')}>
          <Input type="number" inputMode="numeric" {...register('minimumStock', { required: 'Required' })} />
        </Field>
        <Field
          label="Current stock"
          required
          error={fe('currentStock')}
          hint={isEdit ? 'Use Adjust stock to change the quantity.' : undefined}
        >
          <Input type="number" inputMode="numeric" {...register('currentStock', { required: 'Required' })} disabled={isEdit} />
        </Field>
      </Box>
    </Dialog>
  )
}

function AdjustDialog({ part, onClose }) {
  const [delta, setDelta] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const adjust = useApiMutation({
    mutationFn: () => http.patch(`/spare-parts/${part.id}/stock`, { delta: Number(delta), reason }),
    invalidate: [['parts']],
    success: 'Stock adjusted',
    onSuccess: onClose,
  })
  if (!part) return null
  const submit = async () => {
    setError(null)
    try {
      await adjust.mutateAsync()
    } catch (e) {
      setError(e)
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Adjust stock · ${part.name}`}
      description={`Currently ${part.currentStock} in stock. Use a negative number to remove.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={adjust.isPending} disabled={!delta || Number(delta) === 0}>
            Apply
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <Field label="Change" required>
          <Input
            type="number"
            inputMode="numeric"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="+10 or -2"
            autoFocus
          />
        </Field>
        <Field label="Reason">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Delivery, stock count, damaged…" />
        </Field>
      </Stack>
    </Dialog>
  )
}
