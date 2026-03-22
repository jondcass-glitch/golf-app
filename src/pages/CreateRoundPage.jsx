import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function CreateRoundPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [courses, setCourses] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const [form, setForm] = useState({
    name: '',
    course_id: '',
    tee_time: '',
    handicap_allowance: 100,
  })

  useEffect(() => {
    supabase.from('courses').select('id, name, location').then(({ data }) => {
      setCourses(data ?? [])
      if (data?.length) setForm(f => ({ ...f, course_id: data[0].id }))
    })
  }, [])

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Generate a unique join code
    const { data: codeData, error: codeError } = await supabase
      .rpc('generate_join_code')
    if (codeError) { setError(codeError.message); setLoading(false); return }

    const { data, error } = await supabase
      .from('rounds')
      .insert({
        name: form.name,
        course_id: form.course_id,
        created_by: user.id,
        join_code: codeData,
        handicap_allowance: parseInt(form.handicap_allowance),
        tee_time: form.tee_time || null,
        status: 'lobby',
      })
      .select()
      .single()

    if (error) { setError(error.message); setLoading(false); return }
    navigate(`/round/${data.id}/betting`, { state: { roundId: data.id } })
  }

  const allowanceOptions = [
    { value: 100, label: '100% — full handicap' },
    { value: 95,  label: '95%' },
    { value: 90,  label: '90%' },
    { value: 85,  label: '85%' },
    { value: 75,  label: '75%' },
  ]

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 20, paddingLeft: 0 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Create a round</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>
        Set up the details — your group joins with a code.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label className="label">Round name</label>
            <input
              className="input"
              name="name"
              placeholder="e.g. Saturday Stableford"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>

          <div>
            <label className="label">Course</label>
            <select
              className="input"
              name="course_id"
              value={form.course_id}
              onChange={handleChange}
              required
            >
              {courses.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.location ? ` — ${c.location}` : ''}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Tee time <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>(optional)</span></label>
            <input
              className="input"
              type="datetime-local"
              name="tee_time"
              value={form.tee_time}
              onChange={handleChange}
            />
          </div>
        </div>

        <div className="card">
          <label className="label">Handicap allowance</label>
          <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
            Players' playing handicap will be calculated as this percentage of their exact handicap. They can still override it manually when joining.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {allowanceOptions.map(opt => (
              <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${parseInt(form.handicap_allowance) === opt.value ? 'var(--green-500)' : 'var(--gray-300)'}`, background: parseInt(form.handicap_allowance) === opt.value ? 'var(--green-50)' : 'white', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="handicap_allowance"
                  value={opt.value}
                  checked={parseInt(form.handicap_allowance) === opt.value}
                  onChange={handleChange}
                  style={{ accentColor: 'var(--green-600)' }}
                />
                <span style={{ fontSize: 14, fontWeight: parseInt(form.handicap_allowance) === opt.value ? 500 : 400 }}>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && (
          <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>
        )}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={loading || !form.name || !form.course_id}
          style={{ width: '100%' }}
        >
          {loading ? 'Creating…' : 'Create round'}
        </button>
      </form>
    </div>
  )
}
