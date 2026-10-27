import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { Car } from './Car.js'
import { buildTrack } from './TrackBuilder.js'
import { getTrack } from './tracks/index.js'
import { Input } from './Input.js'
import { AudioEngine } from './AudioEngine.js'
import { Environment } from './Environment.js'
import { formatTime } from './format.js'


function bestKey(trackId) {
  return `peka-r-best-${trackId}`
}

export class Game {
  constructor(root, ui) {
    this.root = root
    this.ui = ui
    this.input = new Input()
    this.audio = new AudioEngine()
    this.timeOfDay = localStorage.getItem('peka-r-tod') === 'day' ? 'day' : 'night'
    this.state = 'menu' // menu | countdown | racing | paused | finished
    this.cameraMode = 'hood' // hood | chase
    this.track = null
    this.car = null
    this.world = null
    this.clock = new THREE.Clock(false)
    this.lap = 1
    this.totalLaps = 3
    this.lapStart = 0
    this.bestLap = null
    this.currentLapTime = 0
    this._progress = 0
    this._lastProgress = 0
    this._crossed = false
    this._raf = 0
    this._countdown = 3
    this._countAcc = 0

    this._setupRenderer()
    this._setupSceneBasics()
    this._bindUI()
  }

  _setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.domElement.className = 'game-canvas'
    this.root.appendChild(this.renderer.domElement)

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 600)
    window.addEventListener('resize', this._onResize)
  }

  _setupSceneBasics() {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x05070c)
    this.scene.fog = new THREE.FogExp2(0x05070c, 0.012)

    this.hemi = new THREE.HemisphereLight(0x6a7aaa, 0x0a0c10, 0.45)
    this.scene.add(this.hemi)
    this.sun = new THREE.DirectionalLight(0xffc8a0, 0.55)
    this.sun.position.set(-40, 60, 20)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near = 1
    this.sun.shadow.camera.far = 200
    this.sun.shadow.camera.left = -60
    this.sun.shadow.camera.right = 60
    this.sun.shadow.camera.top = 60
    this.sun.shadow.camera.bottom = -60
    this.scene.add(this.sun)
    this.scene.add(this.sun.target)

    this.ambient = new THREE.AmbientLight(0x203040, 0.35)
    this.scene.add(this.ambient)

    this.env = new Environment(this.scene)
    // Wider shadow camera so day shadows look good on track
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.camera.left = -90
    this.sun.shadow.camera.right = 90
    this.sun.shadow.camera.top = 90
    this.sun.shadow.camera.bottom = -90
    this.sun.shadow.bias = -0.0002
  }

  _bindUI() {
    this.input.onToggleCamera = () => {
      this.cameraMode = this.cameraMode === 'hood' ? 'chase' : 'hood'
      this.ui.setCameraLabel(this.cameraMode)
    }
    this.input.onPause = () => {
      if (this.state === 'racing') this.pause()
      else if (this.state === 'paused') this.resume()
    }
    this.input.onMute = () => {
      const muted = this.audio.toggleMute()
      this.ui.setMute(muted)
    }

    this.ui.onStartTrack = async (trackId) => {
      await this.audio.ensure()
      this.startTrack(trackId)
    }
    this.ui.onResume = () => this.resume()
    this.ui.onExitToMenu = () => this.exitToMenu()
    this.ui.onToggleCamera = () => this.input.onToggleCamera()
    this.ui.onToggleMute = () => this.input.onMute()
    this.ui.onPause = () => this.input.onPause()
    this.ui.onTimeOfDay = (mode) => {
      this.timeOfDay = mode === 'day' ? 'day' : 'night'
      localStorage.setItem('peka-r-tod', this.timeOfDay)
      this.ui.setTimeOfDay(this.timeOfDay)
    }
    this.ui.bindTouch(this.input)
    this.ui.setTimeOfDay(this.timeOfDay)
  }

  startTrack(trackId) {
    this.cleanupRace()
    const def = getTrack(trackId)
    this.world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0),
    })
    this.world.broadphase = new CANNON.SAPBroadphase(this.world)
    this.world.allowSleep = true
    this.world.defaultContactMaterial.friction = 0.3
    this.world.defaultContactMaterial.restitution = 0.01

    // Wheel-ground contact
    const groundMaterial = new CANNON.Material('ground')
    const wheelMaterial = new CANNON.Material('wheel')
    const contact = new CANNON.ContactMaterial(groundMaterial, wheelMaterial, {
      friction: 0.55,
      restitution: 0,
      contactEquationStiffness: 1000,
    })
    this.world.addContactMaterial(contact)

    const trackDef = { ...def, timeOfDay: this.timeOfDay }
    this._applyLighting(this.timeOfDay)
    this.track = buildTrack(this.world, this.scene, trackDef)
    this.car = new Car(this.world, this.scene, this.track.spawn)
    this.car.setTimeOfDay(this.timeOfDay)
    this.totalLaps = this.track.laps
    this.lap = 1
    this.bestLap = Number(localStorage.getItem(bestKey(def.id))) || null
    this.currentLapTime = 0
    this._progress = 0
    this._lastProgress = 0
    this._crossed = false

    this.ui.showHud(true)
    this.ui.showMenu(false)
    this.ui.updateHud({
      lap: this.lap,
      totalLaps: this.totalLaps,
      current: 0,
      best: this.bestLap,
      speed: 0,
    })
    this.ui.drawMinimap(this.track.path, null)

    this.input.bind()
    this.state = 'countdown'
    this._countdown = 3
    this._countStartedAt = performance.now()
    this._countShown = 3
    this.ui.showCountdown('3')
    this.audio.beep(520, 0.1)
    this.clock.start()
    if (!this._raf) this._loop()
  }

  _applyLighting(mode) {
    this.env?.apply(mode)
    if (mode === 'day') {
      this.scene.background = new THREE.Color(0x9ec8f0)
      this.scene.fog = new THREE.Fog(0xc8e0f5, 120, 420)
      this.hemi.color.set(0xf0f7ff)
      this.hemi.groundColor.set(0xc2a882)
      this.hemi.intensity = 0.95
      this.sun.intensity = 2.0
      this.sun.color.set(0xfff3d6)
      this.sun.position.set(70, 110, 45)
      this.sun.castShadow = true
      this.ambient.intensity = 0.55
      this.ambient.color.set(0xffffff)
      this.renderer.toneMappingExposure = 1.15
    } else {
      this.scene.background = new THREE.Color(0x03050a)
      this.scene.fog = new THREE.FogExp2(0x05070f, 0.011)
      this.hemi.color.set(0x4a5a88)
      this.hemi.groundColor.set(0x080a10)
      this.hemi.intensity = 0.22
      this.sun.intensity = 0.12
      this.sun.color.set(0x6688cc)
      this.sun.position.set(-40, 60, 20)
      this.sun.castShadow = false
      this.ambient.intensity = 0.2
      this.ambient.color.set(0x1a2238)
      this.renderer.toneMappingExposure = 1.0
    }
  }

  pause() {
    if (this.state !== 'racing') return
    this.state = 'paused'
    this.ui.showPause(true)
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = 'racing'
    this.ui.showPause(false)
    this.clock.start()
  }

  exitToMenu() {
    this.cleanupRace()
    this.state = 'menu'
    this.ui.showPause(false)
    this.ui.showCountdown('')
    this.ui.hideCountdown()
    this.ui.showHud(false)
    this.ui.showMenu(true)
    this.ui.refreshBestTimes()
    cancelAnimationFrame(this._raf)
    this._raf = 0
    // keep rendering empty-ish sky? just clear once
    this.renderer.render(this.scene, this.camera)
  }

  cleanupRace() {
    this.input.unbind()
    if (this.car) {
      this.car.dispose()
      this.car = null
    }
    if (this.track) {
      this.track.dispose()
      this.track = null
    }
    this.world = null
  }

  _loop = () => {
    this._raf = requestAnimationFrame(this._loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)

    if (this.state === 'countdown') {
      // keep car still; still step tiny physics for stability
      if (this.world) this.world.step(1 / 60, dt, 3)
      this.car?.update(dt, { throttle: 0, brake: 1, steer: 0, handbrake: true })
      this._updateCamera()
      const elapsed = (performance.now() - this._countStartedAt) / 1000
      // 0-1:3, 1-2:2, 2-3:1, 3-3.8:YA, then race
      let show
      if (elapsed < 1) show = 3
      else if (elapsed < 2) show = 2
      else if (elapsed < 3) show = 1
      else if (elapsed < 3.8) show = 0
      else show = -1
      if (show !== this._countShown) {
        this._countShown = show
        if (show > 0) {
          this.ui.showCountdown(String(show))
          this.audio.beep(520, 0.1)
        } else if (show === 0) {
          this.ui.showCountdown('¡YA!')
          this.audio.beep(880, 0.18)
        } else {
          this.ui.hideCountdown()
          this.state = 'racing'
          this.lapStart = performance.now()
        }
      }
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.state === 'paused' || this.state === 'menu') {
      this.renderer.render(this.scene, this.camera)
      return
    }

    if (this.state === 'racing' || this.state === 'finished') {
      if (this.state === 'racing') {
        const controls = this.input.getControls()
        if (this.world) this.world.step(1 / 60, dt, 3)
        this.car.update(dt, controls)
        this.audio.setDriving({
          speedKmh: this.car.speedKmh,
          throttle: controls.throttle,
          brake: controls.brake,
        })
        this._updateLaps()
        this.currentLapTime = (performance.now() - this.lapStart) / 1000
        this.ui.updateHud({
          lap: this.lap,
          totalLaps: this.totalLaps,
          current: this.currentLapTime,
          best: this.bestLap,
          speed: this.car.speedKmh,
        })
        this.ui.drawMinimap(this.track.path, this.car.getPosition())
      }
      this._updateCamera()
      this.renderer.render(this.scene, this.camera)
    }
  }

  _updateLaps() {
    const path = this.track.path
    const pos = this.car.getPosition()
    let bestI = 0
    let bestD = Infinity
    for (let i = 0; i < path.length; i++) {
      const dx = path[i].x - pos.x
      const dz = path[i].z - pos.z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        bestI = i
      }
    }
    this._progress = bestI / path.length
    // Detect crossing start: wrap from high progress to low while moving forward
    if (this._lastProgress > 0.82 && this._progress < 0.18) {
      const lapTime = (performance.now() - this.lapStart) / 1000
      if (lapTime > 8) {
        // ignore tiny accidental wraps
        if (!this.bestLap || lapTime < this.bestLap) {
          this.bestLap = lapTime
          localStorage.setItem(bestKey(this.track.id), String(lapTime))
        }
        if (this.lap >= this.totalLaps) {
          this.state = 'finished'
          this.ui.showCountdown('META')
          this.audio.beep(990, 0.25)
          setTimeout(() => {
            this.ui.hideCountdown()
            this.pause()
            this.ui.setPauseTitle('Carrera terminada')
          }, 1400)
        } else {
          this.lap += 1
          this.audio.beep(720, 0.12)
        }
        this.lapStart = performance.now()
      }
    }
    this._lastProgress = this._progress
  }

  _updateCamera() {
    if (!this.car) return
    const pos = this.car.getPosition()
    const q = this.car.getQuaternion()
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q)
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q)

    if (this.cameraMode === 'hood') {
      // Hood view: on the hood looking forward, hood/scanner visible at bottom
      const hoodPos = new THREE.Vector3(0, 0.55, 0.85).applyQuaternion(q).add(pos)
      const look = hoodPos.clone().add(forward.clone().multiplyScalar(18)).add(up.clone().multiplyScalar(0.2))
      this.camera.position.lerp(hoodPos, 0.35)
      this.camera.up.copy(up)
      this.camera.lookAt(look)
      this.camera.fov = 72
    } else {
      const back = forward.clone().multiplyScalar(-8).add(up.clone().multiplyScalar(3.2))
      const chasePos = new THREE.Vector3(pos.x, pos.y, pos.z).add(back)
      const look = new THREE.Vector3(pos.x, pos.y + 0.8, pos.z).add(forward.clone().multiplyScalar(6))
      this.camera.position.lerp(chasePos, 0.12)
      this.camera.up.set(0, 1, 0)
      this.camera.lookAt(look)
      this.camera.fov = 60
    }
    this.camera.updateProjectionMatrix()

    // Keep daylight shadows centered on the car
    if (this.timeOfDay === 'day' && this.car) {
      const p = this.car.getPosition()
      this.sun.target.position.set(p.x, 0, p.z)
      this.sun.position.set(p.x + 70, 110, p.z + 45)
      this.sun.target.updateMatrixWorld()
    }
  }

  _onResize = () => {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5))
    this.renderer.setSize(w, h)
  }
}

