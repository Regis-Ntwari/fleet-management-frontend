import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        // Never retry auth/permission/validation failures; retry transient ones once.
        if (error?.status && error.status < 500 && !error.isNetwork) return false
        return count < 1
      },
    },
    mutations: { retry: false },
  },
})
