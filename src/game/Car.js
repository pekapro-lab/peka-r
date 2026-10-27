import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = w; c.height = h
  draw(c.getContext('2d'), w, h)
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.anisotropy = 4
  return t
}
let _carTex = null
/** Procedural textures (canvas, no assets): metallic-flake paint with a red pinstripe, carbon weave, roughness noise. */
function carTextures() {
  if (_carTex) return _carTex
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const paint = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0b0c10'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 2600; i++) {
      const v = 20 + rnd() * 50
      g.fillStyle = `rgba(${v},${v + 4},${v + 12},${0.25 + rnd() * 0.4})`
      g.fillRect(rnd() * w, rnd() * h, 1, 1)
    }
    g.fillStyle = '#b3121b'; g.fillRect(0, h * 0.47, w, h * 0.03)
    g.fillStyle = '#d8d8d8'; g.fillRect(0, h * 0.52, w, h * 0.008)
  })
  paint.colorSpace = THREE.SRGBColorSpace
  const carbon = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#121214'; g.fillRect(0, 0, w, h)
    for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 8) {
      const odd = ((x + y) / 8) % 2
      const grd = odd ? g.createLinearGradient(x, y, x + 8, y) : g.createLinearGradient(x, y, x, y + 8)
      grd.addColorStop(0, '#1c1c20'); grd.addColorStop(0.5, '#2e2e34'); grd.addColorStop(1, '#16161a')
      g.fillStyle = grd; g.fillRect(x, y, 8, 8)
    }
  }, 4)
  carbon.colorSpace = THREE.SRGBColorSpace
  const rough = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#5a5a5a'; g.fillRect(0, 0, w, h)
    for (let i = 0; i < 1800; i++) { const v = 60 + rnd() * 90; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * w, rnd() * h, 2, 2) }
  }, 2)
  const tread = canvasTex(64, 256, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h)
    g.strokeStyle = '#050505'; g.lineWidth = 5
    for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w / 2, y + 8); g.lineTo(w, y); g.stroke() }
  })
  tread.colorSpace = THREE.SRGBColorSpace
  const rim = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#0d0d0f'; g.fillRect(0, 0, w, h)
    g.translate(w / 2, h / 2)
    g.fillStyle = '#9aa0aa'; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.fill()
    g.fillStyle = '#1a1b1f'
    for (let k = 0; k < 5; k++) { g.rotate((Math.PI * 2) / 5); g.beginPath(); g.moveTo(10, -6); g.lineTo(46, -16); g.lineTo(46, 16); g.lineTo(10, 6); g.fill() }
    g.fillStyle = '#c8ccd4'; g.beginPath(); g.arc(0, 0, 9, 0, Math.PI * 2); g.fill()
    g.strokeStyle = '#d0d4dc'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 50, 0, Math.PI * 2); g.stroke()
  })
  rim.colorSpace = THREE.SRGBColorSpace
  _carTex = { paint, carbon, rough, tread, rim }
  return _carTex
}
/** Lower the front of a geometry linearly along z (wedge nose). */
function wedge(geo, len, drop) {
  const p = geo.attributes.position
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), y = p.getY(i)
    if (y > 0) p.setY(i, y - Math.max(0, z / (len / 2)) * drop)
  }
  geo.computeVertexNormals()
}
/** Narrow the top of a geometry (rounded canopy). */
function taperTop(geo, k) {
  const p = geo.attributes.position
  geo.computeBoundingBox()
  const { min, max } = geo.boundingBox
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - min.y) / (max.y - min.y)
    const s = 1 - (1 - k) * t
    p.setX(i, p.getX(i) * s)
    p.setZ(i, p.getZ(i) * (1 - (1 - k) * 0.6 * t))
  }
  geo.computeVertexNormals()
}
/** Tyre with tread texture + textured 5-spoke rim (visual only). */
function buildWheel(side) {
  const t = carTextures()
  const g = new THREE.Group()
  const tyreGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 24, 1, true)
  tyreGeo.rotateZ(Math.PI / 2)
  const tyre = new THREE.Mesh(tyreGeo, new THREE.MeshStandardMaterial({ map: t.tread, roughness: 0.9, metalness: 0, side: THREE.DoubleSide }))
  tyre.castShadow = true
  g.add(tyre)
  const sideGeo = new THREE.TorusGeometry(0.3, 0.08, 8, 24)
  for (const sx of [-0.12, 0.12]) {
    const wall = new THREE.Mesh(sideGeo, new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }))
    wall.rotation.y = Math.PI / 2
    wall.position.x = sx
    g.add(wall)
  }
  const rimMat = new THREE.MeshStandardMaterial({ map: t.rim, metalness: 0.85, roughness: 0.3 })
  for (const sx of [-0.141, 0.141]) {
    const rim = new THREE.Mesh(new THREE.CircleGeometry(0.29, 24), rimMat)
    rim.rotation.y = sx > 0 ? Math.PI / 2 : -Math.PI / 2
    rim.position.x = sx
    g.add(rim)
  }
  void side
  return g
}

// Slightly smaller than the visual mesh so the chassis does not dig into barriers.
const chassisW = 1.85
const chassisH = 0.42
const chassisL = 4.15

const GROUP_GROUND = 1
const GROUP_BARRIER = 2
const GROUP_CHASSIS = 4

export class Car {
  constructor(world, scene, spawn) {
    this.world = world
    this.scene = scene
    this.scannerPhase = 0
    this.speedKmh = 0
    this._night = true
    this._spawn = { ...spawn }

    const mass = 980
    // Flat box kept above the ground so wheel rays own the ground contact.
    // Physics box sits high so it does NOT rest on the ground during normal driving
    // (that used to sink the car to y≈0.09 and kill wheel rays). It only acts as a
    // safety net if the car falls through with no wheel contact.
    // Thin high box: only touches the ground plane after a deep fall (body.y ≲ 0.2).
    // Normal ride height (~0.65) keeps the box well clear so wheel rays own traction.
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisW / 2, 0.16, chassisL / 2))
    this.chassisBody = new CANNON.Body({ mass })
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.22, 0))
    this.chassisBody.position.set(spawn.x, spawn.y + 0.75, spawn.z)
    this.chassisBody.quaternion.setFromEuler(0, spawn.yaw || 0, 0)
    this.chassisBody.angularDamping = 0.62
    this.chassisBody.linearDamping = 0.06
    this.chassisBody.allowSleep = false
    this.chassisBody.collisionFilterGroup = GROUP_CHASSIS
    this.chassisBody.collisionFilterMask = GROUP_GROUND | GROUP_BARRIER
    // Soft CCD-ish: cannon-es uses these when available
    this.chassisBody.ccdSpeedThreshold = 4
    this.chassisBody.ccdIterations = 4
    world.addBody(this.chassisBody)

    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,
      indexUpAxis: 1,
      indexForwardAxis: 2,
    })

    const wheelOptions = {
      radius: 0.38,
      directionLocal: new CANNON.Vec3(0, -1, 0),
      suspensionStiffness: 42,
      suspensionRestLength: 0.32,
      frictionSlip: 2.6,
      dampingRelaxation: 2.5,
      dampingCompression: 3.8,
      maxSuspensionForce: 80000,
      rollInfluence: 0.1,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.35,
      customSlidingRotationalSpeed: -28,
      useCustomSlidingRotationalSpeed: true,
      // Wheel rays only hit the ground plane — never barriers (prevents sudden stop).
      collisionFilterGroup: GROUP_CHASSIS,
      collisionFilterMask: GROUP_GROUND,
    }

    const halfW = 0.82
    const positions = [
      new CANNON.Vec3(halfW, 0.05, 1.35),
      new CANNON.Vec3(-halfW, 0.05, 1.35),
      new CANNON.Vec3(halfW, 0.05, -1.35),
      new CANNON.Vec3(-halfW, 0.05, -1.35),
    ]

    for (let i = 0; i < 4; i++) {
      const opts = { ...wheelOptions, chassisConnectionPointLocal: positions[i] }
      if (i < 2) {
        opts.frictionSlip = 2.9
      } else {
        opts.frictionSlip = 2.4
      }
      this.vehicle.addWheel(opts)
    }
    this.vehicle.addToWorld(world)

    // cannon-es RaycastVehicle.rayTest ignores wheel filter masks — force ground-only hits
    // so barriers never become "instant brakes" when a wheel ray clips a wall.
    const vehicle = this.vehicle
    vehicle.castRay = function castRayGroundOnly(wheel) {
      this.updateWheelTransformWorld(wheel)
      const chassisBody = this.chassisBody
      let depth = -1
      const raylen = wheel.suspensionRestLength + wheel.radius + 1.2
      const rayvector = new CANNON.Vec3()
      wheel.directionWorld.scale(raylen, rayvector)
      const source = wheel.chassisConnectionPointWorld
      const target = new CANNON.Vec3()
      source.vadd(rayvector, target)
      const raycastResult = wheel.raycastResult
      raycastResult.reset()
      const oldState = chassisBody.collisionResponse
      chassisBody.collisionResponse = false
      this.world.raycastClosest(source, target, {
        skipBackfaces: false,
        collisionFilterGroup: GROUP_CHASSIS,
        collisionFilterMask: GROUP_GROUND,
      }, raycastResult)
      chassisBody.collisionResponse = oldState
      wheel.raycastResult.groundObject = 0
      if (raycastResult.body) {
        depth = raycastResult.distance
        wheel.raycastResult.hitNormalWorld = raycastResult.hitNormalWorld
        wheel.isInContact = true
        const hitDistance = raycastResult.distance
        wheel.suspensionLength = hitDistance - wheel.radius
        const minSuspensionLength = wheel.suspensionRestLength - wheel.maxSuspensionTravel
        const maxSuspensionLength = wheel.suspensionRestLength + wheel.maxSuspensionTravel
        if (wheel.suspensionLength < minSuspensionLength) wheel.suspensionLength = minSuspensionLength
        if (wheel.suspensionLength > maxSuspensionLength) {
          wheel.suspensionLength = maxSuspensionLength
          // Do NOT reset raycastResult — clearing body/normal kills traction permanently
        }
        const denominator = wheel.raycastResult.hitNormalWorld.dot(wheel.directionWorld)
        const chassis_velocity_at_contactPoint = new CANNON.Vec3()
        chassisBody.getVelocityAtWorldPoint(wheel.raycastResult.hitPointWorld, chassis_velocity_at_contactPoint)
        const projVel = wheel.raycastResult.hitNormalWorld.dot(chassis_velocity_at_contactPoint)
        if (denominator >= -0.1) {
          wheel.suspensionRelativeVelocity = 0
          wheel.clippedInvContactDotSuspension = 1 / 0.1
        } else {
          const inv = -1 / denominator
          wheel.suspensionRelativeVelocity = projVel * inv
          wheel.clippedInvContactDotSuspension = inv
        }
      } else {
        // CRITICAL: must clear contact — stale isInContact=true made soft-catch
        // and stuck detection think the car still had traction while it fell.
        wheel.isInContact = false
        wheel.suspensionLength = wheel.suspensionRestLength
        wheel.suspensionRelativeVelocity = 0.0
        wheel.directionWorld.scale(-1, wheel.raycastResult.hitNormalWorld)
        wheel.clippedInvContactDotSuspension = 1.0
      }
      return depth
    }

    this.mesh = this._buildMesh()
    scene.add(this.mesh)

    this.wheelMeshes = []
    for (let i = 0; i < 4; i++) {
      const m = buildWheel(i % 2 === 0 ? 1 : -1)
      scene.add(m)
      this.wheelMeshes.push(m)
    }

    this.maxSteer = 0.55
    this.maxForce = 3600
    this.brakeForce = 52
    this._steerCurrent = 0
    this.gear = 'D'
    this.signedSpeedKmh = 0
  }

  _buildMesh() {
    // Visual only: rounded body + procedural canvas textures. Physics box is unchanged.
    const root = new THREE.Group()
    const visW = 2.05
    const visL = 4.55
    const tex = carTextures()

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex.paint,
      roughnessMap: tex.rough,
      metalness: 0.8,
      roughness: 0.35,
    })
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.6, metalness: 0.3, map: tex.carbon })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2534,
      metalness: 0.9,
      roughness: 0.08,
      transparent: true,
      opacity: 0.72,
    })
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xb8bcc4, metalness: 1, roughness: 0.18 })

    // Lower body: rounded slab with a gentle wedge (nose lower than tail)
    const lowerGeo = new RoundedBoxGeometry(visW, 0.5, visL, 4, 0.2)
    wedge(lowerGeo, visL, 0.08)
    const body = new THREE.Mesh(lowerGeo, bodyMat)
    body.position.y = 0.05
    body.castShadow = true
    root.add(body)

    // Hood bulge
    const hood = new THREE.Mesh(new RoundedBoxGeometry(visW * 0.86, 0.16, 1.7, 3, 0.07), bodyMat)
    hood.position.set(0, 0.28, 1.3)
    hood.rotation.x = 0.04
    hood.castShadow = true
    root.add(hood)
    this.hoodMesh = hood

    // Wheel-arch flares
    for (const x of [-1, 1]) for (const z of [1.38, -1.38]) {
      const flare = new THREE.Mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat)
      flare.scale.set(0.42, 0.62, 1.05)
      flare.position.set(x * (visW / 2 - 0.08), 0.1, z)
      flare.castShadow = true
      root.add(flare)
    }

    // Cabin: rounded canopy, tapered top
    const cabGeo = new RoundedBoxGeometry(1.72, 0.56, 1.9, 4, 0.24)
    taperTop(cabGeo, 0.82)
    const cabin = new THREE.Mesh(cabGeo, bodyMat)
    cabin.position.set(0, 0.52, -0.25)
    cabin.castShadow = true
    root.add(cabin)

    const windshield = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.5, 0.06, 2, 0.03), glassMat)
    windshield.position.set(0, 0.6, 0.68)
    windshield.rotation.x = -0.62
    root.add(windshield)
    const rearGlass = new THREE.Mesh(new RoundedBoxGeometry(1.4, 0.42, 0.06, 2, 0.03), glassMat)
    rearGlass.position.set(0, 0.6, -1.2)
    rearGlass.rotation.x = 0.55
    root.add(rearGlass)
    for (const x of [-0.87, 0.87]) {
      const side = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.34, 1.3, 2, 0.02), glassMat)
      side.position.set(x * 0.98, 0.6, -0.25)
      root.add(side)
    }

    for (const x of [-1.05, 1.05]) {
      const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.12, 0.26, 2, 0.05), chromeMat)
      mirror.position.set(x, 0.46, 0.55)
      root.add(mirror)
    }

    // Front & rear bumpers (carbon), side skirts, rear spoiler
    const bumper = new THREE.Mesh(new RoundedBoxGeometry(visW * 0.98, 0.22, 0.32, 3, 0.1), trimMat)
    bumper.position.set(0, -0.06, 2.18)
    root.add(bumper)
    const rearB = new THREE.Mesh(new RoundedBoxGeometry(visW * 0.98, 0.24, 0.3, 3, 0.1), trimMat)
    rearB.position.set(0, -0.04, -2.2)
    root.add(rearB)
    for (const x of [-1, 1]) {
      const skirt = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.12, 2.0, 2, 0.04), trimMat)
      skirt.position.set(x * (visW / 2 + 0.01), -0.17, 0)
      root.add(skirt)
    }
    const spoiler = new THREE.Mesh(new RoundedBoxGeometry(1.8, 0.06, 0.38, 2, 0.03), trimMat)
    spoiler.position.set(0, 0.62, -2.05)
    root.add(spoiler)
    for (const x of [-0.7, 0.7]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.32, 0.12), trimMat)
      st.position.set(x, 0.44, -2.05)
      root.add(st)
    }

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cc,
      emissive: 0xffe9a8,
      emissiveIntensity: 1.4,
    })
    this.headLightMeshes = []
    for (const x of [-0.68, 0.68]) {
      const hl = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.3, 4, 10), lightMat.clone())
      hl.rotation.z = Math.PI / 2
      hl.position.set(x, 0.14, 2.27)
      root.add(hl)
      this.headLightMeshes.push(hl)
    }

    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xaa0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.6,
    })
    for (const x of [-0.72, 0.72]) {
      const tl = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.36, 4, 10), tailMat)
      tl.rotation.z = Math.PI / 2
      tl.position.set(x, 0.2, -2.3)
      root.add(tl)
    }

    this.scannerGroup = new THREE.Group()
    this.scannerGroup.position.set(0, 0.28, 2.22)
    const barGeo = new THREE.BoxGeometry(0.14, 0.08, 0.06)
    this.scannerLeds = []
    for (let i = 0; i < 11; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x220000,
        emissive: 0xff0000,
        emissiveIntensity: 0.05,
      })
      const led = new THREE.Mesh(barGeo, mat)
      led.position.x = (i - 5) * 0.16
      this.scannerGroup.add(led)
      this.scannerLeds.push(led)
    }
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 }),
    )
    housing.position.z = -0.02
    this.scannerGroup.add(housing)
    root.add(this.scannerGroup)

    this.headLightL = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 4.5, 0.5, 1)
    this.headLightR = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 4.5, 0.5, 1)
    this.headLightL.position.set(-0.7, 0.2, 2.35)
    this.headLightR.position.set(0.7, 0.2, 2.35)
    this.headLightL.target.position.set(-0.9, 0, 16)
    this.headLightR.target.position.set(0.9, 0, 16)
    root.add(this.headLightL, this.headLightL.target, this.headLightR, this.headLightR.target)

    this.scannerLight = new THREE.PointLight(0xff1a1a, 1.8, 8, 2)
    this.scannerLight.position.set(0, 0.35, 2.3)
    root.add(this.scannerLight)

    return root
  }

  update(dt, controls) {
    this.chassisBody.wakeUp()
    // Anti-roll / upright: keep the chassis from banking so hard that wheel rays miss the plane
    const up = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up)
    if (up.y > 0.15) {
      const lean = Math.acos(Math.max(-1, Math.min(1, up.y)))
      if (lean > 0.06) {
        const axis = new CANNON.Vec3()
        new CANNON.Vec3(0, 1, 0).cross(up, axis)
        if (axis.lengthSquared() > 1e-8) {
          axis.normalize()
          // Torque pulls roof toward world-up (axis = worldUp × carUp)
          const strength = lean * 2200
          this.chassisBody.torque.x -= axis.x * strength
          this.chassisBody.torque.y -= axis.y * strength
          this.chassisBody.torque.z -= axis.z * strength
        }
      }
      this.chassisBody.angularVelocity.x *= 0.9
      this.chassisBody.angularVelocity.z *= 0.9
    }
    const velocity = this.chassisBody.velocity
    const forward = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward)
    let speed = velocity.dot(forward) // signed: +forward, -reverse
    if (!Number.isFinite(speed)) speed = 0
    this.speedKmh = Math.abs(speed) * 3.6
    if (!Number.isFinite(this.speedKmh)) this.speedKmh = 0
    this.signedSpeedKmh = speed * 3.6
    // Soft speed cap ~170 km/h — prevents barrier launches at absurd speeds
    if (this.speedKmh > 145) {
      const scale = 145 / this.speedKmh
      velocity.scale(scale, velocity)
    }

    const speedFactor = Math.min(1, this.speedKmh / 150)
    const targetSteer = controls.steer * this.maxSteer * (1 - speedFactor * 0.65)
    const steerLerp = Math.min(1, dt * 9)
    this._steerCurrent += (targetSteer - this._steerCurrent) * steerLerp
    const steerVal = this._steerCurrent

    this.vehicle.setSteeringValue(steerVal, 0)
    this.vehicle.setSteeringValue(steerVal, 1)

    // Clear brakes/engine every frame, then set intentionally
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(0, i)
      this.vehicle.applyEngineForce(0, i)
    }

    // Reverse when stopped (<~2 km/h forward) or already rolling backward
    const wantReverse = controls.brake > 0 && speed < 0.6
    const wantBrake = controls.brake > 0 && !wantReverse && speed > 0.3
    this.gear = wantReverse ? 'R' : 'D'

    if (controls.throttle && !wantReverse) {
      const force = this.maxForce * (controls.handbrake ? 0.55 : 1)
      // Negative engine force = forward (indexForwardAxis = 2)
      this.vehicle.applyEngineForce(-force, 2)
      this.vehicle.applyEngineForce(-force, 3)
    }

    if (wantReverse) {
      // Positive engine force = reverse; no wheel brakes so it can move
      const rev = 5600
      this.vehicle.applyEngineForce(rev, 2)
      this.vehicle.applyEngineForce(rev, 3)
      this.gear = 'R'
      // Cap reverse at ~25 km/h
      if (speed < -7) {
        this.vehicle.applyEngineForce(0, 2)
        this.vehicle.applyEngineForce(0, 3)
      }
      // Reliable reverse: also set chassis velocity when nearly stopped
      if (speed > -5) {
        const back = new CANNON.Vec3()
        this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, -1), back)
        const target = 5 // m/s ~18 km/h reverse cap
        const cur = this.chassisBody.velocity.dot(back)
        if (cur < target) {
          const add = Math.min(14, target - cur)
          this.chassisBody.velocity.x += back.x * add * Math.min(1, dt * 4)
          this.chassisBody.velocity.z += back.z * add * Math.min(1, dt * 4)
        }
      }
    } else if (wantBrake) {
      for (let i = 0; i < 4; i++) this.vehicle.setBrake(this.brakeForce, i)
    }

    // Mild launch assist from standstill so a recover never leaves the player at 0
    if (controls.throttle && !wantReverse && this.speedKmh < 12) {
      const onGround = this.wheelsOnGround()
      if (onGround >= 1) {
        const fwd = new CANNON.Vec3()
        this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), fwd)
        const boost = (12 - this.speedKmh) * 400
        this.chassisBody.applyForce(fwd.scale(boost, fwd), this.chassisBody.position)
      }
    }

    if (controls.handbrake) {
      this.vehicle.setBrake(28, 2)
      this.vehicle.setBrake(28, 3)
      for (let i = 2; i < 4; i++) {
        this.vehicle.wheelInfos[i].frictionSlip = 1.1
      }
    } else {
      for (let i = 2; i < 4; i++) {
        this.vehicle.wheelInfos[i].frictionSlip = 2.4
      }
    }

    this.mesh.position.copy(this.chassisBody.position)
    this.mesh.quaternion.copy(this.chassisBody.quaternion)

    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i)
      const t = this.vehicle.wheelInfos[i].worldTransform
      this.wheelMeshes[i].position.copy(t.position)
      this.wheelMeshes[i].quaternion.copy(t.quaternion)
    }

    this.scannerPhase += dt * 3.2
    const sweep = (Math.sin(this.scannerPhase) + 1) / 2
    const center = sweep * 10
    const glowMul = this._night === false ? 0.18 : 1.15
    for (let i = 0; i < this.scannerLeds.length; i++) {
      const d = Math.abs(i - center)
      const intensity = Math.max(0.04, 2.4 - d * 1.15) * glowMul
      this.scannerLeds[i].material.emissiveIntensity = intensity
    }
    this.scannerLight.position.x = (sweep - 0.5) * 1.6
    const base = this._night === false ? 0.25 : 1.4
    this.scannerLight.intensity = base + Math.sin(this.scannerPhase * 2) * 0.2 * glowMul
  }

  /** Place the car at a world pose, zeroing velocities. */
  teleport(x, y, z, yaw) {
    const b = this.chassisBody
    b.velocity.set(0, -1.2, 0)
    b.angularVelocity.set(0, 0, 0)
    b.force.set(0, 0, 0)
    b.torque.set(0, 0, 0)
    b.position.set(x, y, z)
    b.quaternion.setFromEuler(0, yaw || 0, 0)
    b.wakeUp()
    this._steerCurrent = 0
    this.gear = 'D'
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(0, i)
      this.vehicle.applyEngineForce(0, i)
      const w = this.vehicle.wheelInfos[i]
      w.raycastResult.reset()
      w.isInContact = false
      w.suspensionForce = 0
      w.engineForce = 0
      w.brake = 0
    }
    this.mesh.position.copy(b.position)
    this.mesh.quaternion.copy(b.quaternion)
  }

  hasBadState() {
    const p = this.chassisBody.position
    const v = this.chassisBody.velocity
    const a = this.chassisBody.angularVelocity
    const vals = [p.x, p.y, p.z, v.x, v.y, v.z, a.x, a.y, a.z]
    if (vals.some((n) => !Number.isFinite(n))) return true
    // Sunken into the ground plane (the old stuck-at-first-curve failure)
    if (p.y < 0.12 || p.y > 40) return true
    if (v.length() > 120) return true
    return false
  }

  wheelsOnGround() {
    return this.vehicle.numWheelsOnGround || 0
  }

  isOverturned() {
    const up = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up)
    return up.y < 0.35
  }

  setTimeOfDay(mode) {
    const night = mode !== 'day'
    this._night = night
    // Stronger night headlights (physically based units: candela, decay 1)
    const spot = night ? 60 : 0.08
    this.headLightL.intensity = spot
    this.headLightR.intensity = spot
    this.headLightL.distance = night ? 95 : 20
    this.headLightR.distance = night ? 95 : 20
    for (const m of this.headLightMeshes) {
      m.material.emissiveIntensity = night ? 2.0 : 0.2
    }
    this.scannerLight.intensity = night ? 2.4 : 0.25
    this.scannerLight.distance = night ? 10 : 4
  }

  getPosition() {
    return this.chassisBody.position
  }

  getQuaternion() {
    return this.chassisBody.quaternion
  }

  getForward(out = new THREE.Vector3()) {
    const q = this.chassisBody.quaternion
    out.set(0, 0, 1).applyQuaternion(q)
    return out
  }

  dispose() {
    this.vehicle.removeFromWorld(this.world)
    this.world.removeBody(this.chassisBody)
    this.scene.remove(this.mesh)
    for (const w of this.wheelMeshes) this.scene.remove(w)
  }
}
