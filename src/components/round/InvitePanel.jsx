import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

export default function InvitePanel({ joinCode }) {
  const canvasRef = useRef(null)
  const [copied, setCopied] = useState(false)
  const [showQR, setShowQR] = useState(false)

  const joinUrl = `${window.location.origin}/join/${joinCode}`

  useEffect(() => {
    if (showQR && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, joinUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#1a3a2a',
          light: '#ffffff',
        },
      })
    }
  }, [showQR, joinUrl])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      const el = document.createElement('textarea')
      el.value = joinUrl
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    }
  }

  async function handleShare() {
    if (navigator.share) {
      await navigator.share({
        title: 'Join my Saturday Golf round',
        text: `Join my round using code ${joinCode}`,
        url: joinUrl,
      })
    } else {
      handleCopy()
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Link row */}
      <div style={{
        background: 'rgba(255,255,255,0.12)',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
      }}>
        <span style={{
          fontSize: 12,
          color: 'rgba(255,255,255,0.7)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-mono)',
        }}>
          {joinUrl}
        </span>
        <button
          onClick={handleCopy}
          style={{
            fontSize: 12,
            padding: '4px 10px',
            borderRadius: 6,
            border: 'none',
            background: copied ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)',
            color: 'white',
            cursor: 'pointer',
            flexShrink: 0,
            fontWeight: 500,
            transition: 'background 0.15s',
          }}
        >
          {copied ? '✓ Copied' : 'Copy'}
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={handleShare}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s',
          }}
        >
          Share link
        </button>
        <button
          onClick={() => setShowQR(q => !q)}
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.25)',
            background: showQR ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
            color: 'white',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'var(--font-sans)',
            transition: 'background 0.15s',
          }}
        >
          {showQR ? 'Hide QR' : 'Show QR code'}
        </button>
      </div>

      {/* QR code */}
      {showQR && (
        <div style={{
          marginTop: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'white',
          borderRadius: 12,
          padding: '16px',
        }}>
          <canvas ref={canvasRef} style={{ borderRadius: 8 }} />
          <p style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 10, textAlign: 'center' }}>
            Scan to join · code <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--gray-700)' }}>{joinCode}</span>
          </p>
        </div>
      )}
    </div>
  )
}
