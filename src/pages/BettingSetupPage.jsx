import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

const FORMATS = [
  {
    value: 'overall_only',
    label: 'Overall only',
    description: 'One pot for the best overall Stableford score. Ties go to countback on the last 6, 3, then 1 hole.',
  },
  {
    value: 'front_back_overall',
    label: 'Front 9, Back 9 & Overall',
    description: 'Three pots — best front 9, best back 9, and best overall. Tied front or back pots roll into overall.',
  },
]

const PRESET_STAKES = [1, 2, 5, 10, 20, 50]

export default function BettingSetupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { roundId } = location.state ?? {}

  const [betting, setBetting] = useState(true)
  const [format, setFormat] = useState('overall_only')
  const [stakeInput, setStakeInput] = useState('')

  const stakePence = stakeInput !== '' ? Math.round(parseFloat(stakeInput) * 100) : 0
  const isValid = !betting || (stakePence > 0 && format)

  function handleContinue() {
    navigate(`/round/${roundId}/join`, {
      state: {
        stakePence: betting ? stakePence : 0,
        bettingFormat: betting ? format : 'none',
      }
    })
  }

  return (
    <div className="page" style={{ paddingTop: 24 }}>
      <button
        className="btn btn-ghost"
        onClick={() => navigate(-1)}
        style={{ marginBottom: 20, paddingLeft: 0 }}
      >
        ← Back
      </button>

      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4 }}>Betting</h1>
      <p style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 24 }}>
        Set up the stake and format for this round. Only you can see and change this.
      </p>

      {/* No betting toggle */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontSize: 15, fontWeight: 500 }}>Enable betting</p>
            <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>Turn off for a social round with no stakes</p>
          </div>
          <div
            onClick={() => setBetting(b => !b)}
            style={{
              width: 44, height: 26, borderRadius: 13,
              background: betting ? 'var(--green-600)' : 'var(--gray-300)',
              position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0,
            }}
          >
            <div style={{
              position: 'absolute', top: 3, left: betting ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%', background: 'white',
              transition: 'left 0.2s',
            }} />
          </div>
        </div>
      </div>

      {betting && (
        <>
          {/* Stake amount */}
          <div className="card" style={{ marginBottom: 16 }}>
            <label className="label" style={{ marginBottom: 10 }}>Stake per person</label>

            {/* Preset buttons */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
              {PRESET_STAKES.map(s => (
                <button
                  key={s}
                  onClick={() => setStakeInput(String(s))}
                  style={{
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: `1px solid ${parseFloat(stakeInput) === s ? 'var(--green-500)' : 'var(--gray-300)'}`,
                    background: parseFloat(stakeInput) === s ? 'var(--green-50)' : 'white',
                    color: parseFloat(stakeInput) === s ? 'var(--green-700)' : 'var(--gray-700)',
                    fontWeight: parseFloat(stakeInput) === s ? 600 : 400,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  £{s}
                </button>
              ))}
            </div>

            {/* Custom amount */}
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: 'var(--gray-500)', fontWeight: 500 }}>£</span>
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="Custom amount"
                value={stakeInput}
                onChange={e => setStakeInput(e.target.value)}
                style={{ paddingLeft: 28, fontFamily: 'var(--font-mono)', fontSize: 18 }}
              />
            </div>

            {stakePence > 0 && (
              <div style={{ marginTop: 12, background: 'var(--green-50)', border: '1px solid var(--green-100)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
                <p style={{ fontSize: 13, color: 'var(--green-700)' }}>
                  Stake: <span style={{ fontWeight: 600, fontFamily: 'var(--font-mono)' }}>£{(stakePence / 100).toFixed(2)}</span> per player
                </p>
              </div>
            )}
          </div>

          {/* Format selection */}
          <div className="card" style={{ marginBottom: 24 }}>
            <label className="label" style={{ marginBottom: 12 }}>Betting format</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {FORMATS.map(f => (
                <label
                  key={f.value}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 14px', borderRadius: 'var(--radius-md)',
                    border: `1px solid ${format === f.value ? 'var(--green-500)' : 'var(--gray-300)'}`,
                    background: format === f.value ? 'var(--green-50)' : 'white',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="format"
                    value={f.value}
                    checked={format === f.value}
                    onChange={() => setFormat(f.value)}
                    style={{ accentColor: 'var(--green-600)', marginTop: 2, flexShrink: 0 }}
                  />
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: format === f.value ? 'var(--green-800)' : 'var(--gray-900)' }}>{f.label}</p>
                    <p style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.4 }}>{f.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Pot summary */}
          {stakePence > 0 && (
            <div className="card" style={{ background: 'var(--green-700)', border: 'none', color: 'white', marginBottom: 24 }}>
              <p style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Pot summary (per player)</p>
              {format === 'overall_only' && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14 }}>Overall pot</span>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>£{(stakePence / 100).toFixed(2)}</span>
                </div>
              )}
              {format === 'front_back_overall' && (
                <>
                  {[
                    { label: 'Front 9 pot', fraction: 1/3 },
                    { label: 'Back 9 pot', fraction: 1/3 },
                    { label: 'Overall pot', fraction: 1/3 },
                  ].map(({ label, fraction }) => (
                    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontSize: 14, opacity: 0.9 }}>{label}</span>
                      <span style={{ fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>£{(stakePence * fraction / 100).toFixed(2)}</span>
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.2)', marginTop: 6, paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Total stake</span>
                    <span style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>£{(stakePence / 100).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {!betting && (
        <div className="card" style={{ background: 'var(--gray-50)', marginBottom: 24, textAlign: 'center', padding: '20px' }}>
          <p style={{ fontSize: 15, color: 'var(--gray-500)' }}>No betting this round — social only</p>
        </div>
      )}

      <button
        className="btn btn-primary"
        onClick={handleContinue}
        disabled={!isValid}
        style={{ width: '100%' }}
      >
        Continue →
      </button>
    </div>
  )
}
