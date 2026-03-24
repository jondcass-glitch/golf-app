import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function JoinRedirectPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [error, setError] = useState(null)

  useEffect(() => {
    async function resolve() {
      const { data, error } = await supabase
        .from('rounds')
        .select('id, status')
        .eq('join_code', code.toUpperCase())
        .single()

      if (error || !data) {
        setError('Round not found. Check the link and try again.')
        return
      }
      if (data.status === 'completed') {
        setError('This round has already finished.')
        return
      }

      // Redirect to join page — auth guard will handle login if needed
      navigate(`/round/${data.id}/join`, { replace: true })
    }
    resolve()
  }, [code])

  if (error) {
    return (
      <div className="page" style={{ paddingTop: 80, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
        <p style={{ fontSize: 16, color: 'var(--red-500)', marginBottom: 8 }}>{error}</p>
        <button className="btn btn-secondary" onClick={() => navigate('/')}>Go to home</button>
      </div>
    )
  }

  return (
    <div className="page" style={{ paddingTop: 80, textAlign: 'center', color: 'var(--gray-500)' }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>⛳</div>
      <p>Finding your round…</p>
    </div>
  )
}
