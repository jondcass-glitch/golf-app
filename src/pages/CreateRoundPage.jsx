import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

const VALID_PARS = [3, 4, 5]

function makeEmptyHoles() {
  return Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, par: '', stroke_index: '' }))
}

export default function CreateRoundPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const searchTimeout = useRef(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState('search') // 'search' | 'manual'

  // Course search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [selectedCourse, setSelectedCourse] = useState(null)
  const [importingCourse, setImportingCourse] = useState(false)
  const [siValues, setSiValues] = useState({})

  // Manual entry state
  const [manualName, setManualName] = useState('')
  const [manualLocation, setManualLocation] = useState('')
  const [manualHoles, setManualHoles] = useState(makeEmptyHoles())
  const [savingManual, setSavingManual] = useState(false)

  // Round form state
  const [form, setForm] = useState({ name: '', tee_time: '', handicap_allowance: 100 })

  const allowanceOptions = [
    { value: 100, label: '100% — full handicap' },
    { value: 95,  label: '95%' },
    { value: 90,  label: '90%' },
    { value: 85,  label: '85%' },
    { value: 75,  label: '75%' },
  ]

  // ── Search ────────────────────────────────────────────────
  useEffect(() => {
    if (searchQuery.length < 3) { setSearchResults([]); return }
    clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(() => doSearch(searchQuery), 400)
    return () => clearTimeout(searchTimeout.current)
  }, [searchQuery])

  async function doSearch(query) {
    setSearching(true)

    // 1. Search Supabase first
    const { data: localResults } = await supabase
      .from('courses')
      .select('id, name, location, external_id')
      .ilike('name', `%${query}%`)
      .limit(5)

    const local = (localResults ?? []).map(c => ({
      id: c.id,
      club_name: c.name,
      location: { city: c.location },
      _isLocal: true,
      _courseData: c,
    }))

    // 2. If fewer than 3 local results, also query the API
    let api = []
    if (local.length < 3) {
      const { data, error } = await supabase.functions.invoke('search-courses', { body: { search: query } })
      if (!error && data?.courses) {
        // Filter out any API results that match a course already in Supabase
        const localNames = new Set(local.map(c => c.club_name.toLowerCase()))
        api = data.courses
          .filter(c => !localNames.has(c.club_name.toLowerCase()))
          .slice(0, 8 - local.length)
      }
    }

    setSearchResults([...local, ...api])
    setSearching(false)
  }

  async function selectCourse(course) {
    // If it's already in Supabase, use it directly
    if (course._isLocal) {
      setSelectedCourse(course._courseData)
      setSearchQuery(course.club_name)
      setSearchResults([])
      return
    }

    setImportingCourse(true)
    setSearchResults([])
    setSearchQuery(course.club_name)

    const { data: existing } = await supabase
      .from('courses').select('*').eq('external_id', String(course.id)).single()
    if (existing) { setSelectedCourse(existing); setImportingCourse(false); return }

    const { data: fullData, error } = await supabase.functions.invoke('get-course', { body: { courseId: course.id } })
    if (error || !fullData?.course) { setError('Failed to fetch course details.'); setImportingCourse(false); return }

    const apiCourse = fullData.course
    apiCourse._location = [apiCourse.location?.city, apiCourse.location?.state, apiCourse.location?.country].filter(Boolean).join(', ')
    const tees = apiCourse.tees?.male?.[0] || apiCourse.tees?.female?.[0]
    const holes = tees?.holes ?? []
    const hasSI = holes.length === 18 && holes.every(h => h.handicap != null && h.handicap > 0)

    if (!hasSI && holes.length === 18) {
      const initial = {}
      holes.forEach((_, i) => { initial[i + 1] = '' })
      setSiValues(initial)
      setSelectedCourse({ _apiCourse: apiCourse, _holes: holes, _pending: true })
      setImportingCourse(false)
      return
    }
    if (holes.length !== 18) { setError('This course does not have 18 hole data available.'); setImportingCourse(false); return }
    await importCourse(apiCourse, holes)
  }

  async function importCourse(apiCourse, holes, customSI = null) {
    const totalPar = holes.reduce((sum, h) => sum + (h.par || 4), 0)
    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .insert({ name: apiCourse.club_name, location: apiCourse._location ?? [apiCourse.location?.city, apiCourse.location?.state, apiCourse.location?.country].filter(Boolean).join(', '), total_holes: 18, par: totalPar, external_id: String(apiCourse.id) })
      .select().single()

    if (courseError) {
      const { data: existing } = await supabase.from('courses').select('*').eq('external_id', String(apiCourse.id)).single()
      if (existing) { setSelectedCourse(existing); setImportingCourse(false); return }
      setError('Failed to save course: ' + courseError.message); setImportingCourse(false); return
    }

    const holeRows = holes.map((h, i) => ({ course_id: courseData.id, hole_number: i + 1, par: h.par || 4, stroke_index: customSI ? customSI[i + 1] : (h.handicap || i + 1) }))
    const { error: holesError } = await supabase.from('holes').insert(holeRows)
    if (holesError) { setError('Failed to save holes: ' + holesError.message); setImportingCourse(false); return }
    setSelectedCourse(courseData)
    setImportingCourse(false)
  }

  async function handleSISubmit() {
    const values = {}
    Object.entries(siValues).forEach(([k, v]) => { values[parseInt(k)] = parseInt(v) })
    const allFilled = Object.values(siValues).every(v => v !== '' && parseInt(v) >= 1 && parseInt(v) <= 18)
    if (!allFilled) { setError('Please fill in all stroke index values between 1 and 18'); return }
    const usedValues = Object.values(values)
    const unique = new Set(usedValues)
    if (unique.size !== 18) {
      const duplicates = usedValues.filter((v, i) => usedValues.indexOf(v) !== i)
      setError(`Duplicate stroke index values: ${[...new Set(duplicates)].sort((a, b) => a - b).join(', ')}. Each value from 1–18 must be used exactly once.`)
      return
    }
    setError(null)
    setImportingCourse(true)
    await importCourse(selectedCourse._apiCourse, selectedCourse._holes, values)
  }

  // ── Manual entry validation ───────────────────────────────
  function updateHole(index, field, value) {
    setManualHoles(holes => holes.map((h, i) => i === index ? { ...h, [field]: value } : h))
  }

  function getHoleErrors(hole) {
    const errors = {}
    if (hole.par !== '' && !VALID_PARS.includes(parseInt(hole.par))) errors.par = 'Must be 3, 4 or 5'
    if (hole.stroke_index !== '' && (parseInt(hole.stroke_index) < 1 || parseInt(hole.stroke_index) > 18)) errors.stroke_index = 'Must be 1–18'
    return errors
  }

  function getManualValidation() {
    const nameOk = manualName.trim().length > 0
    const locationOk = manualLocation.trim().length > 0
    const siUsed = manualHoles.map(h => parseInt(h.stroke_index)).filter(v => !isNaN(v))
    const siUnique = new Set(siUsed)
    const duplicateSI = siUsed.filter((v, i) => siUsed.indexOf(v) !== i)
    const holesComplete = manualHoles.every(h =>
      h.par !== '' && VALID_PARS.includes(parseInt(h.par)) &&
      h.stroke_index !== '' && parseInt(h.stroke_index) >= 1 && parseInt(h.stroke_index) <= 18
    )
    const siAllUnique = siUnique.size === siUsed.length
    const completedCount = manualHoles.filter(h => h.par !== '' && VALID_PARS.includes(parseInt(h.par)) && h.stroke_index !== '' && parseInt(h.stroke_index) >= 1 && parseInt(h.stroke_index) <= 18).length
    return { nameOk, locationOk, holesComplete, siAllUnique, duplicateSI, completedCount, isValid: nameOk && locationOk && holesComplete && siAllUnique }
  }

  async function handleManualSave() {
    const v = getManualValidation()
    if (!v.isValid) return
    setSavingManual(true)
    setError(null)

    const totalPar = manualHoles.reduce((sum, h) => sum + parseInt(h.par), 0)
    const { data: courseData, error: courseError } = await supabase
      .from('courses')
      .insert({ name: manualName.trim(), location: manualLocation.trim(), total_holes: 18, par: totalPar })
      .select().single()

    if (courseError) { setError('Failed to save course: ' + courseError.message); setSavingManual(false); return }

    const holeRows = manualHoles.map(h => ({ course_id: courseData.id, hole_number: h.hole_number, par: parseInt(h.par), stroke_index: parseInt(h.stroke_index) }))
    const { error: holesError } = await supabase.from('holes').insert(holeRows)
    if (holesError) { setError('Failed to save holes: ' + holesError.message); setSavingManual(false); return }

    setSelectedCourse(courseData)
    setMode('search')
    setSavingManual(false)
  }

  // ── Round submit ──────────────────────────────────────────
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
      .insert({ name: form.name, course_id: selectedCourse.id, created_by: user.id, join_code: codeData, handicap_allowance: parseInt(form.handicap_allowance), tee_time: form.tee_time || null, status: 'lobby' })
      .select().single()

    if (error) { setError(error.message); setLoading(false); return }
    navigate(`/round/${data.id}/betting`, { state: { roundId: data.id } })
  }

  const manualV = getManualValidation()
  const siUsedInManual = manualHoles.map(h => parseInt(h.stroke_index)).filter(v => !isNaN(v))
  const siDuplicatesInManual = new Set(siUsedInManual.filter((v, i) => siUsedInManual.indexOf(v) !== i))

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button className="btn btn-ghost" onClick={() => navigate('/')} style={{ marginBottom: 20, paddingLeft: 0 }}>← Back</button>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Create a round</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>Search for your course or enter it manually.</p>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Course section */}
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="label" style={{ marginBottom: 0 }}>Course</label>
            {!selectedCourse && (
              <div style={{ display: 'flex', gap: 4 }}>
                <button type="button" onClick={() => { setMode('search'); setError(null) }}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: `1px solid ${mode === 'search' ? 'var(--green-500)' : 'var(--gray-300)'}`, background: mode === 'search' ? 'var(--green-50)' : 'white', color: mode === 'search' ? 'var(--green-700)' : 'var(--gray-600)', cursor: 'pointer', fontWeight: mode === 'search' ? 500 : 400 }}>
                  Search
                </button>
                <button type="button" onClick={() => { setMode('manual'); setError(null) }}
                  style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: `1px solid ${mode === 'manual' ? 'var(--green-500)' : 'var(--gray-300)'}`, background: mode === 'manual' ? 'var(--green-50)' : 'white', color: mode === 'manual' ? 'var(--green-700)' : 'var(--gray-600)', cursor: 'pointer', fontWeight: mode === 'manual' ? 500 : 400 }}>
                  Enter manually
                </button>
              </div>
            )}
          </div>

          {/* ── Search mode ── */}
          {!selectedCourse && mode === 'search' && (
            <div style={{ position: 'relative' }}>
              <input className="input" placeholder="Search for a course…" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} autoComplete="off" />
              {searching && <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 6 }}>Searching…</p>}
              {searchResults.length > 0 && (
                <div style={{ border: '1px solid var(--gray-300)', borderRadius: 'var(--radius-md)', marginTop: 6, overflow: 'hidden', background: 'white' }}>
                  {searchResults.map((course, i) => (
                    <div key={course._isLocal ? course.id : course.id + '-api'} onClick={() => selectCourse(course)}
                      style={{ padding: '10px 14px', cursor: 'pointer', borderBottom: i < searchResults.length - 1 ? '0.5px solid var(--gray-100)' : 'none', fontSize: 14 }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--gray-50)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontWeight: 500, flex: 1 }}>{course.club_name}</p>
                        {course._isLocal && (
                          <span style={{ fontSize: 10, background: 'var(--green-100)', color: 'var(--green-700)', padding: '2px 7px', borderRadius: 10, fontWeight: 500, flexShrink: 0 }}>saved</span>
                        )}
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                        {course._isLocal
                          ? course.location?.city
                          : [course.location?.city, course.location?.state, course.location?.country].filter(Boolean).join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {importingCourse && <p style={{ fontSize: 13, color: 'var(--gray-400)', marginTop: 6 }}>Importing course data…</p>}
              {searchQuery.length >= 3 && !searching && searchResults.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--gray-500)', marginTop: 8 }}>
                  No courses found —{' '}
                  <button type="button" onClick={() => setMode('manual')} style={{ background: 'none', border: 'none', color: 'var(--green-600)', fontSize: 13, cursor: 'pointer', fontWeight: 500, padding: 0 }}>
                    enter course manually →
                  </button>
                </p>
              )}
            </div>
          )}

          {/* ── SI entry for API courses missing SI ── */}
          {!selectedCourse?._pending === false && selectedCourse?._pending && mode === 'search' && (
            <div>
              <div style={{ background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-md)', padding: '10px 14px', marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--green-800)' }}>{selectedCourse._apiCourse?.club_name}</p>
                <p style={{ fontSize: 12, color: 'var(--amber-500)', marginTop: 2 }}>Stroke index not available — please enter manually</p>
              </div>
              <p style={{ fontSize: 13, color: 'var(--gray-600)', marginBottom: 10 }}>Enter the stroke index (1–18) for each hole. Each value must be used exactly once.</p>
              {(() => {
                const usedValues = Object.values(siValues).filter(v => v !== '').map(Number)
                const duplicateSet = new Set(usedValues.filter((v, i) => usedValues.indexOf(v) !== i))
                const remaining = Array.from({ length: 18 }, (_, i) => i + 1).filter(n => !usedValues.includes(n))
                return (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                      {selectedCourse._holes.map((h, i) => {
                        const val = parseInt(siValues[i + 1])
                        const isDuplicate = siValues[i + 1] !== '' && duplicateSet.has(val)
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, color: 'var(--gray-500)', width: 40, flexShrink: 0 }}>H{i + 1} (P{h.par})</span>
                            <input className="input" type="number" min="1" max="18" placeholder="SI" value={siValues[i + 1] ?? ''}
                              onChange={e => { setSiValues(v => ({ ...v, [i + 1]: e.target.value })); setError(null) }}
                              style={{ padding: '6px 8px', fontSize: 13, textAlign: 'center', borderColor: isDuplicate ? 'var(--red-500)' : undefined, background: isDuplicate ? 'var(--red-100)' : undefined }} />
                          </div>
                        )
                      })}
                    </div>
                    {duplicateSet.size > 0 && <p style={{ fontSize: 12, color: 'var(--red-500)', marginBottom: 8 }}>Duplicate values: {[...duplicateSet].sort((a, b) => a - b).join(', ')}</p>}
                    {remaining.length > 0 && remaining.length < 18 && duplicateSet.size === 0 && <p style={{ fontSize: 12, color: 'var(--amber-500)', marginBottom: 8 }}>Still needed: {remaining.join(', ')}</p>}
                    {usedValues.length === 18 && duplicateSet.size === 0 && <p style={{ fontSize: 12, color: 'var(--green-600)', marginBottom: 8, fontWeight: 500 }}>✓ All stroke indexes valid</p>}
                  </>
                )
              })()}
              <button type="button" className="btn btn-primary" onClick={handleSISubmit} style={{ width: '100%' }}>Save and continue</button>
              <button type="button" className="btn btn-ghost" onClick={() => { setSelectedCourse(null); setSearchQuery('') }} style={{ width: '100%', marginTop: 8 }}>Search for a different course</button>
            </div>
          )}

          {/* ── Manual entry mode ── */}
          {!selectedCourse && mode === 'manual' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label className="label">Course name</label>
                <input className="input" placeholder="e.g. Sunningdale Old Course" value={manualName} onChange={e => setManualName(e.target.value)}
                  style={{ borderColor: manualName.trim() ? 'var(--green-400)' : undefined }} />
                {!manualName.trim() && manualName !== '' && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 4 }}>Course name is required</p>}
              </div>

              <div>
                <label className="label">Location</label>
                <input className="input" placeholder="e.g. Sunningdale, Berkshire" value={manualLocation} onChange={e => setManualLocation(e.target.value)}
                  style={{ borderColor: manualLocation.trim() ? 'var(--green-400)' : undefined }} />
                {!manualLocation.trim() && manualLocation !== '' && <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 4 }}>Location is required</p>}
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <label className="label" style={{ marginBottom: 0 }}>Holes</label>
                  <span style={{ fontSize: 12, color: manualV.completedCount === 18 ? 'var(--green-600)' : 'var(--gray-500)', fontWeight: manualV.completedCount === 18 ? 500 : 400 }}>
                    {manualV.completedCount} of 18 complete
                  </span>
                </div>

                {/* Header row */}
                <div style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', gap: 6, marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)', textAlign: 'center' }}>Hole</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)', textAlign: 'center' }}>Par (3/4/5)</span>
                  <span style={{ fontSize: 11, color: 'var(--gray-500)', textAlign: 'center' }}>Stroke index</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {manualHoles.map((hole, i) => {
                    const parVal = parseInt(hole.par)
                    const siVal = parseInt(hole.stroke_index)
                    const parOk = hole.par !== '' && VALID_PARS.includes(parVal)
                    const parInvalid = hole.par !== '' && !VALID_PARS.includes(parVal)
                    const siOk = hole.stroke_index !== '' && siVal >= 1 && siVal <= 18 && !siDuplicatesInManual.has(siVal)
                    const siInvalid = hole.stroke_index !== '' && (!siVal || siVal < 1 || siVal > 18 || siDuplicatesInManual.has(siVal))
                    const rowComplete = parOk && siOk

                    return (
                      <div key={i} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', gap: 6, alignItems: 'center' }}>
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: rowComplete ? 'var(--green-100)' : 'var(--gray-100)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: rowComplete ? 'var(--green-700)' : 'var(--gray-500)', margin: '0 auto' }}>
                          {hole.hole_number}
                        </div>
                        <input className="input" type="number" min="3" max="5" placeholder="Par" value={hole.par}
                          onChange={e => updateHole(i, 'par', e.target.value)}
                          style={{ textAlign: 'center', padding: '8px 6px', fontSize: 14, borderColor: parInvalid ? 'var(--red-500)' : parOk ? 'var(--green-400)' : undefined, background: parInvalid ? 'var(--red-100)' : undefined }} />
                        <input className="input" type="number" min="1" max="18" placeholder="SI" value={hole.stroke_index}
                          onChange={e => updateHole(i, 'stroke_index', e.target.value)}
                          style={{ textAlign: 'center', padding: '8px 6px', fontSize: 14, borderColor: siInvalid ? 'var(--red-500)' : siOk ? 'var(--green-400)' : undefined, background: siInvalid ? 'var(--red-100)' : undefined }} />
                      </div>
                    )
                  })}
                </div>

                {siDuplicatesInManual.size > 0 && (
                  <p style={{ fontSize: 12, color: 'var(--red-500)', marginTop: 8 }}>
                    Duplicate stroke indexes: {[...siDuplicatesInManual].sort((a, b) => a - b).join(', ')} — each value must be used exactly once
                  </p>
                )}
                {manualV.completedCount === 18 && manualV.siAllUnique && (
                  <p style={{ fontSize: 12, color: 'var(--green-600)', marginTop: 8, fontWeight: 500 }}>✓ All 18 holes valid</p>
                )}
              </div>

              {error && <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>}

              <button type="button" className="btn btn-primary" onClick={handleManualSave}
                disabled={!manualV.isValid || savingManual} style={{ width: '100%' }}>
                {savingManual ? 'Saving course…' : 'Save course and continue'}
              </button>
            </div>
          )}

          {/* ── Selected course confirmation ── */}
          {selectedCourse && !selectedCourse._pending && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--green-50)', border: '1px solid var(--green-200)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
              <div>
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--green-800)' }}>{selectedCourse.name}</p>
                <p style={{ fontSize: 12, color: 'var(--green-600)' }}>{selectedCourse.location}</p>
              </div>
              <button type="button" onClick={() => { setSelectedCourse(null); setSearchQuery(''); setManualName(''); setManualLocation(''); setManualHoles(makeEmptyHoles()); setMode('search') }}
                style={{ fontSize: 12, color: 'var(--gray-500)', background: 'none', border: 'none', cursor: 'pointer' }}>
                Change
              </button>
            </div>
          )}
        </div>

        {/* Round details */}
        {selectedCourse && !selectedCourse._pending && (
          <>
            <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label className="label">Round name</label>
                <input className="input" name="name" placeholder="e.g. Saturday Stableford" value={form.name} onChange={handleChange} required />
              </div>
              <div>
                <label className="label">Tee time <span style={{ fontWeight: 400, color: 'var(--gray-500)' }}>(optional)</span></label>
                <input className="input" type="datetime-local" name="tee_time" value={form.tee_time} onChange={handleChange} />
              </div>
            </div>

            <div className="card">
              <label className="label">Handicap allowance</label>
              <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>Players' playing handicap will be calculated as this percentage of their exact handicap.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {allowanceOptions.map(opt => (
                  <label key={opt.value} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 'var(--radius-md)', border: `1px solid ${parseInt(form.handicap_allowance) === opt.value ? 'var(--green-500)' : 'var(--gray-300)'}`, background: parseInt(form.handicap_allowance) === opt.value ? 'var(--green-50)' : 'white', cursor: 'pointer' }}>
                    <input type="radio" name="handicap_allowance" value={opt.value} checked={parseInt(form.handicap_allowance) === opt.value} onChange={handleChange} style={{ accentColor: 'var(--green-600)' }} />
                    <span style={{ fontSize: 14, fontWeight: parseInt(form.handicap_allowance) === opt.value ? 500 : 400 }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}

        {error && !mode === 'manual' && <p style={{ fontSize: 13, color: 'var(--red-500)' }}>{error}</p>}

        {selectedCourse && !selectedCourse._pending && (
          <button className="btn btn-primary" type="submit" disabled={loading || !form.name} style={{ width: '100%' }}>
            {loading ? 'Creating…' : 'Create round'}
          </button>
        )}
      </form>
    </div>
  )
}
