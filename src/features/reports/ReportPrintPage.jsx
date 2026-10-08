import { useEffect, useMemo, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import { http } from '@/api/client'
import { useAuth } from '@/app/AuthProvider'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageSpinner } from '@/components/ui/Feedback'
import { defaultRange } from '@/components/ui/DateRange'
import { ReportDocument, DOCUMENT_WIDTH } from './ReportDocument'

/**
 * Print preview for a report. The browser's "Save as PDF" produces the document
 * exactly as laid out here; in production `GET /reports/{key}/export?format=pdf`
 * returns the same document rendered by the server.
 */
export default function ReportPrintPage() {
  const { key } = useParams()
  const [search, setSearch] = useSearchParams()
  const { user } = useAuth()
  const defs = useQuery({ queryKey: ['reports', 'definitions'], queryFn: () => http.get('/reports'), staleTime: 600_000 })
  const def = defs.data?.find((r) => r.key === key)
  const params = useMemo(() => {
    if (def?.supportsDateRange) {
      const fallback = defaultRange('30d')
      return { from: search.get('from') ?? fallback.from, to: search.get('to') ?? fallback.to }
    }
    return { date: search.get('date') ?? format(new Date(), 'yyyy-MM-dd') }
  }, [def, search])
  const report = useQuery({
    queryKey: ['reports', key, params],
    queryFn: () => http.get(`/reports/${key}`, { params }),
    enabled: Boolean(def),
  })
  useDocumentTitle(def ? `${def.name} · PDF` : 'Report')

  // Export → PDF lands here with ?autoprint=1: open the print dialog once the charts have drawn.
  const printed = useRef(false)
  useEffect(() => {
    if (!report.data || printed.current || search.get('autoprint') !== '1') return
    printed.current = true
    const t = setTimeout(() => {
      window.print()
      setSearch(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('autoprint')
          return next
        },
        { replace: true },
      )
    }, 400)
    return () => clearTimeout(t)
  }, [report.data, search, setSearch])

  if (defs.isLoading) return <PageSpinner />
  if (!def)
    return (
      <Box sx={{ p: 4 }}>
        <EmptyState title="Unknown report" description="This report does not exist." action={<Button to="/reports">All reports</Button>} />
      </Box>
    )

  const backTo = `/reports/${key}${def.supportsDateRange ? `?from=${params.from}&to=${params.to}` : `?date=${params.date}`}`

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.subtle' }} className="report-print-page">
      <Box
        component="header"
        className="report-print-toolbar"
        sx={{
          position: 'sticky',
          top: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 2,
          py: 1.25,
          bgcolor: 'background.paper',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Button variant="ghost" size="sm" icon={ArrowBackIcon} to={backTo}>
          Back to report
        </Button>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 600 }}>
            {def.name}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.muted' }}>
            Print preview · A4 portrait. Choose “Save as PDF” in the print dialog.
          </Typography>
        </Box>
        <Button variant="primary" size="sm" icon={PictureAsPdfIcon} onClick={() => window.print()} disabled={!report.data}>
          Save as PDF
        </Button>
      </Box>

      <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, py: 4 }}>
        {report.isError ? (
          <ErrorState error={report.error} onRetry={report.refetch} />
        ) : report.isLoading || !report.data ? (
          <Stack sx={{ alignItems: 'center', pt: 8 }}>
            <PageSpinner />
          </Stack>
        ) : (
          <Box
            className="report-sheet"
            sx={{
              width: DOCUMENT_WIDTH + 96,
              maxWidth: '100%',
              p: '48px',
              bgcolor: '#fff',
              borderRadius: '4px',
              boxShadow: (t) => t.vars.palette.shadow.lg,
              overflowX: 'auto',
            }}
          >
            <ReportDocument def={def} report={report.data} user={user} />
          </Box>
        )}
      </Box>
    </Box>
  )
}
