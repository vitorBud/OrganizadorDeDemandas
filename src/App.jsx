import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { RealtimeStatusProvider } from './context/RealtimeStatusContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppShell } from './components/AppShell'
import './App.css'

const lazyPage = (loader, name) => lazy(() => loader().then((mod) => ({ default: mod[name] })))

const Landing = lazyPage(() => import('./pages/Landing'), 'Landing')
const Login = lazyPage(() => import('./pages/Login'), 'Login')
const Register = lazyPage(() => import('./pages/Register'), 'Register')
const Workspace = lazyPage(() => import('./pages/Workspace'), 'Workspace')
const ProjectBoard = lazyPage(() => import('./pages/ProjectBoard'), 'ProjectBoard')
const Dashboard = lazyPage(() => import('./pages/Dashboard'), 'Dashboard')
const ProfileSettings = lazyPage(() => import('./pages/ProfileSettings'), 'ProfileSettings')
const ConnectionStatus = lazyPage(() => import('./pages/ConnectionStatus'), 'ConnectionStatus')

function RouteFallback() {
  return (
    <div className="route-fallback" role="status">
      Carregando…
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/cadastro" element={<Register />} />
              <Route
                path="/app"
                element={
                  <ProtectedRoute>
                    <RealtimeStatusProvider>
                      <AppShell />
                    </RealtimeStatusProvider>
                  </ProtectedRoute>
                }
              >
                <Route index element={<Workspace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="perfil" element={<ProfileSettings />} />
                <Route path="status" element={<ConnectionStatus />} />
                <Route path="projeto/:projectId" element={<ProjectBoard />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
