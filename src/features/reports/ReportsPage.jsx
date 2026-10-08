import { Link as RouterLink } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import BarChartIcon from '@mui/icons-material/BarChart'
import { http } from '@/api/client'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { ErrorState, Skeleton } from '@/components/ui/Feedback'

export default function ReportsPage() {
  const reports = useQuery({ queryKey: ['reports', 'definitions'], queryFn: () => http.get('/reports'), staleTime: 600_000 })
  const groups = ['Operations', 'Maintenance', 'Fuel & cost', 'Compliance']
  return (
    <Box>
      <PageHeader
        title="Reports"
        description="Generated on the server from live operational data. Each report opens with key figures and charts above the detail table, and exports to CSV, Excel or a designed PDF."
      />
      {reports.isError ? <ErrorState error={reports.error} onRetry={reports.refetch} /> : null}
      <Stack spacing={4}>
        {groups.map((g) => {
          const items = (reports.data ?? []).filter((r) => r.group === g)
          if (!reports.isLoading && !items.length) return null
          return (
            <Box component="section" key={g}>
              <Typography
                component="h2"
                sx={{ mb: 1.5, fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'text.muted' }}
              >
                {g}
              </Typography>
              <Box
                sx={{
                  display: 'grid',
                  gap: 1.5,
                  gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' },
                }}
              >
                {reports.isLoading
                  ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} height={112} />)
                  : items.map((r) => (
                      <Card
                        key={r.key}
                        as={RouterLink}
                        to={`/reports/${r.key}`}
                        sx={{
                          display: 'flex',
                          flexDirection: 'column',
                          p: 2,
                          color: 'inherit',
                          textDecoration: 'none',
                          transition: 'border-color 150ms',
                          '&:hover': { borderColor: 'edge.strong' },
                          '&:hover [data-arrow]': { transform: 'translateX(2px)', color: 'text.primary' },
                        }}
                      >
                        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5 }}>
                          <Box
                            component="span"
                            sx={{
                              display: 'flex',
                              width: 32,
                              height: 32,
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: 1,
                              bgcolor: 'soft.accent.bg',
                              color: 'soft.accent.fg',
                            }}
                          >
                            <BarChartIcon sx={{ fontSize: 16 }} aria-hidden />
                          </Box>
                          <ArrowForwardIcon
                            data-arrow
                            sx={{ fontSize: 16, color: 'text.faint', transition: 'transform 150ms, color 150ms' }}
                            aria-hidden
                          />
                        </Box>
                        <Typography component="h3" sx={{ mt: 1.5, fontSize: 14, fontWeight: 600, color: 'text.primary' }}>
                          {r.name}
                        </Typography>
                        <Typography sx={{ mt: 0.5, fontSize: 12.5, color: 'text.muted' }}>{r.description}</Typography>
                        <Typography sx={{ mt: 'auto', pt: 1.5, fontSize: 11.5, color: 'text.faint' }}>
                          {r.supportsDateRange ? 'Date range' : 'Point in time'}
                        </Typography>
                      </Card>
                    ))}
              </Box>
            </Box>
          )
        })}
      </Stack>
    </Box>
  )
}
