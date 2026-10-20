import { useRef, useState } from 'react'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { visuallyHidden } from '@mui/utils'
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera'
import AttachFileIcon from '@mui/icons-material/AttachFile'
import DeleteOutlinedIcon from '@mui/icons-material/DeleteOutlined'
import { http } from '@/api/client'
import { useApiMutation } from '@/features/common/hooks'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Field, Input, SuggestInput, Textarea } from '@/components/ui/Field'
import { InlineAlert } from '@/components/ui/Feedback'
import { STATIONS } from '@/api/mock/data'
import { formatCurrency, formatKm, formatLitres, toInputDateTime } from '@/utils/format'
import { PROOF_ACCEPT, readProofFile } from '@/utils/files'
import { ProofPreview } from './ProofPreview'

const DEFAULT_PRICE = { PETROL: 1790, DIESEL: 1720, HYBRID: 1790 }

const initialValues = (a) => {
  const s = a?.submission
  return {
    station: s?.station ?? a?.station ?? '',
    transactedAt: s?.transactedAt ? toInputDateTime(s.transactedAt) : toInputDateTime(new Date()),
    litres: s?.litres ?? '',
    pricePerLitre: s?.pricePerLitre ?? DEFAULT_PRICE[a?.vehicleFuelType] ?? 1720,
    odometerKm: s?.odometerKm ?? a?.vehicleOdometerKm ?? '',
    receiptNumber: s?.receiptNumber ?? '',
    notes: s?.notes ?? '',
  }
}

/**
 * The driver's side of a fuel allocation: after filling up, they enter what is on the receipt,
 * attach a photo of it and submit. A returned allocation reopens with the previous entry so only
 * the problem needs fixing.
 */
export function FuelSubmitDialog({ allocation, open, onClose, onDone }) {
  // Mounted only while open so every opening starts from the allocation's current state.
  return open && allocation ? <FuelSubmitForm allocation={allocation} onClose={onClose} onDone={onDone} /> : null
}

function FuelSubmitForm({ allocation, onClose, onDone }) {
  const [values, setValues] = useState(() => initialValues(allocation))
  const [proof, setProof] = useState(allocation?.submission?.proof ?? null)
  const [proofError, setProofError] = useState(null)
  const [reading, setReading] = useState(false)
  const [error, setError] = useState(null)
  const fileInput = useRef(null)

  const submit = useApiMutation({
    mutationFn: (body) => http.patch(`/fuel/allocations/${allocation.id}/submit`, body),
    invalidate: [['fuel'], ['me'], ['notifications'], ['vehicles']],
    success: (r) => `Receipt for ${r.requestNumber} sent for verification`,
    onSuccess: (r) => {
      onDone?.(r)
      onClose()
    },
  })

  const set = (k) => (e) => setValues((v) => ({ ...v, [k]: e.target.value }))
  const litres = Number(values.litres)
  const price = Number(values.pricePerLitre)
  const total = litres > 0 && price > 0 ? Math.round(litres * price) : null
  const ceiling = Math.round(allocation.litresAllocated * 1.1 * 10) / 10
  const overAllocation = litres > ceiling

  const pickFile = async (file) => {
    if (!file) return
    setProofError(null)
    setReading(true)
    try {
      setProof(await readProofFile(file))
    } catch (e) {
      setProof(null)
      setProofError(e.message)
    } finally {
      setReading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  const onSubmit = async () => {
    setError(null)
    if (!proof) {
      setProofError('Attach a photo or PDF of the receipt.')
      return
    }
    try {
      await submit.mutateAsync({
        ...values,
        transactedAt: new Date(values.transactedAt).toISOString(),
        proof,
      })
    } catch (e) {
      setError(e)
      if (e.fieldErrorMap?.proof) setProofError(e.fieldErrorMap.proof)
    }
  }
  const fieldError = (k) => error?.fieldErrorMap?.[k]

  return (
    <Dialog
      open
      onClose={onClose}
      title={allocation.status === 'RETURNED' ? 'Fix and resubmit receipt' : 'Submit fuel receipt'}
      description={`${allocation.requestNumber} · ${formatLitres(allocation.litresAllocated)} allocated for ${allocation.vehiclePlate}${
        allocation.station ? ` at ${allocation.station}` : ''
      }.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSubmit} loading={submit.isPending} disabled={reading}>
            {allocation.status === 'RETURNED' ? 'Resubmit receipt' : 'Submit receipt'}
          </Button>
        </>
      }
    >
      <Stack spacing={2}>
        {allocation.status === 'RETURNED' && allocation.reviewNote ? (
          <InlineAlert tone="warning" title="Returned by the fleet officer">
            {allocation.reviewNote}
          </InlineAlert>
        ) : null}
        {error && !error.fieldErrors?.length ? (
          <InlineAlert tone="danger" title={error.title}>
            {error.message}
          </InlineAlert>
        ) : null}
        <Field
          label="Receipt photo"
          required
          error={proofError}
          hint={proof ? null : 'Take a clear photo of the whole receipt, or attach the PDF the station sent you.'}
        >
          {proof ? (
            <Stack spacing={1}>
              <ProofPreview proof={proof} compact />
              <Box sx={{ display: 'flex', gap: 1 }}>
                <Button size="xs" icon={PhotoCameraIcon} onClick={() => fileInput.current?.click()} loading={reading}>
                  Retake
                </Button>
                <Button size="xs" variant="ghost" icon={DeleteOutlinedIcon} onClick={() => setProof(null)}>
                  Remove
                </Button>
              </Box>
            </Stack>
          ) : (
            <Box
              component="label"
              sx={{
                display: 'flex',
                minHeight: 88,
                cursor: 'pointer',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 1.5,
                borderRadius: 1.5,
                border: '1px dashed',
                borderColor: proofError ? 'error.main' : 'edge.strong',
                px: 2,
                color: 'text.muted',
                fontSize: 13.5,
                '&:hover': { bgcolor: 'background.subtle' },
              }}
            >
              {reading ? <AttachFileIcon aria-hidden /> : <PhotoCameraIcon aria-hidden />}
              <Box component="span">{reading ? 'Preparing photo…' : 'Take a photo or choose a file'}</Box>
              <Box
                component="input"
                ref={fileInput}
                type="file"
                accept={PROOF_ACCEPT}
                capture="environment"
                sx={visuallyHidden}
                onChange={(e) => pickFile(e.target.files?.[0])}
              />
            </Box>
          )}
          {proof ? (
            <Box
              component="input"
              ref={fileInput}
              type="file"
              accept={PROOF_ACCEPT}
              sx={visuallyHidden}
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          ) : null}
        </Field>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { sm: 'repeat(2, minmax(0, 1fr))' } }}>
          <Field label="Station" required error={fieldError('station')}>
            <SuggestInput suggestions={STATIONS} value={values.station} onChange={set('station')} invalid={!!fieldError('station')} />
          </Field>
          <Field label="Date & time on receipt" required error={fieldError('transactedAt')}>
            <Input type="datetime-local" max={toInputDateTime(new Date())} value={values.transactedAt} onChange={set('transactedAt')} />
          </Field>
          <Field
            label="Litres"
            required
            error={fieldError('litres')}
            hint={
              overAllocation
                ? `Up to ${ceiling} L is accepted on a ${allocation.litresAllocated} L allocation.`
                : `Allocated ${formatLitres(allocation.litresAllocated)}.`
            }
          >
            <Input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={values.litres}
              onChange={set('litres')}
              trailing="L"
              invalid={!!fieldError('litres') || overAllocation}
              autoFocus
            />
          </Field>
          <Field label="Price per litre" required error={fieldError('pricePerLitre')}>
            <Input type="number" inputMode="numeric" value={values.pricePerLitre} onChange={set('pricePerLitre')} trailing="RWF" />
          </Field>
          <Field
            label="Odometer"
            required
            error={fieldError('odometerKm')}
            hint={allocation.vehicleOdometerKm != null ? `Vehicle last read ${formatKm(allocation.vehicleOdometerKm)}` : undefined}
          >
            <Input type="number" inputMode="numeric" value={values.odometerKm} onChange={set('odometerKm')} trailing="km" />
          </Field>
          <Field label="Receipt number" required error={fieldError('receiptNumber')}>
            <Input value={values.receiptNumber} onChange={set('receiptNumber')} uppercase invalid={!!fieldError('receiptNumber')} />
          </Field>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            borderRadius: 1.5,
            bgcolor: 'background.subtle',
            px: 1.5,
            py: 1.25,
          }}
        >
          <Typography sx={{ fontSize: 12.5, color: 'text.muted' }}>Total on receipt</Typography>
          <Typography className="tabular" sx={{ fontSize: 16, fontWeight: 600 }}>
            {total != null ? formatCurrency(total) : '—'}
          </Typography>
        </Box>
        <Field label="Note to the fleet officer" hint="Optional">
          <Textarea rows={2} value={values.notes} onChange={set('notes')} placeholder="Pump 3 was slow, receipt printed twice…" />
        </Field>
      </Stack>
    </Dialog>
  )
}
