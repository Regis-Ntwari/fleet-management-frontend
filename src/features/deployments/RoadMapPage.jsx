import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import PrintIcon from '@mui/icons-material/Print'
import { http } from '@/api/client'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { Button } from '@/components/ui/Button'
import { ErrorState, PageSpinner } from '@/components/ui/Feedback'
import { formatDate, formatDateTime } from '@/utils/format'

/** A4 portrait minus margins, same convention as the report document. */
const WIDTH = 690

/**
 * The printable road map (feuille de route) handed to the driver: the issuing company's
 * letterhead, the deployment details and the daily journey table with fuel, odometer, time
 * and signature columns. Every copy generated is recorded on the deployment.
 */
export default function RoadMapPage() {
  const { id } = useParams()
  const [search, setSearch] = useSearchParams()
  const q = useQuery({ queryKey: ['deployments', 'road-map', id], queryFn: () => http.get(`/deployments/${id}/road-map`) })
  useDocumentTitle(q.data ? `Road map ${q.data.deployment.deploymentNumber}` : 'Road map')

  const printed = useRef(false)
  useEffect(() => {
    if (!q.data || printed.current || search.get('autoprint') !== '1') return
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
    }, 300)
    return () => clearTimeout(t)
  }, [q.data, search, setSearch])

  const d = q.data

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
        <Button variant="ghost" size="sm" icon={ArrowBackIcon} to={`/deployments/${id}`}>
          Back to deployment
        </Button>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography component="h1" noWrap sx={{ fontSize: 13.5, fontWeight: 600, m: 0 }}>
            {d ? `Road map · ${d.deployment.deploymentNumber}` : 'Road map'}
          </Typography>
          <Typography noWrap sx={{ fontSize: 12, color: 'text.muted' }}>
            {d?.history[0]
              ? `Copy ${d.history[0].revision} generated ${formatDateTime(d.history[0].generatedAt)} by ${d.history[0].generatedByName}`
              : 'A4 portrait. Choose “Save as PDF” in the print dialog to keep a copy.'}
          </Typography>
        </Box>
        <Button variant="primary" size="sm" icon={PrintIcon} onClick={() => window.print()} disabled={!d}>
          Print
        </Button>
      </Box>
      <Box sx={{ display: 'flex', justifyContent: 'center', px: 2, py: 4 }}>
        {q.isError ? (
          <ErrorState error={q.error} onRetry={q.refetch} />
        ) : !d ? (
          <Stack sx={{ alignItems: 'center', pt: 8 }}>
            <PageSpinner />
          </Stack>
        ) : (
          <Box
            className="report-sheet"
            sx={{
              width: WIDTH + 96,
              maxWidth: '100%',
              p: '48px',
              bgcolor: '#fff',
              borderRadius: '4px',
              boxShadow: (t) => t.vars.palette.shadow.lg,
              overflowX: 'auto',
            }}
          >
            <RoadMapDocument data={d} />
          </Box>
        )}
      </Box>
    </Box>
  )
}

const cell = { border: '1px solid #222', px: 0.5, py: 0.4, fontSize: 9.5, lineHeight: 1.2, verticalAlign: 'top' }
const head = { ...cell, fontWeight: 600, textAlign: 'center', bgcolor: '#f3f3f3' }
const sub = { display: 'block', fontSize: 8, fontWeight: 400, fontStyle: 'italic', color: '#444' }

function Line({ label, sublabel, value, flex = 1 }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.75, flex, minWidth: 0 }}>
      <Box component="span" sx={{ fontSize: 9.5, fontWeight: 700, whiteSpace: 'nowrap' }}>
        {label}:
      </Box>
      <Box
        component="span"
        sx={{ flex: 1, minWidth: 0, borderBottom: '1px solid #222', fontSize: 11, fontWeight: 600, px: 0.5, minHeight: 15 }}
      >
        {value ?? ''}
      </Box>
      {sublabel ? (
        <Box component="span" sx={{ fontSize: 8, fontStyle: 'italic', color: '#444', whiteSpace: 'nowrap' }}>
          {sublabel}
        </Box>
      ) : null}
    </Box>
  )
}

export function RoadMapDocument({ data }) {
  const { deployment: t, company: c, vehicle, driver, purchaseOrder, rows } = data
  const ownerLabel =
    t.owner === 'SUBCONTRACTOR'
      ? `Subcontractor (${t.ownerName ?? ''})`
      : `${c.code === t.owner ? c.code : t.owner}(${c.legalName.split(' ')[0]})`
  return (
    <Box
      className="report-document light"
      sx={{
        width: WIDTH,
        color: '#111',
        bgcolor: '#fff',
        fontSize: 11,
        lineHeight: 1.35,
        fontFamily: 'inherit',
        '& *': { boxSizing: 'border-box' },
      }}
    >
      {/* Letterhead */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '88px 1fr auto', gap: 2, alignItems: 'center' }}>
        <Box
          sx={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '2px solid #222',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            fontWeight: 800,
            fontSize: 22,
            letterSpacing: '0.02em',
          }}
        >
          {c.logoDataUrl ? (
            <Box
              component="img"
              src={c.logoDataUrl}
              alt={`${c.legalName} logo`}
              sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            c.numberPrefix
          )}
        </Box>
        <Box>
          <Typography sx={{ fontSize: 17, fontWeight: 800, letterSpacing: '-0.01em' }}>{c.legalName}</Typography>
          <Typography sx={{ fontSize: 9.5, fontWeight: 600 }}>{c.legalName}</Typography>
          {c.tin ? <Typography sx={{ fontSize: 9.5 }}>TIN/VAT: {c.tin}</Typography> : null}
          {c.address ? <Typography sx={{ fontSize: 9.5 }}>{c.address}</Typography> : null}
          {c.phone ? <Typography sx={{ fontSize: 9.5 }}>Tel: {c.phone}</Typography> : null}
          {c.email ? <Typography sx={{ fontSize: 9.5 }}>E-Mail: {c.email}</Typography> : null}
        </Box>
        <Box sx={{ textAlign: 'right' }}>
          <Typography sx={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap' }}>No {t.deploymentNumber}</Typography>
          <Typography sx={{ fontSize: 13, fontWeight: 700 }}>Days: {t.effectiveDays}</Typography>
          <Typography sx={{ fontSize: 9.5, color: '#444' }}>From {formatDate(t.scheduledStartAt)}</Typography>
        </Box>
      </Box>
      <Typography
        sx={{
          mt: 1.5,
          fontSize: 11.5,
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          borderBottom: '2px solid #222',
          pb: 0.5,
        }}
      >
        {c.roadMapTitle}
      </Typography>

      {/* Deployment details */}
      <Stack spacing={0.9} sx={{ mt: 1.25 }}>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Line label="CAR" sublabel="Imodoka" value={vehicle?.plateNumber ?? t.vehiclePlate} />
          <Line label="CATEGORY" sublabel="Urwego" value={t.tariffCode ?? ''} />
          <Line label="OWNER" sublabel="Nyir'imodoka" value={ownerLabel} flex={1.4} />
          <Line label="TEL" value={driver?.phone ?? ''} flex={0.9} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Line label="STAFF ON DUTY" sublabel="Uhagarariye ubutumwa" value={driver?.fullName ?? t.driverName} flex={1.6} />
          <Line label="TEL" value={driver?.phone ?? ''} flex={0.7} />
          <Line label="DESTINATION" sublabel="Aho bagiye" value={t.destination} flex={1.4} />
        </Box>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Line label="INSTITUTION" sublabel="Ikigo" value={t.institution ?? ''} flex={1.6} />
          <Line label="P.O No" value={purchaseOrder?.lpoNumber ?? ''} flex={1} />
          <Line label="P.O date" value={purchaseOrder ? formatDate(purchaseOrder.receivedOn) : ''} flex={0.8} />
        </Box>
      </Stack>

      {/* Daily journey table */}
      <Box component="table" sx={{ mt: 1.5, width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: 22 }} />
          <col style={{ width: 60 }} />
          <col style={{ width: 56 }} />
          <col style={{ width: 66 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 52 }} />
          <col style={{ width: 58 }} />
          <col style={{ width: 52 }} />
          <col />
        </colgroup>
        <thead>
          <tr>
            <Box component="th" rowSpan={3} sx={head}>
              N°
            </Box>
            <Box component="th" rowSpan={3} sx={head}>
              Date
              <Box component="span" sx={sub}>
                Itariki
              </Box>
            </Box>
            <Box component="th" colSpan={2} sx={head}>
              Fuel
              <Box component="span" sx={sub}>
                Amavuta
              </Box>
            </Box>
            <Box component="th" sx={head}>
              Start KM
            </Box>
            <Box component="th" sx={head}>
              Start time
            </Box>
            <Box component="th" sx={head}>
              End KM
            </Box>
            <Box component="th" sx={head}>
              End time
            </Box>
            <Box component="th" rowSpan={3} sx={{ ...head, textAlign: 'left' }}>
              Car rental (Institution / Person)
              <Box component="span" sx={{ ...sub, fontStyle: 'normal', fontWeight: 600, mt: 0.5 }}>
                ADMIN ({c.numberPrefix})
              </Box>
              <Box component="span" sx={{ ...sub, fontStyle: 'normal', mt: 0.5 }}>
                P.O No: {purchaseOrder?.lpoNumber ?? '…………………'}
              </Box>
              <Box component="span" sx={{ ...sub, mt: 0.75 }}>
                Signature of the representative
              </Box>
              <Box component="span" sx={sub}>
                Umukono w'uhagarariye ubutumwa (Kuri buri tariki)
              </Box>
            </Box>
          </tr>
          <tr>
            <Box component="th" sx={head}>
              Price
              <Box component="span" sx={sub}>
                Agaciro (FRW)
              </Box>
            </Box>
            <Box component="th" sx={head}>
              Signature
              <Box component="span" sx={sub}>
                Umukono w'uyatanze
              </Box>
            </Box>
            <Box component="th" sx={head}>
              KM
              <Box component="span" sx={sub}>
                dutangiriyeho
              </Box>
            </Box>
            <Box component="th" sx={head}>
              Isaha
              <Box component="span" sx={sub}>
                dutangiriyeho
              </Box>
            </Box>
            <Box component="th" sx={head}>
              KM
              <Box component="span" sx={sub}>
                dusorejeho
              </Box>
            </Box>
            <Box component="th" sx={head}>
              Isaha
              <Box component="span" sx={sub}>
                dusorejeho
              </Box>
            </Box>
          </tr>
          <tr>
            <Box component="th" sx={head} colSpan={2} />
            <Box component="th" sx={head}>
              KM
            </Box>
            <Box component="th" sx={head}>
              H
            </Box>
            <Box component="th" sx={head}>
              KM
            </Box>
            <Box component="th" sx={head}>
              H
            </Box>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.n}>
              <Box component="td" sx={{ ...cell, textAlign: 'center', fontWeight: 600, height: 24 }}>
                {r.n}
              </Box>
              <Box component="td" sx={cell}>
                {r.date ? formatDate(r.date) : ''}
              </Box>
              <Box component="td" sx={cell} />
              <Box component="td" sx={cell} />
              <Box component="td" sx={cell}>
                {r.n === 1 && t.startOdometer != null ? t.startOdometer.toLocaleString() : ''}
              </Box>
              <Box component="td" sx={cell} />
              <Box component="td" sx={cell} />
              <Box component="td" sx={cell} />
              <Box component="td" sx={cell} />
            </tr>
          ))}
        </tbody>
      </Box>

      {/* Signatures */}
      <Box sx={{ mt: 2, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }} className="avoid-break">
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700 }}>Driver's signature and Tel:</Typography>
          <Typography sx={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', mt: 0.25 }}>
            {driver?.fullName ?? t.driverName}
          </Typography>
          <Box sx={{ mt: 3, borderBottom: '1px solid #222', width: 220 }} />
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, fontWeight: 700 }}>
            Date ……/……/………… Hour …………… (Day/Night)
            <Box component="span" sx={{ ...sub }}>
              Tariki · Isaha · (Amanywa/Ijoro)
            </Box>
          </Typography>
          <Typography sx={{ fontSize: 10, fontWeight: 700, mt: 1.5 }}>
            Signature of the representative
            <Box component="span" sx={sub}>
              Umukono w'uhagarariye ubutumwa
            </Box>
          </Typography>
          <Box sx={{ mt: 2, borderBottom: '1px solid #222', width: 220 }} />
        </Box>
      </Box>
      <Typography sx={{ mt: 2, fontSize: 8.5, color: '#555' }}>
        {c.legalName} · {t.deploymentNumber} · generated {formatDateTime(data.history[0]?.generatedAt ?? new Date().toISOString())}
        {data.history[0] ? ` (copy ${data.history[0].revision})` : ''}
      </Typography>
    </Box>
  )
}
