import { useEffect } from 'react'
import { useBlocker } from 'react-router'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Divider from '@mui/material/Divider'
import { Button } from '@/components/ui/Button'
import { PageHeader } from '@/components/ui/PageHeader'
import { ConfirmDialog } from '@/components/ui/Dialog'
import { InlineAlert } from '@/components/ui/Feedback'

/** Chrome for create/edit screens: header, dirty-state guard, sticky actions. */
export function FormPage({
  title,
  description,
  breadcrumbs,
  onSubmit,
  isDirty,
  isSubmitting,
  submitLabel = 'Save',
  cancelTo,
  serverError,
  children,
  extraActions,
}) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => isDirty && !isSubmitting && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    if (!isDirty) return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [isDirty])

  return (
    <Box component="form" onSubmit={onSubmit} noValidate>
      <PageHeader title={title} description={description} breadcrumbs={breadcrumbs} />
      {serverError ? (
        <InlineAlert tone="danger" title={serverError.title ?? 'Could not save'} sx={{ mb: 2.5 }}>
          {serverError.message}
        </InlineAlert>
      ) : null}
      <Stack spacing={4} divider={<Divider />}>
        {children}
      </Stack>
      <Box
        sx={{
          position: 'sticky',
          bottom: 0,
          zIndex: 20,
          mx: { xs: -2, sm: -3, lg: -4 },
          mt: 4,
          borderTop: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(var(--limoz-palette-background-defaultChannel) / 0.95)',
          backdropFilter: 'blur(8px)',
          px: { xs: 2, sm: 3, lg: 4 },
          py: 1.5,
        }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'flex-end', mx: 'auto', maxWidth: 1480 }}>
          {extraActions}
          <Button variant="ghost" to={cancelTo} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {submitLabel}
          </Button>
        </Stack>
      </Box>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset()}
        onConfirm={() => blocker.proceed()}
        title="Discard unsaved changes?"
        description="You have changes that have not been saved. If you leave now they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
      />
    </Box>
  )
}
