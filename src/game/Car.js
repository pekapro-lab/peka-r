import * as THREE from 'three'
import * as CANNON from 'cannon-es'

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
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisW / 2, chassisH / 2, chassisL / 2))
    this.chassisBody = new CANNON.Body({ mass })
    this.chassisBody.addShape(chassisShape, new CANNON.Vec3(0, 0.12, 0))
    this.chassisBody.position.set(spawn.x, spawn.y + 0.75, spawn.z)
    this.chassisBody.quaternion.setFromEuler(0, spawn.yaw || 0, 0)
    this.chassisBody.angularDamping = 0.48
    this.chassisBody.linearDamping = 0.04
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
      suspensionRestLength: 0.28,
      frictionSlip: 2.6,
      dampingRelaxation: 2.5,
      dampingCompression: 3.8,
      maxSuspensionForce: 80000,
      rollInfluence: 0.1,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.26,
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
      const raylen = wheel.suspensionRestLength + wheel.radius
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
        skipBackfaces: true,
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
          wheel.raycastResult.reset()
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
      const geo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16)
      geo.rotateZ(Math.PI / 2)
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35, metalness: 0.4 })
      const m = new THREE.Mesh(geo, mat)
      m.castShadow = true
      scene.add(m)
      this.wheelMeshes.push(m)
    }

    this.maxSteer = 0.55
    this.maxForce = 3600
    this.brakeForce = 52
    this._steerCurrent = 0
  }

  _buildMesh() {
    const root = new THREE.Group()
    const visW = 2.05
    const visH = 0.55
    const visL = 4.55

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x050505,
      metalness: 0.85,
      roughness: 0.28,
    })
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2230,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.65,
    })
    const chromeMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 1,
      roughness: 0.2,
    })

    const body = new THREE.Mesh(new THREE.BoxGeometry(visW, visH, visL), bodyMat)
    body.position.y = 0.05
    body.castShadow = true
    root.add(body)

    const hood = new THREE.Mesh(new THREE.BoxGeometry(visW * 0.92, 0.18, 1.6), bodyMat)
    hood.position.set(0, 0.22, 1.35)
    hood.castShadow = true
    root.add(hood)
    this.hoodMesh = hood

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 1.55), bodyMat)
    cabin.position.set(0, 0.48, -0.15)
    cabin.castShadow = true
    root.add(cabin)

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.45, 0.08), glassMat)
    windshield.position.set(0, 0.55, 0.62)
    windshield.rotation.x = -0.35
    root.add(windshield)

    const rearGlass = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 0.08), glassMat)
    rearGlass.position.set(0, 0.52, -0.9)
    rearGlass.rotation.x = 0.28
    root.add(rearGlass)

    for (const x of [-1.05, 1.05]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.22), chromeMat)
      mirror.position.set(x, 0.42, 0.55)
      root.add(mirror)
    }

    const bumper = new THREE.Mesh(new THREE.BoxGeometry(visW * 0.98, 0.22, 0.28), bodyMat)
    bumper.position.set(0, -0.05, 2.2)
    root.add(bumper)

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cc,
      emissive: 0xffe9a8,
      emissiveIntensity: 1.4,
    })
    this.headLightMeshes = []
    for (const x of [-0.7, 0.7]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), lightMat.clone())
      hl.position.set(x, 0.12, 2.3)
      root.add(hl)
      this.headLightMeshes.push(hl)
    }

    const tailMat = new THREE.MeshStandardMaterial({
      color: 0xaa0000,
      emissive: 0xff0000,
      emissiveIntensity: 0.6,
    })
    for (const x of [-0.75, 0.75]) {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.06), tailMat)
      tl.position.set(x, 0.2, -2.25)
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

    this.headLightL = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 5, 0.45, 1)
    this.headLightR = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 5, 0.45, 1)
    this.headLightL.position.set(-0.7, 0.2, 2.35)
    this.headLightR.position.set(0.7, 0.2, 2.35)
    this.headLightL.target.position.set(-0.7, 0, 12)
    this.headLightR.target.position.set(0.7, 0, 12)
    root.add(this.headLightL, this.headLightL.target, this.headLightR, this.headLightR.target)

    this.scannerLight = new THREE.PointLight(0xff1a1a, 1.8, 8, 2)
    this.scannerLight.position.set(0, 0.35, 2.3)
    root.add(this.scannerLight)

    return root
  }

  update(dt, controls) {
    const velocity = this.chassisBody.velocity
    const forward = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward)
    let speed = velocity.dot(forward)
    if (!Number.isFinite(speed)) speed = 0
    this.speedKmh = Math.abs(speed) * 3.6
    if (!Number.isFinite(this.speedKmh)) this.speedKmh = 0

    const speedFactor = Math.min(1, this.speedKmh / 150)
    const targetSteer = controls.steer * this.maxSteer * (1 - speedFactor * 0.65)
    const steerLerp = Math.min(1, dt * 9)
    this._steerCurrent += (targetSteer - this._steerCurrent) * steerLerp
    const steerVal = this._steerCurrent

    this.vehicle.setSteeringValue(steerVal, 0)
    this.vehicle.setSteeringValue(steerVal, 1)

    let force = 0
    if (controls.throttle) force = this.maxForce * (controls.handbrake ? 0.55 : 1)

    this.vehicle.applyEngineForce(-force * (controls.throttle ? 1 : 0), 2)
    this.vehicle.applyEngineForce(-force * (controls.throttle ? 1 : 0), 3)

    const braking = controls.brake > 0
    const brakeForce = braking ? this.brakeForce : 0
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(brakeForce, i)
    }

    // Stronger reverse so you can always back out of a wall
    if (braking && this.speedKmh < 12) {
      this.vehicle.applyEngineForce(2200, 2)
      this.vehicle.applyEngineForce(2200, 3)
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
    b.velocity.set(0, 0, 0)
    b.angularVelocity.set(0, 0, 0)
    b.force.set(0, 0, 0)
    b.torque.set(0, 0, 0)
    b.position.set(x, y, z)
    b.quaternion.setFromEuler(0, yaw || 0, 0)
    b.wakeUp()
    this._steerCurrent = 0
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(0, i)
      this.vehicle.applyEngineForce(0, i)
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
    if (p.y < -2 || p.y > 40) return true
    if (v.length() > 120) return true
    return false
  }

  isOverturned() {
    const up = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0), up)
    return up.y < 0.35
  }

  setTimeOfDay(mode) {
    const night = mode !== 'day'
    this._night = night
    const spot = night ? 3.4 : 0.08
    this.headLightL.intensity = spot
    this.headLightR.intensity = spot
    this.headLightL.distance = night ? 70 : 20
    this.headLightR.distance = night ? 70 : 20
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
