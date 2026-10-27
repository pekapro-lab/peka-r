export function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return '--:--.--'
  const m = Math.floor(sec / 60)
  const s = sec - m * 60
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`
}
