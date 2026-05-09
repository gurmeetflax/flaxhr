import { Navigate, Route, Routes } from 'react-router-dom'
import {
  CalendarDays,
  CalendarRange,
  CheckSquare,
  Clock,
  ClipboardCheck,
  ClipboardList,
  CircleDollarSign,
  Gift,
  History,
  Home,
  ListChecks,
  LogOut,
  Plane,
  Receipt,
  Settings as SettingsIcon,
  Store,
  TrendingDown,
  Users,
  Wallet,
} from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'
import ForbiddenPage from '@/pages/ForbiddenPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import EmployeesListPage from '@/pages/admin/EmployeesListPage'
import CreateEmployeePage from '@/pages/admin/CreateEmployeePage'
import BulkEmployeesPage from '@/pages/admin/BulkEmployeesPage'
import EditEmployeePage from '@/pages/admin/EditEmployeePage'
import OutletsPage from '@/pages/admin/OutletsPage'
import NewOutletPage from '@/pages/admin/NewOutletPage'
import EditOutletPage from '@/pages/admin/EditOutletPage'
import AttendancePage from '@/pages/admin/AttendancePage'
import RegularisationsPage from '@/pages/admin/RegularisationsPage'
import ShiftsPage from '@/pages/admin/ShiftsPage'
import RosterPage from '@/pages/admin/RosterPage'
import LeaveApprovalsPage from '@/pages/admin/LeaveApprovalsPage'
import LeavePoliciesPage from '@/pages/admin/LeavePoliciesPage'
import EvaluationsPage from '@/pages/admin/EvaluationsPage'
import EvaluationBuilderPage from '@/pages/admin/EvaluationBuilderPage'
import EvaluationRunPage from '@/pages/admin/EvaluationRunPage'
import SettingsPage from '@/pages/admin/SettingsPage'
import GiftCodesPage from '@/pages/admin/GiftCodesPage'
import PayrollPage from '@/pages/admin/PayrollPage'
import PayrollRunPage from '@/pages/admin/PayrollRunPage'
import PayslipPage from '@/pages/me/PayslipPage'
import FnfListPage from '@/pages/admin/FnfListPage'
import FnfDetailPage from '@/pages/admin/FnfDetailPage'
import PipsPage from '@/pages/admin/PipsPage'
import EmployeeSnapshotPage from '@/pages/admin/EmployeeSnapshotPage'
import MyPipPage from '@/pages/me/MyPipPage'
import ServiceChargePage from '@/pages/admin/ServiceChargePage'
import ServiceChargeRunPage from '@/pages/admin/ServiceChargeRunPage'
import SalesPage from '@/pages/admin/SalesPage'
import MyDashboard from '@/pages/me/MyDashboard'
import PunchPage from '@/pages/me/PunchPage'
import MyAttendancePage from '@/pages/me/MyAttendancePage'
import RegularisePage from '@/pages/me/RegularisePage'
import MyRosterPage from '@/pages/me/MyRosterPage'
import LeavePage from '@/pages/me/LeavePage'
import NotificationsPage from '@/pages/me/NotificationsPage'

const adminNav = [
  { to: '/admin', label: 'Overview', icon: Home },
  { to: '/admin/outlets', label: 'Outlets', icon: Store },
  { to: '/admin/employees', label: 'Employees', icon: Users },
  { to: '/admin/attendance', label: 'Attendance', icon: ClipboardList },
  { to: '/admin/regularisations', label: 'Regularisations', icon: CheckSquare },
  { to: '/admin/shifts', label: 'Shifts', icon: Clock },
  { to: '/admin/roster', label: 'Roster', icon: CalendarRange },
  { to: '/admin/leave/approvals', label: 'Leave approvals', icon: Plane },
  { to: '/admin/leave/policies', label: 'Leave policies', icon: ListChecks },
  { to: '/admin/sales', label: 'Sales', icon: CircleDollarSign },
  { to: '/admin/service-charge', label: 'Service charge', icon: CircleDollarSign },
  { to: '/admin/payroll', label: 'Payroll', icon: Wallet },
  { to: '/admin/evaluations', label: 'Evaluations', icon: ClipboardCheck },
  { to: '/admin/pips', label: 'PIPs', icon: TrendingDown },
  { to: '/admin/fnf', label: 'FnF & clearance', icon: LogOut },
  { to: '/admin/gift-codes', label: 'Birthday vouchers', icon: Gift },
  { to: '/admin/settings', label: 'Settings', icon: SettingsIcon },
]

const employeeNav = [
  { to: '/me', label: 'Punch', icon: Clock },
  { to: '/me/history', label: 'My attendance', icon: History },
  { to: '/me/regularise', label: 'Regularise', icon: CheckSquare },
  { to: '/me/roster', label: 'My roster', icon: CalendarDays },
  { to: '/me/leave', label: 'Leave', icon: Plane },
  { to: '/me/payslips', label: 'Payslips', icon: Receipt },
  { to: '/me/pip', label: 'Performance plan', icon: TrendingDown },
  { to: '/me/overview', label: 'My space', icon: Home },
]

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forbidden" element={<ForbiddenPage />} />

      <Route
        element={
          <ProtectedRoute roles={['admin', 'hr']}>
            <AppShell nav={adminNav} title="Admin" />
          </ProtectedRoute>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/outlets" element={<OutletsPage />} />
        <Route path="/admin/outlets/new" element={<NewOutletPage />} />
        <Route path="/admin/outlets/:id" element={<EditOutletPage />} />
        <Route path="/admin/employees" element={<EmployeesListPage />} />
        <Route path="/admin/employees/new" element={<CreateEmployeePage />} />
        <Route path="/admin/employees/bulk" element={<BulkEmployeesPage />} />
        <Route path="/admin/employees/:id" element={<EditEmployeePage />} />
        <Route path="/admin/attendance" element={<AttendancePage />} />
        <Route path="/admin/regularisations" element={<RegularisationsPage />} />
        <Route path="/admin/shifts" element={<ShiftsPage />} />
        <Route path="/admin/roster" element={<RosterPage />} />
        <Route path="/admin/leave/approvals" element={<LeaveApprovalsPage />} />
        <Route path="/admin/leave/policies" element={<LeavePoliciesPage />} />
        <Route path="/admin/sales" element={<SalesPage />} />
        <Route path="/admin/service-charge" element={<ServiceChargePage />} />
        <Route path="/admin/service-charge/runs/:id" element={<ServiceChargeRunPage />} />
        <Route path="/admin/evaluations" element={<EvaluationsPage />} />
        <Route
          path="/admin/evaluations/questionnaires/:id"
          element={<EvaluationBuilderPage />}
        />
        <Route
          path="/admin/evaluations/runs/:id"
          element={<EvaluationRunPage />}
        />
        <Route path="/admin/settings" element={<SettingsPage />} />
        <Route path="/admin/gift-codes" element={<GiftCodesPage />} />
        <Route path="/admin/payroll" element={<PayrollPage />} />
        <Route path="/admin/payroll/runs/:id" element={<PayrollRunPage />} />
        <Route path="/admin/fnf" element={<FnfListPage />} />
        <Route path="/admin/fnf/:id" element={<FnfDetailPage />} />
        <Route path="/admin/pips" element={<PipsPage />} />
        <Route path="/admin/employees/:id/snapshot" element={<EmployeeSnapshotPage />} />
        <Route path="/admin/notifications" element={<NotificationsPage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <AppShell nav={employeeNav} title="Employee" />
          </ProtectedRoute>
        }
      >
        <Route path="/me" element={<PunchPage />} />
        <Route path="/me/history" element={<MyAttendancePage />} />
        <Route path="/me/regularise" element={<RegularisePage />} />
        <Route path="/me/roster" element={<MyRosterPage />} />
        <Route path="/me/leave" element={<LeavePage />} />
        <Route path="/me/overview" element={<MyDashboard />} />
        <Route path="/me/payslips" element={<PayslipPage />} />
        <Route path="/me/pip" element={<MyPipPage />} />
        <Route path="/me/notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
