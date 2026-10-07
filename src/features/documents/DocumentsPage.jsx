import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import EditIcon from '@mui/icons-material/Edit'
import DescriptionIcon from '@mui/icons-material/Description'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useOptions } from '@/app/ReferenceProvider'
import { useSearchState } from '@/hooks/useSearchState'
import { useApiMutation, usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button, IconButton } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { StatusBadge } from '@/components/ui/Badge'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { Stat, StatGrid } from '@/components/ui/Stat'
import { EmptyState, LinkText } from '@/components/ui/Feedback'
import { formatDate, humanize } from '@/utils/format'
import { DocumentFormDialog } from './DocumentFormDialog'

export default function DocumentsPage() {
  const [state, update, reset] = useSearchState({ size: 20 })
  const { can } = useAuth()
  const types = useOptions('documentType')
  const statuses = useOptions('document')
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const params = useMemo(
    () => ({
      q: state.q,
      status: state.status,
      type: state.type,
      ownerType: state.ownerType,
      page: state.page,
      size: state.size,
      sort: state.sort,
    }),
    [state],
  )
  const query = usePagedQuery(['documents', 'list'], '/documents', params)
  const summary = useQuery({ queryKey: ['documents', 'summary'], queryFn: () => http.get('/documents/summary') })
  const remove = useApiMutation({
    mutationFn: (id) => http.delete(`/documents/${id}`),
    invalidate: [['documents'], ['alerts'], ['dashboard']],
    success: 'Document deleted',
    onSuccess: () => setDeleting(null),
  })
  const s = summary.data

  const columns = [
    {
      key: 'ownerLabel',
      header: 'Owner',
      sortKey: 'ownerLabel',
      render: (d) => (
        <LinkText to={d.ownerType === 'VEHICLE' ? `/vehicles/${d.ownerId}?tab=documents` : `/drivers/${d.ownerId}?tab=documents`}>
          {d.ownerLabel}
        </LinkText>
      ),
    },
    {
      key: 'ownerType',
      header: 'Type',
      render: (d) => (
        <Box component="span" sx={{ color: 'text.muted' }}>
          {humanize(d.ownerType)}
        </Box>
      ),
      hideBelow: 'md',
    },
    {
      key: 'type',
      header: 'Document',
      sortKey: 'type',
      render: (d) => <StatusBadge kind="documentType" value={d.type} size="sm" dot={false} />,
    },
    { key: 'number', header: 'Number', sx: { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 13 }, hideBelow: 'lg' },
    { key: 'expiryDate', header: 'Expires', sortKey: 'expiryDate', render: (d) => formatDate(d.expiryDate) },
    {
      key: 'daysToExpiry',
      header: 'Days',
      align: 'right',
      sortKey: 'daysToExpiry',
      render: (d) =>
        d.daysToExpiry < 0 ? (
          <Box component="span" sx={{ color: 'soft.danger.fg' }}>
            {-d.daysToExpiry} overdue
          </Box>
        ) : (
          d.daysToExpiry
        ),
      hideBelow: 'sm',
    },
    { key: 'status', header: 'Status', sortKey: 'status', render: (d) => <StatusBadge kind="document" value={d.status} size="sm" /> },
    can('DOCUMENT_MANAGE') && {
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
          {!(d.ownerType === 'DRIVER' && d.type === 'DRIVER_LICENCE') ? (
            <IconButton label="Delete" icon={DeleteIcon} size="xs" onClick={() => setDeleting(d)} />
          ) : null}
        </Box>
      ),
    },
  ]

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Documents"
        description="Insurance, inspection, licences and registration for every vehicle and driver. Expired documents block dispatch."
        actions={
          can('DOCUMENT_MANAGE') ? (
            <Button
              variant="primary"
              icon={AddIcon}
              onClick={() => {
                setEditing(null)
                setOpen(true)
              }}
            >
              Add document
            </Button>
          ) : null
        }
      />
      <StatGrid cols={4}>
        <Stat
          label="Expired"
          value={s?.expired}
          tone={s?.expired ? 'danger' : undefined}
          loading={summary.isLoading}
          to="/documents?status=EXPIRED"
        />
        <Stat
          label="Expiring soon"
          value={s?.expiringSoon}
          tone={s?.expiringSoon ? 'warning' : undefined}
          loading={summary.isLoading}
          to="/documents?status=EXPIRING_SOON"
          hint={s ? s.windows.map((w) => `${w.count} within ${w.days} d`).join(' · ') : null}
        />
        <Stat label="Valid" value={s?.valid} tone="success" loading={summary.isLoading} />
        <Stat label="Total tracked" value={s?.total} icon={DescriptionIcon} loading={summary.isLoading} />
      </StatGrid>
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="Plate, driver, number…"
        defaultSort="expiryDate,asc"
        filters={
          <>
            <Select
              value={state.status ?? ''}
              onChange={(e) => update({ status: e.target.value })}
              compact
              placeholder="Any status"
              aria-label="Status"
            >
              {statuses.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.type ?? ''}
              onChange={(e) => update({ type: e.target.value })}
              compact
              placeholder="Any document"
              aria-label="Document type"
            >
              {types.map((x) => (
                <option key={x.value} value={x.value}>
                  {x.label}
                </option>
              ))}
            </Select>
            <Select
              value={state.ownerType ?? ''}
              onChange={(e) => update({ ownerType: e.target.value })}
              compact
              placeholder="Vehicles & drivers"
              aria-label="Owner type"
            >
              <option value="VEHICLE">Vehicles</option>
              <option value="DRIVER">Drivers</option>
            </Select>
          </>
        }
        empty={<EmptyState icon={DescriptionIcon} title="No documents match" compact />}
      />
      <DocumentFormDialog open={open} onClose={() => setOpen(false)} document={editing} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={() => remove.mutate(deleting.id)}
        loading={remove.isPending}
        title="Delete document?"
        description={
          deleting
            ? `${humanize(deleting.type)} ${deleting.number} for ${deleting.ownerLabel} will be removed. This is recorded in the audit log.`
            : ''
        }
        confirmLabel="Delete"
      />
    </Stack>
  )
}
