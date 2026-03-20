import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import HomePage from './pages/HomePage'
import CreateRoundPage from './pages/CreateRoundPage'
import JoinRoundPage from './pages/JoinRoundPage'
import RoundPage from './pages/RoundPage'
import PlayPage from './pages/PlayPage'
import ResultsPage from './pages/ResultsPage'
import ProfilePage from './pages/ProfilePage'
import './styles/global.css'

function RequireAuth({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return null

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
      <Route path="/round/new" element={<RequireAuth><CreateRoundPage /></RequireAuth>} />
      <Route path="/round/:roundId/join" element={<RequireAuth><JoinRoundPage /></RequireAuth>} />
      <Route path="/round/:roundId" element={<RequireAuth><RoundPage /></RequireAuth>} />
      <Route path="/round/:roundId/play" element={<RequireAuth><PlayPage /></RequireAuth>} />
      <Route path="/round/:roundId/results" element={<RequireAuth><ResultsPage /></RequireAuth>} />
      <Route path="/profile" element={<RequireAuth><ProfilePage /></RequireAuth>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  )
}
