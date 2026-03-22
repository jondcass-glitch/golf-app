import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

export default function CreateRoundPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchTimeout = useRef(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Course search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [importingCourse, setImportingCourse] = useState(false)
  const [missingSI, setMissingSI] = useState(false)
  const [siValues, setSiValues] = useState({})

  // Round form state
  const [form, setForm] = useState({
    name: '',
    tee_time: '',
    handicap_allowance: 100,
  })

  const allowanceOptions = [
    { value: 100, label: '100% — full handicap' },
    { value: 95,  label: '95%' },
    { value: 90,  label: '90%' },
    { value: 85,  label: '85%' },
    { value: 75,  label: '75%' },
  ]

  // Debounced search
  useEffect(() => {
    if (searchQuery.length < 3) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(searchQuery), 400)
    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  async function doSearch(query) {
    setSearching(true)
    const { data, error } = await supabase.functions.invoke('search-courses', {
      body: { search: query }
    })
    if (!error && data?.courses) setSearchResults(data.courses.slice(0, 8))
    else setSearchResults([])
    setSearching(false)
  }

  async function selectCourse(course) {
    setImportingCourse(true)
    setSearchResults([])
    setSearchQuery(course.club_name)
    setMissingSI(false)
    setSiValues({})

    // Check if already in our database
    const { data: existing } = await supabase
      .from('courses')
      .select('*')
      .eq('external_id', String(course.id))
      .single()

    if (existing) {
      setSelectedCourse(existing)
      setImportingCourse(false)
      return
    }

    // Fetch full course data from API
    const { data: fullData, error } = await supabase.functions.invoke('get-course', {
      body: { courseId: course.id }
    })

    if (error || !fullData?.course) {
      setError('Failed to fetch course details. Please try again.')
      setImportingCourse(false)
      return
    }

    const apiCourse = fullData.course
    // API nests location fields — flatten for our use
    apiCourse._location = [
      apiCourse.location?.city,
      apiCourse.location?.state,
      apiCourse.location?.country
    ].filter(Boolean).join(', ')

    // Prefer male tees, fall back to female
    const tees = apiCourse.tees?.male?.[0] || apiCourse.tees?.female?.[0]
    const holes = tees?.holes ?? []

    // Check if stroke index data is present
    const hasSI = holes.length === 18 && holes.every(h => h.handicap != null && h.handicap > 0)

    if (!hasSI && holes.length === 18) {
      // Has holes but missing SI — ask user to fill in
      setMissingSI(true)
      const initial = {}
      holes.forEach((_, i) => { initial[i + 1] = '' })
      setSiValues(initial)
      setSelectedCourse({ _apiCourse: apiCourse, _holes: holes, _pending: true })
      setImportingCourse(false)
      return
    }

    if (holes.length !== 18) {
      setError('This course does not have 18 hole data available.')
      setImportingCourse(false)
      return
    }

    // Import course into Supabase
    await importCourse(apiCourse, holes)
  }

  async function importCourse(apiCourse, holes, customSI = null) {
    const totalPar = holes.reduce((sum, h) => sum + (h.par || 4), 0)

    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .insert({
        name: apiCourse.club_name,
        location: apiCourse._location ?? [
          apiCourse.location?.city,
          apiCourse.location?.state,
          apiCourse.location?.country
        ].filter(Boolean).join(', '),
        total_holes: 18,
        par: totalPar,
        external_id: String(apiCourse.id),
      })
      .select()
      .single()

    if (courseError) {
      const { data: existing } = await supabase
        .from('courses')
        .select('*')
        .eq('external_id', String(apiCourse.id))
        .single()
      if (existing) { setSelectedCourse(existing); setImportingCourse(false); return }
      setError('Failed to save course: ' + courseError.message)
      setImportingCourse(false)
      return
    }

    // Holes come back in order but have no number field — use index
    const holeRows = holes.map((h, i) => ({
      course_id: courseData.id,
      hole_number: i + 1,
      par: h.par || 4,
      stroke_index: customSI ? customSI[i + 1] : (h.handicap || i + 1),
    }))

    const { error: holesError } = await supabase.from('holes').insert(holeRows)

    if (holesError) {
      setError('Failed to save holes: ' + holesError.message)
      setImportingCourse(false)
      return
    }

    setSelectedCourse(courseData)
    setMissingSI(false)
    setImportingCourse(false)
  }

  async function handleSISubmit() {
    const values = {}
    Object.entries(siValues).forEach(([k, v]) => { values[parseInt(k)] = parseInt(v) })

    // Check all filled
    const allFilled = Object.values(siValues).every(v => v !== '' && parseInt(v) >= 1 && parseInt(v) <= 18)
    if (!allFilled) { setError('Please fill in all stroke index values between 1 and 18'); return }

    // Check no duplicates
    const usedValues = Object.values(values)
    const unique = new Set(usedValues)
    if (unique.size !== 18) {
      const duplicates = usedValues.filter((v, i) => usedValues.indexOf(v) !== i)
      setError(`Duplicate stroke index values: ${[...new Set(duplicates)].sort((a,b) => a-b).join(', ')}. Each value from 1–18 must be used exactly once.`)
      return
    }

    setError(null)
    setImportingCourse(true)
    await importCourse(selectedCourse._apiCourse, selectedCourse._holes, values)
  }

  function handleChange(e) {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!selectedCourse || selectedCourse._pending) return
    setLoading(true)
    setError(null)

    const { data: codeData, error: codeError } = await supabase.rpc('generate_join_code')
    if (codeError) { setError(codeError.message); setLoading(false); return }

    const { data, error } = await supabase
      .from('rounds')
      .insert({
        name: form.name,
        course_id: selectedCourse.id,
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

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 20, paddingLeft: 0 }}>
        ← Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Create a round</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>
        Search for your course, then fill in the round details.
      </p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Course search */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label className="label">Course</label>

          {!selectedCourse ? (
            <div style={{ position: 'relative' }}>
              <input
                className="input"
                placeholder="Search for a course…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                autoComplete="off"
              />
              {searching && (
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 6 }}>Searching…</p>
              )}
              {searchResults.length > 0 && (
                <div style={{ border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)', marginTop: 6, overflow: 'hidden', background: 'white' }}>
                  {searchResults.map(course => (
                    <div
                      key={course.id}
                      onClick={() => selectCourse(course)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: '0.5px solid var(--gray-100)', fontSize: 14 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}
                    >
                      <p style={{ fontWeight: 500 }}>{course.club_name}</p>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {[course.location?.city, course.location?.state, course.location?.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {importingCourse && (
                <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 6 }}>Importing course data…</p>
              )}
            </div>
          ) : selectedCourse._pending ? (
            <div>
              <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--green-800)' }}>{selectedCourse._apiCourse?.club_name}</p>
                <p style={{ fontSize: 12, color: 'var(--amber-500)', marginTop: 2 }}>Stroke index data not available — please enter manually</p>
              </div>

              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 10 }}>
                Enter the stroke index (1–18) for each hole. Each value must be used exactly once. You can find this on the course scorecard.
              </p>

              {(() => {
                const usedValues = Object.values(siValues).filter(v => v !== '').map(Number)
                const duplicateSet = new Set(usedValues.filter((v, i) => usedValues.indexOf(v) !== i))
                const remaining = Array.from({length: 18}, (_, i) => i + 1)
                  .filter(n => !usedValues.includes(n))

                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                      {selectedCourse._holes.map((h, i) => {
                        const val = parseInt(siValues[i + 1])
                        const isDuplicate = siValues[i + 1] !== '' && duplicateSet.has(val)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--gray-500)', width: 40, flexShrink: 0 }}>H{i + 1} (P{h.par})</span>
                            <input
                              className="input"
                              type="number"
                              min="1"
                              max="18"
                              placeholder="SI"
                              value={siValues[i + 1] ?? ''}
                              onChange={e => { setSiValues(v => ({ ...v, [i + 1]: e.target.value })); setError(null) }}
                              style={{
                                padding: '6px 8px', fontSize: 13, textAlign: 'center',
                                borderColor: isDuplicate ? 'var(--red-500)' : undefined,
                                background: isDuplicate ? 'var(--red-100)' : undefined,
                              }}
                            />
                          </div>
                        )
                      })}
                    </div>

                    {duplicateSet.size > 0 && (
                      <p style={{ fontSize: 12, color: 'var(--red-500)', marginBottom: 8 }}>
                        Duplicate values: {[...duplicateSet].sort((a,b) => a-b).join(', ')} — each SI must be unique
                      </p>
                    )}

                    {remaining.length > 0 && remaining.length < 18 && duplicateSet.size === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--amber-500)', marginBottom: 8 }}>
                        Still needed: {remaining.join(', ')}
                      </p>
                    )}

                    {usedValues.length === 18 && duplicateSet.size === 0 && (
                      <p style={{ fontSize: 12, color: 'var(--green-600)', marginBottom: 8, fontWeight: 500 }}>
                        ✓ All stroke indexes valid
                      </p>
                    )}
                  </>
                )
              })()}

              <button type="button" className="btn btn-primary" onClick={handleSISubmit} style={{ width: '100%' }}>
                Save stroke indexes and continue
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => { setSelectedCourse(null); setSearchQuery(''); setMissingSI(false) }} style={{ width: '100%', marginTop: 8 }}>
                Search for a different course
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--green-800)' }}>{selectedCourse.name}</p>
                <p style={{ fontSize: 12, color: 'var(--green-600)' }}>{selectedCourse.location}</p>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedCourse(null); setSearchQuery('') }}
                style={{ fontSize: 12, color: 'var(--gray-500)', background: 'none', border: 'none', cursor: 'pointer' }}
              >
                Change
              </button>
            </div>
          )}
        </div>

        {/* Round details — only show once course selected */}
        {selectedCourse && !selectedCourse._pending && (
          <>
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
                Players' playing handicap will be calculated as this percentage of their exact handicap.
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
          </>
        )}

        {error && <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>}

        {selectedCourse && !selectedCourse._pending && (
          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading || !form.name}
            style={{ width: '100%' }}
          >
            {loading ? 'Creating…' : 'Create round'}
          </button>
        )}
      </form>
    </div>
  )
}
