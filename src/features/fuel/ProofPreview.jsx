import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import { Button } from '@/components/ui/Button'
import { formatBytes } from '@/utils/format'

/** Shows a submitted receipt: images inline, PDFs as a link. `proof` is { fileName, contentType, sizeBytes, dataUrl }. */
export function ProofPreview({ proof, maxHeight = 360, compact = false }) {
  if (!proof?.dataUrl) return null
  const isImage = proof.contentType?.startsWith('image/') || proof.dataUrl.startsWith('data:image/')
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {isImage ? (
        <Box
          component="a"
          href={proof.dataUrl}
          target="_blank"
          rel="noreferrer"
          aria-label={`Open ${proof.fileName} in a new tab`}
          sx={{
            display: 'block',
            overflow: 'hidden',
            borderRadius: 1.5,
            border: 1,
            borderColor: 'edge.main',
            bgcolor: 'background.subtle',
            lineHeight: 0,
          }}
        >
          <Box
            component="img"
            src={proof.dataUrl}
            alt={`Receipt ${proof.fileName}`}
            sx={{ display: 'block', width: '100%', maxHeight: compact ? 160 : maxHeight, objectFit: 'contain' }}
          />
        </Box>
      ) : (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1.5,
            borderRadius: 1.5,
            border: 1,
            borderColor: 'edge.main',
            bgcolor: 'background.subtle',
            px: 1.5,
            py: 1.25,
          }}
        >
          <PictureAsPdfIcon sx={{ color: 'soft.danger.fg' }} aria-hidden />
          <Box sx={{ minWidth: 0, flex: 1 }}>
            <Typography noWrap sx={{ fontSize: 13.5, fontWeight: 500 }}>
              {proof.fileName}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.muted' }}>PDF · {formatBytes(proof.sizeBytes)}</Typography>
          </Box>
          <Button size="xs" iconRight={OpenInNewIcon} component="a" href={proof.dataUrl} target="_blank" rel="noreferrer">
            Open
          </Button>
        </Box>
      )}
      {!compact ? (
        <Typography sx={{ fontSize: 12, color: 'text.muted' }}>
          {proof.fileName} · {formatBytes(proof.sizeBytes)}
        </Typography>
      ) : null}
    </Box>
  )
}
