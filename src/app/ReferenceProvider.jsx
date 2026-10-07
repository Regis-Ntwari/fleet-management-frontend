import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/api/client'
import { useAuth } from './AuthProvider'

const ReferenceContext = createContext(null)

const EMPTY = {
  vehicleStatuses: [],
  driverStatuses: [],
  tripStatuses: [],
  bookingStatuses: [],
  maintenanceStatuses: [],
  maintenanceTypes: [],
  incidentStatuses: [],
  incidentTypes: [],
  incidentSeverities: [],
  documentStatuses: [],
  documentTypes: [],
  gpsStatuses: [],
  assignmentStatuses: [],
  fuelTypes: [],
  transmissions: [],
  roles: [],
  serviceTypes: [],
  vehicleCategories: [],
}

/** Loads enum labels, tones and categories once; every status badge and select reads from here. */
export function ReferenceProvider({ children }) {
  const { status } = useAuth()
  const query = useQuery({
    queryKey: ['reference'],
    queryFn: () => http.get('/reference'),
    enabled: status === 'authenticated',
    staleTime: 10 * 60_000,
  })
  const value = useMemo(
    () => ({ data: query.data ?? EMPTY, isLoading: query.isLoading, error: query.error, refetch: query.refetch }),
    [query.data, query.isLoading, query.error, query.refetch],
  )
  return <ReferenceContext.Provider value={value}>{children}</ReferenceContext.Provider>
}

export function useReference() {
  const ctx = useContext(ReferenceContext)
  if (!ctx) throw new Error('useReference must be used inside <ReferenceProvider>')
  return ctx
}

const KIND_MAP = {
  vehicle: 'vehicleStatuses',
  driver: 'driverStatuses',
  trip: 'tripStatuses',
  booking: 'bookingStatuses',
  maintenance: 'maintenanceStatuses',
  maintenanceType: 'maintenanceTypes',
  incident: 'incidentStatuses',
  incidentType: 'incidentTypes',
  severity: 'incidentSeverities',
  document: 'documentStatuses',
  documentType: 'documentTypes',
  gps: 'gpsStatuses',
  assignment: 'assignmentStatuses',
  fuelType: 'fuelTypes',
  transmission: 'transmissions',
  role: 'roles',
  serviceType: 'serviceTypes',
}

export function useStatusMeta(kind, value) {
  const { data } = useReference()
  const list = data[KIND_MAP[kind] ?? kind] ?? []
  return list.find((s) => s.value === value) ?? null
}

/** Options for a select, e.g. useOptions('vehicle') → [{ value, label, tone }] */
export function useOptions(kind) {
  const { data } = useReference()
  return data[KIND_MAP[kind] ?? kind] ?? []
}

export function useCategoryOptions() {
  const { data } = useReference()
  return (data.vehicleCategories ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.description }))
}
