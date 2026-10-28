import { TRACKS } from './tracks/index.js'
import { formatTime } from './format.js'

export class UI {
  constructor(root) {
    this.root = root
    this.onStartTrack = null
    this.onResume = null
    this.onExitToMenu = null
    this.onToggleCamera = null
    this.onToggleMute = null
    this.onPause = null
    this.onRecover = null
    this.onRestartRace = null
    this.onTimeOfDay = null
    this.timeOfDay = 'night'

    this.el = document.createElement('div')
    this.el.className = 'overlay'
    this.el.innerHTML = `
      <div class="menu" id="menu">
        <div class="menu-card panel interactive">
          <div class="logo">PEKA-R</div>
          <div class="tagline">Muscle car · circuitos de carreras</div>
          <div class="track-list" id="track-list"></div>
          <div class="tod-toggle" id="tod-toggle" role="group" aria-label="Momento del día">
            <button class="tod-btn" id="btn-day" type="button" data-tod="day">Día</button>
            <button class="tod-btn" id="btn-night" type="button" data-tod="night">Noche</button>
          </div>
          <div class="menu-actions">
            <button class="btn" id="btn-mute-menu" type="button">Sonido</button>
          </div>
          <p class="help">
            Teclado: WASD / flechas · S/↓ freno o marcha atrás (parado) · Espacio freno de mano · C cámara · R recolocar · P/Esc pausa<br/>
            Móvil: ▲ acelera · ▼ frena / marcha atrás · ↺ recoloca · ⟳ reinicia
          </p>
        </div>
      </div>

      <div class="hud hidden" id="hud">
        <div class="hud-top">
          <div class="hud-pill">
            <div class="label">Vuelta</div>
            <div class="value" id="hud-lap">1/3</div>
          </div>
          <div class="hud-pill">
            <div class="label">Actual</div>
            <div class="value" id="hud-current">00:00.00</div>
          </div>
          <div class="hud-pill">
            <div class="label">Mejor</div>
            <div class="value" id="hud-best">--:--.--</div>
          </div>
        </div>
        <div class="hud-tools">
          <button class="icon-btn" id="btn-cam" type="button" title="Cámara">C</button>
          <button class="icon-btn" id="btn-mute" type="button" title="Silencio">♪</button>
          <button class="icon-btn" id="btn-recover" type="button" title="Recolocar (R)">↺</button>
          <button class="icon-btn hud-restart" id="btn-restart-hud" type="button" title="Reiniciar carrera">⟳</button>
          <button class="icon-btn" id="btn-pause" type="button" title="Pausa">Ⅱ</button>
        </div>
        <div class="speedo">
          <div class="gear" id="hud-gear">D</div>
          <div class="kmh" id="hud-speed">0</div>
          <div class="unit">KM/H</div>
        </div>
        <div class="minimap"><canvas id="minimap" width="120" height="120"></canvas></div>
      </div>

      <div class="countdown hidden" id="countdown"></div>

      <div class="pause-menu hidden" id="pause">
        <div class="pause-card panel interactive">
          <h2 id="pause-title">Pausa</h2>
          <p class="pause-results hidden" id="pause-results"></p>
          <div class="menu-actions">
            <button class="btn primary" id="btn-resume" type="button">Continuar</button>
            <button class="btn" id="btn-restart" type="button">Reiniciar carrera</button>
            <button class="btn" id="btn-recover-pause" type="button">Recolocar</button>
            <button class="btn" id="btn-menu" type="button">Menú principal</button>
          </div>
        </div>
      </div>

      <div class="touch hidden" id="touch">
        <div class="stick" id="stick" aria-label="Dirección"><div class="stick-knob" id="stick-knob"></div></div>
        <button class="touch-btn accel" data-act="throttle" type="button">▲</button>
        <button class="touch-btn brake" data-act="brake" type="button">▼</button>
        <button class="touch-btn handbrake" data-act="handbrake" type="button">FRENO DE MANO</button>
      </div>
    `
    root.appendChild(this.el)

    this.menu = this.el.querySelector('#menu')
    this.hud = this.el.querySelector('#hud')
    this.countdown = this.el.querySelector('#countdown')
    this.pause = this.el.querySelector('#pause')
    this.touch = this.el.querySelector('#touch')
    this.minimapCtx = this.el.querySelector('#minimap').getContext('2d')

    this.el.querySelector('#btn-resume').addEventListener('click', () => {
      this.setPauseTitle('Pausa')
      this.onResume?.()
    })
    this.el.querySelector('#btn-menu').addEventListener('click', () => {
      this.setPauseTitle('Pausa')
      this.onExitToMenu?.()
    })
    this.el.querySelector('#btn-cam').addEventListener('click', () => this.onToggleCamera?.())
    this.el.querySelector('#btn-mute').addEventListener('click', () => this.onToggleMute?.())
    this.el.querySelector('#btn-mute-menu').addEventListener('click', () => this.onToggleMute?.())
    this.el.querySelector('#btn-pause').addEventListener('click', () => this.onPause?.())
    this.el.querySelector('#btn-recover').addEventListener('click', () => this.onRecover?.())
    this.el.querySelector('#btn-recover-pause').addEventListener('click', () => {
      this.onRecover?.()
      this.setPauseTitle('Pausa')
      this.onResume?.()
    })
    this.el.querySelector('#btn-restart').addEventListener('click', () => this.onRestartRace?.())
    this.el.querySelector('#btn-restart-hud').addEventListener('click', () => this.onRestartRace?.())
    this.el.querySelector('#btn-day').addEventListener('click', () => this.onTimeOfDay?.('day'))
    this.el.querySelector('#btn-night').addEventListener('click', () => this.onTimeOfDay?.('night'))

    this.refreshBestTimes()
    this._detectTouch()
  }

  setTimeOfDay(mode) {
    this.timeOfDay = mode === 'day' ? 'day' : 'night'
    this.el.querySelector('#btn-day').classList.toggle('active', this.timeOfDay === 'day')
    this.el.querySelector('#btn-night').classList.toggle('active', this.timeOfDay === 'night')
  }

  _detectTouch() {
    const coarse = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window
    this._touchDevice = coarse
    if (coarse) document.body.classList.add("touch-device")
  }

  refreshBestTimes() {
    const list = this.el.querySelector('#track-list')
    list.innerHTML = ''
    for (const t of TRACKS) {
      const best = Number(localStorage.getItem(`peka-r-best-${t.id}`))
      const btn = document.createElement('button')
      btn.className = 'track-btn'
      btn.type = 'button'
      btn.innerHTML = `
        <span class="name">${t.name}</span>
        <span class="meta">${t.description} · ${t.laps} vueltas</span>
        <span class="best">Mejor: ${best ? formatTime(best) : 'sin registro'}</span>
      `
      btn.addEventListener('click', () => this.onStartTrack?.(t.id))
      list.appendChild(btn)
    }
  }

  showMenu(v) {
    this.menu.classList.toggle('hidden', !v)
  }

  showHud(v) {
    this.hud.classList.toggle('hidden', !v)
    if (this._touchDevice) this.touch.classList.toggle('hidden', !v)
    else this.touch.classList.add('hidden')
  }

  showPause(v) {
    if (v) this._setFinishMode(false)
    this.pause.classList.toggle('hidden', !v)
  }

  /** Finish panel: results + Repetir / Menú principal (no Continuar / Recolocar). */
  showFinish({ total, best }) {
    this._setFinishMode(true)
    this.setPauseTitle('Carrera terminada')
    const r = this.el.querySelector('#pause-results')
    r.textContent = `Total: ${formatTime(total)} · Mejor vuelta: ${best ? formatTime(best) : '—'}`
    this.pause.classList.remove('hidden')
  }

  _setFinishMode(on) {
    const q = (s) => this.el.querySelector(s)
    q('#btn-resume').classList.toggle('hidden', on)
    q('#btn-recover-pause').classList.toggle('hidden', on)
    q('#pause-results').classList.toggle('hidden', !on)
    q('#btn-restart').textContent = on ? 'Repetir carrera' : 'Reiniciar carrera'
    q('#btn-restart').classList.toggle('primary', on)
  }

  setPauseTitle(text) {
    this.el.querySelector('#pause-title').textContent = text
  }

  showCountdown(text) {
    this.countdown.classList.remove('hidden')
    this.countdown.textContent = text
  }

  hideCountdown() {
    this.countdown.classList.add('hidden')
    this.countdown.textContent = ''
  }

  updateHud({ lap, totalLaps, current, best, speed, gear }) {
    this.el.querySelector('#hud-lap').textContent = `${lap}/${totalLaps}`
    this.el.querySelector('#hud-current').textContent = formatTime(current)
    this.el.querySelector('#hud-best').textContent = best ? formatTime(best) : '--:--.--'
    this.el.querySelector('#hud-speed').textContent = String(Math.round(speed || 0))
    const g = this.el.querySelector('#hud-gear')
    if (g) {
      g.textContent = gear === 'R' ? 'R' : 'D'
      g.classList.toggle('reverse', gear === 'R')
    }
  }

  setCameraLabel(mode) {
    this.el.querySelector('#btn-cam').textContent = mode === 'hood' ? 'C' : '↕'
  }

  setMute(muted) {
    const label = muted ? 'Silenciado' : 'Sonido'
    this.el.querySelector('#btn-mute').textContent = muted ? 'Mute' : '♪'
    this.el.querySelector('#btn-mute-menu').textContent = label
  }

  drawMinimap(path, carPos) {
    const ctx = this.minimapCtx
    const w = 120
    const h = 120
    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.fillRect(0, 0, w, h)
    if (!path || path.length < 2) return

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
    for (const p of path) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x)
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z)
    }
    const pad = 10
    const sx = (w - pad * 2) / Math.max(1, maxX - minX)
    const sz = (h - pad * 2) / Math.max(1, maxZ - minZ)
    const s = Math.min(sx, sz)

    const map = (x, z) => ({
      x: pad + (x - minX) * s + ((w - pad * 2) - (maxX - minX) * s) / 2,
      y: pad + (z - minZ) * s + ((h - pad * 2) - (maxZ - minZ) * s) / 2,
    })

    ctx.strokeStyle = 'rgba(255,255,255,0.45)'
    ctx.lineWidth = 3
    ctx.beginPath()
    for (let i = 0; i <= path.length; i++) {
      const p = path[i % path.length]
      const m = map(p.x, p.z)
      if (i === 0) ctx.moveTo(m.x, m.y)
      else ctx.lineTo(m.x, m.y)
    }
    ctx.stroke()

    if (carPos) {
      const m = map(carPos.x, carPos.z)
      ctx.fillStyle = '#ff2a2a'
      ctx.beginPath()
      ctx.arc(m.x, m.y, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  bindTouch(input) {
    const set = (act, on) => {
      if (act === 'throttle') input.touch.throttle = on ? 1 : 0
      if (act === 'brake') input.touch.brake = on ? 1 : 0
      if (act === 'handbrake') input.touch.handbrake = on
    }

    for (const btn of this.touch.querySelectorAll('.touch-btn')) {
      const act = btn.dataset.act
      const down = (e) => {
        e.preventDefault()
        btn.classList.add('active')
        set(act, true)
      }
      const up = (e) => {
        e.preventDefault()
        btn.classList.remove('active')
        set(act, false)
      }
      btn.addEventListener('pointerdown', down)
      btn.addEventListener('pointerup', up)
      btn.addEventListener('pointercancel', up)
      btn.addEventListener('pointerleave', up)
    }

    // Analog steering stick (left thumb): horizontal displacement → proportional steer.
    const stick = this.touch.querySelector('#stick')
    const knob = this.touch.querySelector('#stick-knob')
    let pid = null
    const move = (e) => {
      const r = stick.getBoundingClientRect()
      const radius = r.width / 2
      let dx = e.clientX - (r.left + radius)
      dx = Math.max(-radius, Math.min(radius, dx))
      knob.style.transform = `translate(${dx}px, 0)`
      let v = dx / radius
      const dead = 0.08
      v = Math.abs(v) < dead ? 0 : Math.sign(v) * ((Math.abs(v) - dead) / (1 - dead))
      input.setTouchSteerAnalog(-v) // steer +1 = left
    }
    const end = (e) => {
      if (e.pointerId !== pid) return
      pid = null
      stick.classList.remove('active')
      knob.style.transform = 'translate(0, 0)'
      input.setTouchSteerAnalog(0)
    }
    stick.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      pid = e.pointerId
      stick.setPointerCapture?.(e.pointerId)
      stick.classList.add('active')
      move(e)
    })
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === pid) { e.preventDefault(); move(e) } })
    stick.addEventListener('pointerup', end)
    stick.addEventListener('pointercancel', end)
  }
}
