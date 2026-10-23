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
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import CorporateFareIcon from '@mui/icons-material/CorporateFare'
import HistoryIcon from '@mui/icons-material/History'
import SettingsIcon from '@mui/icons-material/Settings'
import UploadIcon from '@mui/icons-material/Upload'
import ListAltIcon from '@mui/icons-material/ListAlt'
import TodayIcon from '@mui/icons-material/Today'
import ReceiptLongIcon from '@mui/icons-material/ReceiptLong'
import MeetingRoomIcon from '@mui/icons-material/MeetingRoom'

/** Any of these opens the driver workspace ("My trips"); the Driver role holds exactly these three. */
export const DRIVER_WORKSPACE_PERMISSIONS = ['DEPLOYMENT_START', 'FUEL_SUBMIT', 'MAINTENANCE_REPORT']

/**
 * Whether a navigation item is shown to this user: the permission must be held, and items marked
 * `driverOnly` also need the account to be linked to a driver profile. An administrator holds the
 * driver permissions too, but has no trips of their own, so "My trips" stays out of their menu.
 */
export const navItemVisible = (user, can, item) => can(item.permission) && (!item.driverOnly || Boolean(user?.driverId))

/**
 * Destinations the phone bottom bar prefers, most important first. The first four the user
 * may open are shown; everything else is one tap away under "Menu".
 */
export const MOBILE_NAV_PRIORITY = [
  '/my-trips',
  '/gate',
  '/',
  '/deployments',
  '/dispatch',
  '/commerce',
  '/alerts',
  '/vehicles',
  '/fuel',
  '/maintenance',
  '/parts',
  '/bookings',
  '/reports',
  '/incidents',
  '/drivers',
]

/** Sidebar navigation. Items are hidden when the user lacks the permission. `short` is the bottom-bar label. */
export const NAV_GROUPS = [
  {
    label: 'My work',
    items: [
      { to: '/my-trips', label: 'My trips', icon: TodayIcon, permission: DRIVER_WORKSPACE_PERMISSIONS, driverOnly: true },
      { to: '/gate', label: 'Gate', icon: MeetingRoomIcon, permission: 'GATE_RECORD' },
    ],
  },
  {
    label: 'Overview',
    items: [
      { to: '/', label: 'Dashboard', icon: DashboardIcon, permission: 'DASHBOARD_VIEW', end: true },
      { to: '/alerts', label: 'Alert centre', short: 'Alerts', icon: CampaignIcon, permission: 'DASHBOARD_VIEW', badge: 'alerts' },
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
      { to: '/commerce', label: 'Commerce (LPO)', short: 'Commerce', icon: ReceiptLongIcon, permission: 'ORDER_READ' },
      { to: '/deployments', label: 'Deployments', icon: RouteIcon, permission: 'DEPLOYMENT_READ' },
      { to: '/bookings', label: 'Bookings', icon: EventAvailableIcon, permission: 'BOOKING_READ' },
      { to: '/fuel', label: 'Fuel', icon: LocalGasStationIcon, permission: 'FUEL_READ' },
      { to: '/incidents', label: 'Incidents', icon: ReportProblemIcon, permission: 'INCIDENT_READ' },
    ],
  },
  {
    label: 'Workshop',
    items: [
      { to: '/maintenance', label: 'Maintenance', icon: BuildIcon, permission: 'MAINTENANCE_READ', end: true },
      {
        to: '/maintenance/schedules',
        label: 'Service schedules',
        short: 'Schedules',
        icon: EventRepeatIcon,
        permission: 'MAINTENANCE_READ',
      },
      { to: '/parts', label: 'Stock & spare parts', short: 'Stock', icon: Inventory2Icon, permission: 'MAINTENANCE_READ' },
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
      { to: '/admin/roles', label: 'Roles', icon: AdminPanelSettingsIcon, permission: 'ROLE_MANAGE' },
      { to: '/admin/departments', label: 'Departments', icon: CorporateFareIcon, permission: 'DEPARTMENT_MANAGE' },
      { to: '/admin/reference', label: 'Reference data', icon: ListAltIcon, permission: 'REFERENCE_MANAGE' },
      { to: '/admin/audit', label: 'Audit log', icon: HistoryIcon, permission: 'AUDIT_VIEW' },
      { to: '/admin/imports', label: 'Imports', icon: UploadIcon, permission: ['VEHICLE_CREATE', 'DRIVER_MANAGE', 'FUEL_MANAGE'] },
      { to: '/settings', label: 'Settings', icon: SettingsIcon, permission: 'DASHBOARD_VIEW' },
    ],
  },
]
