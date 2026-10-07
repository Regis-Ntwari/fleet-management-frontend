import { useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import CheckIcon from '@mui/icons-material/Check'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import CampaignIcon from '@mui/icons-material/Campaign'
import { http } from '@/api/client'
import { useSearchState } from '@/hooks/useSearchState'
import { usePagedQuery, useApiMutation } from '@/features/common/hooks'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { FilterBar } from '@/components/ui/Display'
import { SearchInput } from '@/components/ui/SearchInput'
import { Select } from '@/components/ui/Field'
import { SegmentedControl } from '@/components/ui/Tabs'
import { Pagination } from '@/components/ui/DataTable'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { formatRelative, formatDateTime, humanize } from '@/utils/format'
import { alertLink } from '@/features/dashboard/DashboardPage'

const SEVERITY = {
  CRITICAL: { tone: 'danger', bar: 'error.main' },
  WARNING: { tone: 'warning', bar: 'warning.main' },
  INFO: { tone: 'info', bar: 'info.main' },
}

export default function AlertsPage() {
  const [state, update, reset] = useSearchState({ acknowledged: 'false', size: 25 })
  const params = useMemo(
    () => ({
      q: state.q,
      severity: state.severity,
      entityType: state.entityType,
      acknowledged: state.acknowledged,
      page: state.page,
      size: state.size,
    }),
    [state],
  )
  const q = usePagedQuery(['alerts', 'list'], '/alerts', params)
  const queryClient = useQueryClient()
  const ack = useApiMutation({
    mutationFn: (id) => http.post(`/alerts/${id}/acknowledge`),
    invalidate: [['alerts'], ['dashboard', 'alerts']],
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  })
  const data = q.data
  const items = data?.content ?? []

  return (
    <Stack spacing={2.5}>
      <PageHeader
        title="Alert centre"
        description="Everything that needs management attention, computed live from documents, telematics, maintenance schedules, bookings and incidents."
      />
      <Card>
        <FilterBar
          onReset={reset}
          hasFilters={!!(state.q || state.severity || state.entityType)}
          trailing={
            <Box component="span" sx={{ fontSize: 12.5, color: 'text.muted' }}>
              {data ? `${data.totalElements} alerts` : ''}
            </Box>
          }
        >
          <SearchInput
            value={state.q ?? ''}
            onChange={(v) => update({ q: v })}
            placeholder="Search alerts…"
            sx={{ width: { xs: '100%', sm: 240 } }}
          />
          <SegmentedControl
            label="Severity"
            value={state.severity ?? ''}
            onChange={(v) => update({ severity: v })}
            options={[
              { value: '', label: 'All' },
              { value: 'CRITICAL', label: 'Critical' },
              { value: 'WARNING', label: 'Warning' },
              { value: 'INFO', label: 'Info' },
            ]}
          />
          <Select
            value={state.entityType ?? ''}
            onChange={(e) => update({ entityType: e.target.value })}
            compact
            placeholder="Any source"
            aria-label="Source"
          >
            {['VEHICLE', 'DOCUMENT', 'MAINTENANCE', 'INCIDENT', 'BOOKING', 'FUEL'].map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </Select>
          <SegmentedControl
            label="State"
            value={state.acknowledged}
            onChange={(v) => update({ acknowledged: v })}
            options={[
              { value: 'false', label: 'Open' },
              { value: 'true', label: 'Acknowledged' },
              { value: '', label: 'All' },
            ]}
          />
        </FilterBar>

        {q.isLoading ? (
          <Stack spacing={1.5} sx={{ p: 2 }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} height={56} />
            ))}
          </Stack>
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={CampaignIcon}
            title="No alerts"
            description={state.acknowledged === 'false' ? 'Nothing is waiting for attention right now.' : 'No alerts match these filters.'}
          />
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, '& > * + *': { borderTop: 1, borderColor: 'divider' } }}>
            {items.map((a) => {
              const sev = SEVERITY[a.severity]
              return (
                <Box component="li" key={a.id} sx={{ display: 'flex', gap: 1.5, px: 2, py: 1.5 }}>
                  <Box
                    component="span"
                    sx={{ mt: 0.5, width: 4, flexShrink: 0, alignSelf: 'stretch', borderRadius: 999, bgcolor: sev.bar }}
                    aria-hidden
                  />
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
                      <Badge tone={sev.tone} size="sm">
                        {humanize(a.severity)}
                      </Badge>
                      <Box component="span" sx={{ fontSize: 13.5, fontWeight: 500, color: 'text.primary' }}>
                        {a.title}
                      </Box>
                      <Box component="span" sx={{ fontSize: 12, color: 'text.muted' }}>
                        {humanize(a.entityType)} · {a.entityLabel}
                      </Box>
                    </Box>
                    <Typography sx={{ mt: 0.5, fontSize: 13, color: 'text.secondary' }}>{a.message}</Typography>
                    <Typography sx={{ mt: 0.5, fontSize: 12, color: 'text.muted' }}>
                      Raised {formatRelative(a.raisedAt)}
                      {a.acknowledgedAt ? ` · acknowledged by ${a.acknowledgedByName} on ${formatDateTime(a.acknowledgedAt)}` : ''}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      display: 'flex',
                      flexShrink: 0,
                      flexDirection: { xs: 'column', sm: 'row' },
                      alignItems: { xs: 'flex-end', sm: 'flex-start' },
                      gap: 0.75,
                    }}
                  >
                    <Button size="sm" to={alertLink(a)} iconRight={OpenInNewIcon} sx={{ fontSize: 12.5 }}>
                      Open
                    </Button>
                    {!a.acknowledgedAt ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon={CheckIcon}
                        onClick={() => ack.mutate(a.id)}
                        loading={ack.isPending && ack.variables === a.id}
                      >
                        Acknowledge
                      </Button>
                    ) : null}
                  </Box>
                </Box>
              )
            })}
          </Box>
        )}
        {data ? (
          <Pagination
            page={data.page}
            size={data.size}
            totalElements={data.totalElements}
            totalPages={data.totalPages}
            onPageChange={(page) => update({ page })}
            onSizeChange={(size) => update({ size, page: 0 })}
            sizes={[25, 50, 100]}
          />
        ) : null}
      </Card>
    </Stack>
  )
}
