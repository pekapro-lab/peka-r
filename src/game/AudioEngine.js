export class AudioEngine {
  constructor() {
    this.ctx = null
    this.muted = localStorage.getItem('peka-r-muted') === '1'
    this._started = false
    this._engine = null
  }

  async ensure() {
    if (this._started) return
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    this._buildEngine()
    this._started = true
    this._applyMute()
  }

  _buildEngine() {
    const ctx = this.ctx
    const osc1 = ctx.createOscillator()
    const osc2 = ctx.createOscillator()
    const gain = ctx.createGain()
    const filter = ctx.createBiquadFilter()
    const master = ctx.createGain()

    osc1.type = 'sawtooth'
    osc2.type = 'square'
    osc1.frequency.value = 55
    osc2.frequency.value = 110
    filter.type = 'lowpass'
    filter.frequency.value = 420
    filter.Q.value = 0.7
    gain.gain.value = 0.0001
    master.gain.value = 0.18

    osc1.connect(gain)
    osc2.connect(gain)
    gain.connect(filter)
    filter.connect(master)
    master.connect(ctx.destination)

    osc1.start()
    osc2.start()

    this._engine = { osc1, osc2, gain, filter, master }
  }

  setDriving({ speedKmh, throttle, brake }) {
    if (!this._engine || this.muted) return
    const t = this.ctx.currentTime
    const rpm = 55 + Math.min(speedKmh, 220) * 1.15 + throttle * 28
    this._engine.osc1.frequency.setTargetAtTime(rpm, t, 0.08)
    this._engine.osc2.frequency.setTargetAtTime(rpm * 1.98, t, 0.08)
    const vol = 0.02 + Math.min(speedKmh / 180, 1) * 0.12 + throttle * 0.06 + brake * 0.02
    this._engine.gain.gain.setTargetAtTime(vol, t, 0.05)
    this._engine.filter.frequency.setTargetAtTime(320 + throttle * 900 + speedKmh * 2, t, 0.1)
  }

  beep(freq = 660, dur = 0.12) {
    if (!this.ctx || this.muted) return
    const o = this.ctx.createOscillator()
    const g = this.ctx.createGain()
    o.type = 'triangle'
    o.frequency.value = freq
    g.gain.value = 0.12
    o.connect(g)
    g.connect(this.ctx.destination)
    const t = this.ctx.currentTime
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  toggleMute() {
    this.muted = !this.muted
    localStorage.setItem('peka-r-muted', this.muted ? '1' : '0')
    this._applyMute()
    return this.muted
  }

  _applyMute() {
    if (!this._engine) return
    this._engine.master.gain.setTargetAtTime(this.muted ? 0 : 0.18, this.ctx.currentTime, 0.05)
  }
}
