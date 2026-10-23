import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import SwapVertIcon from '@mui/icons-material/SwapVert'
import SwapHorizIcon from '@mui/icons-material/SwapHoriz'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import HistoryIcon from '@mui/icons-material/History'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import PaymentsIcon from '@mui/icons-material/Payments'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useCompanyOptions, useOptions, useSuggestions } from '@/app/ReferenceProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select, Field, Input, SuggestInput, Textarea } from '@/components/ui/Field'
import { Badge, StatusBadge } from '@/components/ui/Badge'
import { SegmentedControl, Tabs, useActiveTab } from '@/components/ui/Tabs'
import { Dialog } from '@/components/ui/Dialog'
import { DateRangePicker } from '@/components/ui/DateRange'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, InlineAlert } from '@/components/ui/Feedback'
import { formatCurrency, formatDateTime, formatNumber } from '@/utils/format'

const TABS = [
  { key: 'stock', label: 'Stock', icon: Inventory2Icon },
  { key: 'movements', label: 'Movements', icon: HistoryIcon },
]
const mono = (t) => t.typography.fontFamilyMono

/**
 * Spare parts and stock, kept per company. A company-scoped account only sees its own company;
 * head-office accounts choose the company first. Every receipt, issue, return, adjustment and
 * transfer is a movement, so the quantity on hand is always explainable.
 */
export default function PartsPage() {
  const { can, user } = useAuth()
  const tab = useActiveTab('tab', TABS)
  const [state, update, reset] = useSearchState({ size: 25 })
  const companies = useCompanyOptions({ includeInactive: true })
  const scopedCompanyId = user?.companyId ?? null
  const companyId = scopedCompanyId ?? (state.companyId ? Number(state.companyId) : null)
  const company = companies.find((c) => c.value === companyId)?.meta ?? null
  const summary = useQuery({ queryKey: ['parts', 'summary'], queryFn: () => http.get('/spare-parts/summary') })
  const [editing, setEditing] = useState(null)
  const [open, setOpen] = useState(false)
  const [moving, setMoving] = useState(null)
  const [transferring, setTransferring] = useState(null)
  const manage = can('PARTS_MANAGE')
  const summaries = summary.data ?? []
  const totals = (companyId ? summaries.filter((s) => s.companyId === companyId) : summaries).reduce(
    (acc, s) => ({ parts: acc.parts + s.parts, lowStock: acc.lowStock + s.lowStock, stockValue: acc.stockValue + s.stockValue }),
    { parts: 0, lowStock: 0, stockValue: 0 },
  )

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Stock & spare parts"
        description={
          company
            ? `${company.legalName}'s stock. Parts are issued when a job starts and returned if it is cancelled; transfers between companies are approved and recorded on both sides.`
            : 'Each company keeps its own stock. Choose a company to add parts or receive stock; transfers between companies are approved and recorded on both sides.'
        }
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
      >
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5 }}>
          <Tabs tabs={TABS} param="tab" />
          <Box sx={{ ml: { sm: 'auto' } }}>
            {scopedCompanyId ? (
              <Badge tone="info" size="sm" dot>
                {company?.name ?? user.companyName}
              </Badge>
            ) : (
              <SegmentedControl
                label="Company"
                value={state.companyId ?? ''}
                onChange={(v) => update({ companyId: v })}
                options={[{ value: '', label: 'All companies' }, ...companies.map((c) => ({ value: String(c.value), label: c.label }))]}
              />
            )}
          </Box>
        </Box>
      </PageHeader>
      <StatGrid cols={4}>
        <Stat
          label="Parts"
          value={totals.parts}
          icon={Inventory2Icon}
          loading={summary.isLoading}
          hint={company ? company.name : `${summaries.length} companies`}
        />
        <Stat
          label="Below minimum"
          value={totals.lowStock}
          icon={WarningAmberIcon}
          loading={summary.isLoading}
          tone={totals.lowStock ? 'danger' : undefined}
          to={`/parts?lowStock=true${companyId ? `&companyId=${companyId}` : ''}`}
        />
        <Stat
          label="Stock value"
          value={formatCurrency(totals.stockValue, { compact: true })}
          icon={PaymentsIcon}
          loading={summary.isLoading}
        />
        <Stat
          label="Companies"
          value={summaries.length}
          icon={SwapHorizIcon}
          loading={summary.isLoading}
          hint={summaries.map((s) => `${s.companyCode} ${formatNumber(s.parts)}`).join(' · ')}
        />
      </StatGrid>
      {tab === 'stock' ? (
        <StockTab
          state={state}
          update={update}
          reset={reset}
          companyId={companyId}
          showCompany={!companyId}
          manage={manage}
          onEdit={(p) => {
            setEditing(p)
            setOpen(true)
          }}
          onMove={setMoving}
          onTransfer={setTransferring}
        />
      ) : (
        <MovementsTab state={state} update={update} reset={reset} companyId={companyId} showCompany={!companyId} />
      )}
      <PartDialog
        open={open}
        onClose={() => setOpen(false)}
        part={editing}
        companies={companies.filter((c) => c.meta.active || c.value === editing?.companyId)}
        defaultCompanyId={companyId ?? companies[0]?.value ?? ''}
        companyLocked={Boolean(scopedCompanyId)}
      />
      <MovementDialog part={moving} onClose={() => setMoving(null)} />
      <TransferDialog part={transferring} companies={companies.filter((c) => c.meta.active)} onClose={() => setTransferring(null)} />
    </Stack>
  )
}

function StockTab({ state, update, reset, companyId, showCompany, manage, onEdit, onMove, onTransfer }) {
  const categories = useQuery({
    queryKey: ['parts', 'categories', companyId],
    queryFn: () => http.get('/spare-parts/categories', { params: { companyId: companyId ?? undefined } }),
  })
  const params = useMemo(
    () => ({
      q: state.q,
      companyId: companyId ?? undefined,
      category: state.category,
      lowStock: state.lowStock,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state, companyId],
  )
  const query = usePagedQuery(['parts', 'list'], '/spare-parts', params)
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
          <Box component="span" sx={{ display: 'block', fontFamily: mono, fontSize: 11.5, color: 'text.muted' }}>
            {p.partNumber}
          </Box>
        </span>
      ),
    },
    showCompany && { key: 'companyName', header: 'Company', sortKey: 'companyName', hideBelow: 'sm' },
    { key: 'category', header: 'Category', sortKey: 'category', hideBelow: 'md' },
    { key: 'location', header: 'Location', hideBelow: 'xl' },
    { key: 'supplier', header: 'Supplier', hideBelow: 'xl' },
    {
      key: 'unitCost',
      header: 'Unit cost',
      sortKey: 'unitCost',
      align: 'right',
      render: (p) => formatCurrency(p.unitCost),
      hideBelow: 'lg',
    },
    {
      key: 'currentStock',
      header: 'In stock',
      sortKey: 'currentStock',
      align: 'right',
      render: (p) => (
        <Box component="span" sx={p.lowStock ? { fontWeight: 500, color: 'soft.danger.fg' } : undefined}>
          {formatNumber(p.currentStock)} {p.unit}
        </Box>
      ),
    },
    { key: 'minimumStock', header: 'Min', align: 'right', hideBelow: 'sm' },
    { key: 'stockValue', header: 'Value', align: 'right', render: (p) => formatCurrency(p.stockValue), hideBelow: 'xl' },
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
          <IconButton label="Receive, issue or adjust" icon={SwapVertIcon} size="xs" onClick={() => onMove(p)} />
          <IconButton label="Transfer to another company" icon={SwapHorizIcon} size="xs" onClick={() => onTransfer(p)} />
          <IconButton label="Edit" icon={EditIcon} size="xs" onClick={() => onEdit(p)} />
        </Box>
      ),
    },
  ]
  return (
    <ListPage
      state={state}
      update={update}
      reset={reset}
      query={query}
      columns={columns}
      searchPlaceholder="Part number, name, supplier, location…"
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
  )
}

function MovementsTab({ state, update, reset, companyId, showCompany }) {
  const types = useOptions('stockMovement')
  const params = useMemo(
    () => ({
      q: state.q,
      companyId: companyId ?? undefined,
      type: state.type,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state, companyId],
  )
  const query = usePagedQuery(['parts', 'movements'], '/stock-movements', params)
  const columns = [
    { key: 'at', header: 'When', sortKey: 'at', render: (m) => formatDateTime(m.at) },
    {
      key: 'partName',
      header: 'Part',
      render: (m) => (
        <span>
          <Box component="span" sx={{ display: 'block', fontWeight: 500, color: 'text.primary' }}>
            {m.partName}
          </Box>
          <Box component="span" sx={{ display: 'block', fontFamily: mono, fontSize: 11.5, color: 'text.muted' }}>
            {m.partNumber}
          </Box>
        </span>
      ),
    },
    showCompany && { key: 'companyName', header: 'Company', hideBelow: 'sm' },
    { key: 'type', header: 'Type', render: (m) => <StatusBadge kind="stockMovement" value={m.type} size="sm" /> },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      render: (m) => (
        <Box component="span" className="tabular" sx={{ fontWeight: 500, color: m.quantity < 0 ? 'soft.danger.fg' : 'soft.success.fg' }}>
          {m.quantity > 0 ? '+' : ''}
          {formatNumber(m.quantity)} {m.unit}
        </Box>
      ),
    },
    { key: 'unitCost', header: 'Unit cost', align: 'right', render: (m) => formatCurrency(m.unitCost), hideBelow: 'lg' },
    { key: 'reference', header: 'Reference', render: (m) => m.reference ?? '—', hideBelow: 'md', sx: { fontFamily: mono, fontSize: 12 } },
    {
      key: 'note',
      header: 'Note',
      render: (m) => (
        <Box component="span" sx={{ display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {m.counterpartCompanyName ? `${m.type === 'TRANSFER_OUT' ? 'To' : 'From'} ${m.counterpartCompanyName} · ` : ''}
          {m.note ?? ''}
        </Box>
      ),
      hideBelow: 'lg',
    },
    { key: 'userName', header: 'By', hideBelow: 'xl' },
  ]
  return (
    <ListPage
      state={state}
      update={update}
      reset={reset}
      query={query}
      columns={columns}
      searchPlaceholder="Part, reference, note, user…"
      defaultSort="at,desc"
      filters={
        <>
          <Select
            value={state.type ?? ''}
            onChange={(e) => update({ type: e.target.value })}
            compact
            placeholder="Any type"
            aria-label="Type"
          >
            {types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
        </>
      }
      empty={<EmptyState icon={HistoryIcon} title="No movements match" compact />}
    />
  )
}

function PartDialog({ open, onClose, part, companies, defaultCompanyId, companyLocked }) {
  const isEdit = Boolean(part)
  const [error, setError] = useState(null)
  const units = useSuggestions('stockUnit')
  const locations = useSuggestions('stockLocation')
  const {
    register,
    handleSubmit,
    reset,
    setError: setFieldError,
    formState: { errors },
  } = useForm({
    values: part
      ? {
          companyId: String(part.companyId),
          partNumber: part.partNumber,
          name: part.name,
          category: part.category,
          unit: part.unit ?? 'pcs',
          location: part.location ?? '',
          supplier: part.supplier,
          unitCost: part.unitCost,
          minimumStock: part.minimumStock,
          currentStock: part.currentStock,
          reference: '',
        }
      : {
          companyId: String(defaultCompanyId ?? ''),
          partNumber: '',
          name: '',
          category: '',
          unit: 'pcs',
          location: '',
          supplier: '',
          unitCost: '',
          minimumStock: 1,
          currentStock: 0,
          reference: '',
        },
  })
  const save = useApiMutation({
    mutationFn: (v) => (isEdit ? http.put(`/spare-parts/${part.id}`, v) : http.post('/spare-parts', v)),
    invalidate: [['parts']],
    success: isEdit ? 'Part updated' : 'Part added',
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
  const fe = (k) => errors[k]?.message
  return (
    <Dialog
      open
      onClose={onClose}
      title={isEdit ? `Edit ${part.partNumber}` : 'Add part'}
      description={
        isEdit
          ? `${part.companyName}'s stock. Quantities change through movements, not here.`
          : 'Choose the company the stock belongs to first.'
      }
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
        sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}
      >
        {error ? (
          <Box sx={{ gridColumn: { sm: 'span 2' } }}>
            <InlineAlert tone="danger">{error.message}</InlineAlert>
          </Box>
        ) : null}
        <Field
          label="Company"
          required
          error={fe('companyId')}
          span
          hint={companyLocked ? 'Your account is limited to this company.' : undefined}
        >
          <Select {...register('companyId', { required: 'Required' })} disabled={isEdit || companyLocked} invalid={!!errors.companyId}>
            {companies.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Part number" required error={fe('partNumber')} hint="Unique within the company.">
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
        <Field label="Unit" error={fe('unit')}>
          <SuggestInput suggestions={units} {...register('unit')} />
        </Field>
        <Field label="Location" error={fe('location')}>
          <SuggestInput suggestions={locations} {...register('location')} placeholder="Store or shelf" />
        </Field>
        <Field label="Unit cost" required error={fe('unitCost')}>
          <Input type="number" inputMode="numeric" {...register('unitCost', { required: 'Required' })} trailing="RWF" />
        </Field>
        <Field label="Minimum stock" required error={fe('minimumStock')}>
          <Input type="number" inputMode="numeric" {...register('minimumStock', { required: 'Required' })} />
        </Field>
        {!isEdit ? (
          <>
            <Field label="Opening stock" required error={fe('currentStock')} hint="Recorded as the first receipt.">
              <Input type="number" inputMode="numeric" {...register('currentStock', { required: 'Required' })} />
            </Field>
            <Field label="Receipt reference" error={fe('reference')} hint="Delivery note or invoice, if any.">
              <Input {...register('reference')} mono />
            </Field>
          </>
        ) : (
          <Field label="Current stock" hint="Use the movement action to receive, issue or adjust.">
            <Input value={`${part.currentStock} ${part.unit ?? 'pcs'}`} disabled />
          </Field>
        )}
      </Box>
    </Dialog>
  )
}

const MOVEMENT_OPTIONS = [
  { value: 'RECEIPT', label: 'Receipt' },
  { value: 'ISSUE', label: 'Issue' },
  { value: 'RETURN', label: 'Return' },
  { value: 'ADJUSTMENT', label: 'Adjustment' },
]

function MovementDialog({ part, onClose }) {
  if (!part) return null
  return <MovementForm part={part} onClose={onClose} />
}

function MovementForm({ part, onClose }) {
  const [values, setValues] = useState({ type: 'RECEIPT', quantity: '', unitCost: '', reference: '', note: '' })
  const [error, setError] = useState(null)
  const move = useApiMutation({
    mutationFn: () =>
      http.post(`/spare-parts/${part.id}/movements`, {
        ...values,
        quantity: Number(values.quantity),
        unitCost: values.unitCost === '' ? undefined : Number(values.unitCost),
      }),
    invalidate: [['parts']],
    success: (r) => `${r.part.name}: now ${r.part.currentStock} ${r.part.unit ?? 'pcs'}`,
    onSuccess: onClose,
  })
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const submit = async () => {
    setError(null)
    try {
      await move.mutateAsync()
    } catch (e) {
      setError(e)
    }
  }
  const fe = (k) => error?.fieldErrorMap?.[k]
  const adjust = values.type === 'ADJUSTMENT'
  const qty = Number(values.quantity) || 0
  const after = adjust ? part.currentStock + qty : values.type === 'ISSUE' ? part.currentStock - qty : part.currentStock + qty
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Stock movement · ${part.name}`}
      description={`${part.companyName} · currently ${part.currentStock} ${part.unit ?? 'pcs'} in stock.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={move.isPending} disabled={!values.quantity || Number(values.quantity) === 0}>
            Record
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error && !error.fieldErrors?.length ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        <SegmentedControl
          label="Movement type"
          value={values.type}
          onChange={(v) => setValues((x) => ({ ...x, type: v }))}
          options={MOVEMENT_OPTIONS}
        />
        <Field
          label={adjust ? 'Change' : 'Quantity'}
          required
          error={fe('quantity')}
          hint={adjust ? 'Negative to remove, e.g. -2 after a stock count.' : undefined}
        >
          <Input
            type="number"
            inputMode="numeric"
            value={values.quantity}
            onChange={set('quantity')}
            placeholder={adjust ? '+10 or -2' : '0'}
            trailing={part.unit ?? 'pcs'}
            autoFocus
          />
        </Field>
        {values.type === 'RECEIPT' ? (
          <Field label="Unit cost" error={fe('unitCost')} hint="Updates the part's unit cost when given.">
            <Input
              type="number"
              inputMode="numeric"
              value={values.unitCost}
              onChange={set('unitCost')}
              placeholder={String(part.unitCost)}
              trailing="RWF"
            />
          </Field>
        ) : null}
        <Field label="Reference" required={values.type === 'RECEIPT'} error={fe('reference')}>
          <Input
            value={values.reference}
            onChange={set('reference')}
            placeholder={values.type === 'RECEIPT' ? 'Delivery note or invoice' : 'Work order, requisition…'}
            mono
          />
        </Field>
        <Field label="Note" required={adjust} error={fe('note')}>
          <Textarea rows={2} value={values.note} onChange={set('note')} placeholder={adjust ? 'Reason for the adjustment' : 'Optional'} />
        </Field>
        {values.quantity ? (
          <Typography sx={{ fontSize: 12.5, color: after < 0 ? 'soft.danger.fg' : 'text.muted' }}>
            Stock after: <strong>{after}</strong> {part.unit ?? 'pcs'}
          </Typography>
        ) : null}
      </Stack>
    </Dialog>
  )
}

function TransferDialog({ part, companies, onClose }) {
  if (!part) return null
  return <TransferForm part={part} companies={companies} onClose={onClose} />
}

function TransferForm({ part, companies, onClose }) {
  const targets = companies.filter((c) => c.value !== part.companyId)
  const [values, setValues] = useState({ toCompanyId: String(targets[0]?.value ?? ''), quantity: '', reference: '', note: '' })
  const [error, setError] = useState(null)
  const transfer = useApiMutation({
    mutationFn: () => http.post(`/spare-parts/${part.id}/transfer`, { ...values, quantity: Number(values.quantity) }),
    invalidate: [['parts']],
    success: (r) => `${values.quantity} ${part.unit ?? 'pcs'} of ${part.name} transferred to ${r.destination.companyName}`,
    onSuccess: onClose,
  })
  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const submit = async () => {
    setError(null)
    try {
      await transfer.mutateAsync()
    } catch (e) {
      setError(e)
    }
  }
  const fe = (k) => error?.fieldErrorMap?.[k]
  return (
    <Dialog
      open
      onClose={onClose}
      title={`Transfer · ${part.name}`}
      description={`From ${part.companyName} (${part.currentStock} ${part.unit ?? 'pcs'} in stock). Recorded as a transfer out and a transfer in, with your approval note.`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={transfer.isPending}
            disabled={!values.toCompanyId || !values.quantity || !values.note.trim()}
          >
            Approve transfer
          </Button>
        </>
      }
    >
      <Stack spacing={1.5}>
        {error && !error.fieldErrors?.length ? <InlineAlert tone="danger">{error.message}</InlineAlert> : null}
        {!targets.length ? <InlineAlert tone="warning">No other active company to transfer to.</InlineAlert> : null}
        <Field label="Receiving company" required error={fe('toCompanyId')}>
          <Select value={values.toCompanyId} onChange={set('toCompanyId')}>
            {targets.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Quantity" required error={fe('quantity')}>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={part.currentStock}
            value={values.quantity}
            onChange={set('quantity')}
            trailing={part.unit ?? 'pcs'}
            autoFocus
          />
        </Field>
        <Field label="Reference" error={fe('reference')} hint="Transfer voucher number, if any.">
          <Input value={values.reference} onChange={set('reference')} mono />
        </Field>
        <Field label="Approval note" required error={fe('note')} hint="Who approved the transfer and why.">
          <Textarea rows={2} value={values.note} onChange={set('note')} />
        </Field>
      </Stack>
    </Dialog>
  )
}
