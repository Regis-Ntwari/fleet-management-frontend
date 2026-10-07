import { useMemo, useState } from 'react'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery } from '@/features/common/hooks'
import { ListPage } from '@/features/common/ListPage'
import { PageHeader } from '@/components/ui/PageHeader'
import { Select } from '@/components/ui/Field'
import { Badge, Dash } from '@/components/ui/Badge'
import { DateRangePicker } from '@/components/ui/DateRange'
import { EmptyState } from '@/components/ui/Feedback'
import { formatDateTime, humanize } from '@/utils/format'

const ACTION_TONE = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  LOGIN: 'neutral',
  STATUS_CHANGE: 'accent',
  ASSIGN: 'info',
  EXPORT: 'neutral',
}
const ENTITIES = [
  'VEHICLE',
  'DRIVER',
  'TRIP',
  'BOOKING',
  'FUEL_TRANSACTION',
  'MAINTENANCE',
  'INCIDENT',
  'DOCUMENT',
  'USER',
  'SETTINGS',
  'ASSIGNMENT',
  'SPARE_PART',
  'REPORT',
  'IMPORT',
  'SESSION',
]

export default function AuditPage() {
  const [state, update, reset] = useSearchState({ size: 25 })
  const [expanded, setExpanded] = useState(null)
  const params = useMemo(
    () => ({
      q: state.q,
      action: state.action,
      entityType: state.entityType,
      from: state.from,
      to: state.to,
      page: state.page,
      size: state.size,
    }),
    [state],
  )
  const query = usePagedQuery(['audit', 'list'], '/audit-logs', params)
  const columns = [
    {
      key: 'at',
      header: 'When',
      render: (a) => (
        <Box component="span" className="tabular">
          {formatDateTime(a.at)}
        </Box>
      ),
      width: 170,
    },
    {
      key: 'userName',
      header: 'User',
      render: (a) => (
        <Box component="span" sx={{ fontWeight: 500 }}>
          {a.userName}
        </Box>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (a) => (
        <Badge tone={ACTION_TONE[a.action] ?? 'neutral'} size="sm">
          {humanize(a.action)}
        </Badge>
      ),
    },
    {
      key: 'entity',
      header: 'Entity',
      render: (a) => (
        <Box component="span">
          {humanize(a.entityType)}
          {a.entityLabel ? (
            <Box component="span" sx={{ ml: 0.75, color: 'text.muted' }}>
              · {a.entityLabel}
            </Box>
          ) : null}
        </Box>
      ),
    },
    {
      key: 'changes',
      header: 'Changes',
      render: (a) =>
        a.changes?.length ? (
          <ButtonBase
            onClick={() => setExpanded(expanded === a.id ? null : a.id)}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.5,
              fontSize: 12.5,
              fontWeight: 500,
              color: 'soft.accent.fg',
              textAlign: 'left',
            }}
          >
            {expanded === a.id ? (
              <KeyboardArrowDownIcon sx={{ fontSize: 14 }} aria-hidden />
            ) : (
              <ChevronRightIcon sx={{ fontSize: 14 }} aria-hidden />
            )}
            {a.changes.length} field{a.changes.length === 1 ? '' : 's'}
            {expanded === a.id ? (
              <Box
                component="span"
                sx={{ ml: 1, display: 'inline-flex', flexWrap: 'wrap', gap: 0.5, fontWeight: 400, color: 'text.secondary' }}
              >
                {a.changes.map((c) => (
                  <Box
                    key={c.field}
                    component="span"
                    sx={{
                      borderRadius: '4px',
                      bgcolor: 'background.muted',
                      px: 0.75,
                      py: 0.25,
                      fontFamily: (t) => t.typography.fontFamilyMono,
                      fontSize: 11.5,
                    }}
                  >
                    {c.field}: {String(c.from ?? '∅')} → {String(c.to ?? '∅')}
                  </Box>
                ))}
              </Box>
            ) : null}
          </ButtonBase>
        ) : (
          <Dash />
        ),
      hideBelow: 'md',
    },
    {
      key: 'ipAddress',
      header: 'IP',
      sx: { fontFamily: (t) => t.typography.fontFamilyMono, fontSize: 12, color: 'text.muted' },
      hideBelow: 'xl',
    },
  ]
  return (
    <Box>
      <PageHeader
        title="Audit log"
        description="Who changed what, and when. Written by the backend for every create, update, status change, assignment, export and sign-in."
      />
      <ListPage
        state={state}
        update={update}
        reset={reset}
        query={query}
        columns={columns}
        searchPlaceholder="User, entity, label…"
        hideSearch={false}
        compact
        filters={
          <>
            <Select
              value={state.action ?? ''}
              onChange={(e) => update({ action: e.target.value })}
              compact
              placeholder="Any action"
              aria-label="Action"
            >
              {Object.keys(ACTION_TONE).map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </Select>
            <Select
              value={state.entityType ?? ''}
              onChange={(e) => update({ entityType: e.target.value })}
              compact
              placeholder="Any entity"
              aria-label="Entity"
            >
              {ENTITIES.map((e) => (
                <option key={e} value={e}>
                  {humanize(e)}
                </option>
              ))}
            </Select>
            <DateRangePicker value={state.from ? { from: state.from, to: state.to } : null} onChange={(r) => update(r)} />
          </>
        }
        empty={<EmptyState title="No audit entries match" compact />}
      />
    </Box>
  )
}
