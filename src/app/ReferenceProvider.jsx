import { createContext, useContext, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { http } from '@/api/client'
import { useAuth } from './AuthProvider'

const ReferenceContext = createContext(null)

const EMPTY = {
  vehicleStatuses: [],
  driverStatuses: [],
  deploymentStatuses: [],
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
  fuelRequestStatuses: [],
  transmissions: [],
  employmentStatuses: [],
  roles: [],
  serviceTypes: [],
  locations: [],
  tripPurposes: [],
  assignmentPurposes: [],
  fuelStations: [],
  workshops: [],
  technicians: [],
  serviceTasks: [],
  vehicleCategories: [],
  vehicleOwners: [],
  institutions: [],
  currencies: [],
  stockUnits: [],
  stockLocations: [],
  purchaseOrderStatuses: [],
  stockMovementTypes: [],
  companies: [],
  tariffs: [],
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
  trip: 'deploymentStatuses',
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
  fuelRequest: 'fuelRequestStatuses',
  transmission: 'transmissions',
  employmentStatus: 'employmentStatuses',
  role: 'roles',
  serviceType: 'serviceTypes',
  location: 'locations',
  tripPurpose: 'tripPurposes',
  assignmentPurpose: 'assignmentPurposes',
  fuelStation: 'fuelStations',
  workshop: 'workshops',
  technician: 'technicians',
  serviceTask: 'serviceTasks',
  vehicleOwner: 'vehicleOwners',
  institution: 'institutions',
  currency: 'currencies',
  stockUnit: 'stockUnits',
  stockLocation: 'stockLocations',
  purchaseOrder: 'purchaseOrderStatuses',
  stockMovement: 'stockMovementTypes',
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

/** Labels of a suggestion list for free-text fields, e.g. useSuggestions('fuelStation') → ['SP Kacyiru', …] */
export function useSuggestions(kind) {
  const { data } = useReference()
  const list = data[KIND_MAP[kind] ?? kind] ?? []
  return useMemo(() => list.map((s) => s.label), [list])
}

/** Active operating companies for pickers: [{ value, label, description, meta }] */
export function useCompanyOptions({ includeInactive = false } = {}) {
  const { data } = useReference()
  return (data.companies ?? [])
    .filter((c) => includeInactive || c.active)
    .map((c) => ({ value: c.id, label: c.name, description: `${c.legalName} · ${c.numberPrefix}`, meta: c }))
}

/** Active tariff categories (CAT1–CAT3) with their daily rate. */
export function useTariffOptions() {
  const { data } = useReference()
  return (data.tariffs ?? []).filter((t) => t.active).map((t) => ({ value: t.id, label: `${t.code} · ${t.name}`, meta: t }))
}

export function useCategoryOptions() {
  const { data } = useReference()
  return (data.vehicleCategories ?? []).filter((c) => c.active).map((c) => ({ value: c.id, label: c.name, description: c.description }))
}
