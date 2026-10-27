export class Input {
  constructor() {
    this.keys = Object.create(null)
    this.touch = { throttle: 0, brake: 0, steer: 0, handbrake: false }
    this._steerLeft = false
    this._steerRight = false
    this.onToggleCamera = null
    this.onPause = null
    this.onMute = null
    this.onRecover = null
    this._bound = false
  }

  bind() {
    if (this._bound) return
    this._bound = true
    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
  }

  unbind() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    this._bound = false
    this.keys = Object.create(null)
  }

  _onKeyDown = (e) => {
    if (e.repeat) {
      this.keys[e.code] = true
      return
    }
    this.keys[e.code] = true
    if (e.code === 'KeyC') this.onToggleCamera?.()
    if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.()
    if (e.code === 'KeyM') this.onMute?.()
    if (e.code === 'KeyR') this.onRecover?.()
  }

  _onKeyUp = (e) => {
    this.keys[e.code] = false
  }

  setTouchSteer(left, right) {
    this._steerLeft = left
    this._steerRight = right
  }

  /** Analog steer from the virtual stick, -1..1 (+1 = left). */
  setTouchSteerAnalog(v) {
    this.touch.steer = Math.max(-1, Math.min(1, v || 0))
  }

  getControls() {
    const k = this.keys
    let throttle = 0
    let brake = 0
    let steer = 0
    let handbrake = false

    if (k.KeyW || k.ArrowUp) throttle = 1
    if (k.KeyS || k.ArrowDown) brake = 1
    if (k.KeyA || k.ArrowLeft) steer += 1
    if (k.KeyD || k.ArrowRight) steer -= 1
    if (k.Space) handbrake = true

    throttle = Math.max(throttle, this.touch.throttle)
    brake = Math.max(brake, this.touch.brake)
    if (this._steerLeft) steer += 1
    if (this._steerRight) steer -= 1
    steer += this.touch.steer || 0
    if (this.touch.handbrake) handbrake = true

    steer = Math.max(-1, Math.min(1, steer))
    return { throttle, brake, steer, handbrake }
  }
}
