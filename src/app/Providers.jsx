import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './queryClient'
import { ThemeProvider } from './ThemeProvider'
import { AuthProvider } from './AuthProvider'
import { ReferenceProvider } from './ReferenceProvider'
import { ToastProvider } from '@/components/ui/Toast'

export function Providers({ children }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <ReferenceProvider>{children}</ReferenceProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
