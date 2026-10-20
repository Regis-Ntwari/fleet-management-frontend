import { useQuery } from '@tanstack/react-query'
import { http } from '@/api/client'

/** Roles the administrator can assign. Not paged: an organisation has a handful. */
export function useRoles(options = {}) {
  const q = useQuery({ queryKey: ['roles', 'list'], queryFn: () => http.get('/roles'), staleTime: 60_000, ...options })
  const roles = q.data ?? []
  return { ...q, roles, options: roles.map((r) => ({ value: r.id, label: r.name, description: r.description, meta: r })) }
}

/** Departments for pickers; pass `active: true` to hide deactivated ones. */
export function useDepartments(params = {}, options = {}) {
  const q = useQuery({
    queryKey: ['departments', 'list', params],
    queryFn: () => http.get('/departments', { params }),
    staleTime: 60_000,
    ...options,
  })
  const departments = q.data ?? []
  return {
    ...q,
    departments,
    options: departments.map((d) => ({ value: d.id, label: d.name, description: d.code, keywords: d.code, meta: d })),
  }
}

/** The static permission catalogue, grouped by module. */
export function usePermissions() {
  const q = useQuery({ queryKey: ['permissions'], queryFn: () => http.get('/permissions'), staleTime: Infinity })
  return { ...q, groups: q.data?.groups ?? [], all: q.data?.all ?? [] }
}
