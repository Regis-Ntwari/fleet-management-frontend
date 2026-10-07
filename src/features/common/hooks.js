import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { http } from '@/api/client'
import { useToast } from '@/components/ui/Toast'

/** Paged list query; params are usually the URL search state. */
export function usePagedQuery(key, url, params, options = {}) {
  return useQuery({
    queryKey: [...key, params],
    queryFn: ({ signal }) => http.get(url, { params, signal }),
    placeholderData: keepPreviousData,
    ...options,
  })
}

export function useVehicleOptions(params = {}) {
  const q = useQuery({
    queryKey: ['vehicles', 'options', params],
    queryFn: () => http.get('/vehicles/options', { params }),
    staleTime: 60_000,
  })
  const options = (q.data ?? []).map((v) => ({
    value: v.id,
    label: v.plateNumber,
    description: `${v.make} ${v.model} · ${v.categoryName}`,
    keywords: v.fleetNumber,
    meta: v,
  }))
  return { ...q, options }
}

export function useDriverOptions(params = {}) {
  const q = useQuery({
    queryKey: ['drivers', 'options', params],
    queryFn: () => http.get('/drivers/options', { params }),
    staleTime: 60_000,
  })
  const options = (q.data ?? []).map((d) => ({
    value: d.id,
    label: d.fullName,
    description: `${d.employeeNumber}${d.currentVehiclePlate ? ` · ${d.currentVehiclePlate}` : ''}`,
    keywords: d.phone,
    meta: d,
  }))
  return { ...q, options }
}

/** Pushes backend field errors into react-hook-form and toasts the summary. */
export function useApplyServerErrors(setError) {
  const toast = useToast()
  return (error, { silent = false } = {}) => {
    const fields = error?.fieldErrors ?? []
    fields.forEach((f) => setError?.(f.field, { type: 'server', message: f.message }))
    if (!silent) {
      if (fields.length) toast.error('Check the highlighted fields', error.message)
      else toast.error(error?.title ?? 'Request failed', error?.message)
    }
  }
}

/** Mutation helper: toasts errors, invalidates keys, optional success toast. */
export function useApiMutation({ mutationFn, invalidate = [], onSuccess, success, setError }) {
  const queryClient = useQueryClient()
  const toast = useToast()
  const applyErrors = useApplyServerErrors(setError)
  return useMutation({
    mutationFn,
    onSuccess: async (data, variables, ctx) => {
      await Promise.all(invalidate.map((key) => queryClient.invalidateQueries({ queryKey: key })))
      if (success) toast.success(typeof success === 'function' ? success(data) : success)
      await onSuccess?.(data, variables, ctx)
    },
    onError: (error) => applyErrors(error),
  })
}

/** Resets the page to 0 when total pages shrink below the current page. */
export function useClampPage(data, state, update) {
  useEffect(() => {
    if (data && state.page > 0 && state.page >= data.totalPages) update({ page: Math.max(0, data.totalPages - 1) })
  }, [data, state.page, update])
}
