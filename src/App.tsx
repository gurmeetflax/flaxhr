import { Navigate, Route, Routes } from 'react-router-dom'
import { Home, Users, Store } from 'lucide-react'
import ProtectedRoute from '@/components/ProtectedRoute'
import AppShell from '@/components/layout/AppShell'
import LoginPage from '@/pages/LoginPage'
import NotFoundPage from '@/pages/NotFoundPage'
import ForbiddenPage from '@/pages/ForbiddenPage'
import AdminDashboard from '@/pages/admin/AdminDashboard'
import EmployeesListPage from '@/pages/admin/EmployeesListPage'
import CreateEmployeePage from '@/pages/admin/CreateEmployeePage'
import EditEmployeePage from '@/pages/admin/EditEmployeePage'
import OutletsPage from '@/pages/admin/OutletsPage'
import NewOutletPage from '@/pages/admin/NewOutletPage'
import EditOutletPage from '@/pages/admin/EditOutletPage'
import MyDashboard from '@/pages/me/MyDashboard'

const adminNav = [
  { to: '/admin', label: 'Overview', icon: Home },
  { to: '/admin/outlets', label: 'Outlets', icon: Store },
  { to: '/admin/employees', label: 'Employees', icon: Users },
]

const employeeNav = [{ to: '/me', label: 'My space', icon: Home }]

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
        <Route path="/admin/employees/:id" element={<EditEmployeePage />} />
      </Route>

      <Route
        element={
          <ProtectedRoute>
            <AppShell nav={employeeNav} title="Employee" />
          </ProtectedRoute>
        }
      >
        <Route path="/me" element={<MyDashboard />} />
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
