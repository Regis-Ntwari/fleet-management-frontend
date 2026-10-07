import DashboardIcon from '@mui/icons-material/SpaceDashboard'
import CampaignIcon from '@mui/icons-material/Campaign'
import SensorsIcon from '@mui/icons-material/Sensors'
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar'
import PeopleIcon from '@mui/icons-material/People'
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd'
import DescriptionIcon from '@mui/icons-material/Description'
import RouteIcon from '@mui/icons-material/Route'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import LocalGasStationIcon from '@mui/icons-material/LocalGasStation'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import BuildIcon from '@mui/icons-material/Build'
import EventRepeatIcon from '@mui/icons-material/EventRepeat'
import Inventory2Icon from '@mui/icons-material/Inventory2'
import BarChartIcon from '@mui/icons-material/BarChart'
import SpeedIcon from '@mui/icons-material/Speed'
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts'
import HistoryIcon from '@mui/icons-material/History'
import SettingsIcon from '@mui/icons-material/Settings'
import UploadIcon from '@mui/icons-material/Upload'

/** Sidebar navigation. Items are hidden when the user lacks the permission. */
export const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon, permission: 'DASHBOARD_VIEW', end: true },
      { to: '/alerts', label: 'Alert centre', icon: CampaignIcon, permission: 'DASHBOARD_VIEW', badge: 'alerts' },
      { to: '/dispatch', label: 'Dispatch', icon: SensorsIcon, permission: 'DISPATCH_VIEW' },
    ],
  },
  {
    label: 'Fleet',
    items: [
      { to: '/vehicles', label: 'Vehicles', icon: DirectionsCarIcon, permission: 'VEHICLE_READ' },
      { to: '/drivers', label: 'Drivers', icon: PeopleIcon, permission: 'DRIVER_READ' },
      { to: '/assignments', label: 'Assignments', icon: AssignmentIndIcon, permission: 'VEHICLE_READ' },
      { to: '/documents', label: 'Documents', icon: DescriptionIcon, permission: 'DOCUMENT_READ' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { to: '/trips', label: 'Trips', icon: RouteIcon, permission: 'TRIP_READ' },
      { to: '/bookings', label: 'Bookings', icon: EventAvailableIcon, permission: 'BOOKING_READ' },
      { to: '/fuel', label: 'Fuel', icon: LocalGasStationIcon, permission: 'FUEL_READ' },
      { to: '/incidents', label: 'Incidents', icon: ReportProblemIcon, permission: 'INCIDENT_READ' },
    ],
  },
  {
    label: 'Workshop',
    items: [
      { to: '/maintenance', label: 'Maintenance', icon: BuildIcon, permission: 'MAINTENANCE_READ', end: true },
      { to: '/maintenance/schedules', label: 'Service schedules', icon: EventRepeatIcon, permission: 'MAINTENANCE_READ' },
      { to: '/parts', label: 'Spare parts', icon: Inventory2Icon, permission: 'MAINTENANCE_READ' },
    ],
  },
  {
    label: 'Insight',
    items: [
      { to: '/reports', label: 'Reports', icon: BarChartIcon, permission: 'REPORT_VIEW' },
      { to: '/daily-position', label: 'Daily position', icon: SpeedIcon, permission: 'DASHBOARD_VIEW' },
    ],
  },
  {
    label: 'Administration',
    items: [
      { to: '/admin/users', label: 'Users', icon: ManageAccountsIcon, permission: 'USER_MANAGE' },
      { to: '/admin/audit', label: 'Audit log', icon: HistoryIcon, permission: 'AUDIT_VIEW' },
      { to: '/admin/imports', label: 'Imports', icon: UploadIcon, permission: ['VEHICLE_CREATE', 'DRIVER_MANAGE', 'FUEL_MANAGE'] },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, permission: 'DASHBOARD_VIEW' },
    ],
  },
]
