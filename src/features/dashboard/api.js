import { useQuery } from '@tanstack/react-query'
import { http } from '@/api/client'

const useDashboardPart = (part, params, options = {}) =>
  useQuery({
    queryKey: ['dashboard', part, params],
    queryFn: ({ signal }) => http.get(`/dashboard/${part}`, { params, signal }),
    ...options,
  })

export const useDashboardSummary = (params) => useDashboardPart('summary', params)
export const useFleetStatus = (params) => useDashboardPart('fleet-status', params)
export const useDistanceTrend = (params) => useDashboardPart('distance-trend', params)
export const useUtilization = (params) => useDashboardPart('utilization', params)
export const useFuelTrend = (params) => useDashboardPart('fuel-trend', params)
export const useMaintenanceOverview = (params) => useDashboardPart('maintenance', params)
export const useCostByVehicle = (params) => useDashboardPart('cost-by-vehicle', params)
export const useAvailabilityTrend = (params) => useDashboardPart('availability-trend', params)
export const useDashboardAlerts = (params) => useDashboardPart('alerts', params, { refetchInterval: 60_000 })
export const useDailyPosition = (params) => useDashboardPart('daily-position', params)
