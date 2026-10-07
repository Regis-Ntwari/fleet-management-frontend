import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * Keeps list filters, paging and sorting in the URL so views are shareable
 * and survive refreshes. Returns [state, setState] where setState merges.
 */
export function useSearchState(initialDefaults = {}) {
  const [params, setParams] = useSearchParams()
  // Defaults are captured once; callers pass inline objects.
  const [defaults] = useState(initialDefaults)
  const state = useMemo(() => {
    const out = { ...defaults }
    for (const [k, v] of params.entries()) out[k] = v
    if (out.page != null) out.page = Number(out.page)
    if (out.size != null) out.size = Number(out.size)
    return out
  }, [params, defaults])

  const update = useCallback(
    (patch, { replace = true } = {}) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          const resetPage = Object.keys(patch).some((k) => k !== 'page' && k !== 'size')
          for (const [k, v] of Object.entries(patch)) {
            if (v === undefined || v === null || v === '' || (defaults[k] !== undefined && String(defaults[k]) === String(v)))
              next.delete(k)
            else next.set(k, String(v))
          }
          if (resetPage && !('page' in patch)) next.delete('page')
          return next
        },
        { replace },
      )
    },
    [setParams, defaults],
  )

  const reset = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams])

  return [state, update, reset]
}
