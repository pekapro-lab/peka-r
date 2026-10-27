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
    // Engine "roar": low sawtooth/square stack + sub-octave, firing-pulse amplitude modulation,
    // a touch of band-passed noise (intake/exhaust), soft-clip distortion and a resonant low-pass.
    const ctx = this.ctx
    const mk = (type, f, g) => {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f
      const gn = ctx.createGain(); gn.gain.value = g
      o.connect(gn); o.start()
      return { o, g: gn }
    }
    const mix = ctx.createGain(); mix.gain.value = 1
    const fund = mk('sawtooth', 40, 0.55)
    const sub = mk('square', 20, 0.35)
    const harm = mk('sawtooth', 80, 0.22); harm.o.detune.value = 9
    const third = mk('triangle', 120, 0.12)
    for (const v of [fund, sub, harm, third]) v.g.connect(mix)

    // Noise (rumble/air)
    const len = ctx.sampleRate * 2
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = buf.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) { last = last * 0.86 + (Math.random() * 2 - 1) * 0.14; d[i] = last * 3 }
    const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true
    const nbp = ctx.createBiquadFilter(); nbp.type = 'bandpass'; nbp.frequency.value = 160; nbp.Q.value = 0.9
    const ngain = ctx.createGain(); ngain.gain.value = 0.15
    noise.connect(nbp); nbp.connect(ngain); ngain.connect(mix); noise.start()

    // Firing pulses: amplitude modulation at half the fundamental
    const pulse = ctx.createGain(); pulse.gain.value = 0.7
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 20
    const lfoDepth = ctx.createGain(); lfoDepth.gain.value = 0.28
    lfo.connect(lfoDepth); lfoDepth.connect(pulse.gain); lfo.start()
    mix.connect(pulse)

    // Soft-clip distortion
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(1024)
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(x * 2.6) }
    shaper.curve = curve
    shaper.oversample = '2x'

    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'; filter.frequency.value = 380; filter.Q.value = 1.6
    const body = ctx.createBiquadFilter() // chesty low-mid resonance
    body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.1; body.gain.value = 6

    const gain = ctx.createGain(); gain.gain.value = 0.0001
    const master = ctx.createGain(); master.gain.value = 0.18

    pulse.connect(shaper); shaper.connect(filter); filter.connect(body); body.connect(gain)
    gain.connect(master); master.connect(ctx.destination)

    this._engine = { fund, sub, harm, third, nbp, ngain, lfo, lfoDepth, filter, gain, master }
    this._rpm = 900
  }

  /** Simulated rpm from speed with a 6-speed gearbox (sound only; physics is untouched). */
  _rpmFor(speedKmh, throttle) {
    const gears = [0, 32, 60, 90, 120, 150, 999]
    let g = 0
    while (g < gears.length - 2 && speedKmh > gears[g + 1]) g++
    const lo = gears[g], hi = Math.min(gears[g + 1], 175)
    const t = Math.max(0, Math.min(1, (speedKmh - lo) / (hi - lo)))
    const base = g === 0 ? 900 + t * 5200 : 3300 + t * 3000
    return Math.max(850, base + throttle * 400 * (speedKmh < 5 ? 2.5 : 1))
  }

  setDriving({ speedKmh, throttle, brake }) {
    if (!this._engine || this.muted) return
    const e = this._engine
    const t = this.ctx.currentTime
    const target = this._rpmFor(speedKmh, throttle)
    this._rpm += (target - this._rpm) * 0.25
    const f = this._rpm / 30 // 4-stroke 4-cyl firing frequency (≈28 Hz idle .. 220 Hz redline)
    e.fund.o.frequency.setTargetAtTime(f, t, 0.04)
    e.sub.o.frequency.setTargetAtTime(f / 2, t, 0.04)
    e.harm.o.frequency.setTargetAtTime(f * 2, t, 0.04)
    e.third.o.frequency.setTargetAtTime(f * 3, t, 0.04)
    e.lfo.frequency.setTargetAtTime(f / 2, t, 0.04)
    e.lfoDepth.gain.setTargetAtTime(0.18 + throttle * 0.17, t, 0.08)
    e.nbp.frequency.setTargetAtTime(f * 3.5, t, 0.08)
    e.ngain.gain.setTargetAtTime(0.06 + throttle * 0.16, t, 0.08)
    e.filter.frequency.setTargetAtTime(220 + f * 3.2 + throttle * 650, t, 0.08)
    const vol = 0.05 + Math.min(speedKmh / 180, 1) * 0.1 + throttle * 0.07 + brake * 0.01
    e.gain.gain.setTargetAtTime(vol, t, 0.06)
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
