import * as THREE from 'three'
import * as CANNON from 'cannon-es'

const chassisW = 2.05
const chassisH = 0.55
const chassisL = 4.55

export class Car {
  constructor(world, scene, spawn) {
    this.world = world
    this.scene = scene
    this.scannerPhase = 0
    this.speedKmh = 0

    const mass = 980
    const chassisShape = new CANNON.Box(new CANNON.Vec3(chassisW / 2, chassisH / 2, chassisL / 2))
    this.chassisBody = new CANNON.Body({ mass })
    this.chassisBody.addShape(chassisShape)
    this.chassisBody.position.set(spawn.x, spawn.y + 0.7, spawn.z)
    this.chassisBody.quaternion.setFromEuler(0, spawn.yaw || 0, 0)
    this.chassisBody.angularDamping = 0.35
    this.chassisBody.linearDamping = 0.05
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
      suspensionStiffness: 38,
      suspensionRestLength: 0.28,
      frictionSlip: 2.6,
      dampingRelaxation: 2.4,
      dampingCompression: 3.6,
      maxSuspensionForce: 100000,
      rollInfluence: 0.12,
      axleLocal: new CANNON.Vec3(-1, 0, 0),
      chassisConnectionPointLocal: new CANNON.Vec3(0, 0, 0),
      maxSuspensionTravel: 0.28,
      customSlidingRotationalSpeed: -28,
      useCustomSlidingRotationalSpeed: true,
    }

    const halfW = 0.9
    const positions = [
      new CANNON.Vec3(halfW, 0.05, 1.45),
      new CANNON.Vec3(-halfW, 0.05, 1.45),
      new CANNON.Vec3(halfW, 0.05, -1.45),
      new CANNON.Vec3(-halfW, 0.05, -1.45),
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

    this.maxSteer = 0.48
    this.maxForce = 3200
    this.brakeForce = 48
  }

  _buildMesh() {
    const root = new THREE.Group()

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

    const body = new THREE.Mesh(new THREE.BoxGeometry(chassisW, chassisH, chassisL), bodyMat)
    body.position.y = 0.05
    body.castShadow = true
    root.add(body)

    // Long low nose / hood extension feel
    const hood = new THREE.Mesh(new THREE.BoxGeometry(chassisW * 0.92, 0.18, 1.6), bodyMat)
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

    // Side intakes / mirrors hint
    for (const x of [-1.05, 1.05]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.22), chromeMat)
      mirror.position.set(x, 0.42, 0.55)
      root.add(mirror)
    }

    // Front bumper
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(chassisW * 0.98, 0.22, 0.28), bodyMat)
    bumper.position.set(0, -0.05, 2.2)
    root.add(bumper)

    // Headlights
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xfff2cc,
      emissive: 0xffe9a8,
      emissiveIntensity: 1.4,
    })
    for (const x of [-0.7, 0.7]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.14, 0.08), lightMat)
      hl.position.set(x, 0.12, 2.3)
      root.add(hl)
    }

    // Tail lights
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

    // Red scanner bar (animated materials)
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
    // housing
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(1.9, 0.1, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.7, roughness: 0.4 }),
    )
    housing.position.z = -0.02
    this.scannerGroup.add(housing)
    root.add(this.scannerGroup)

    // Spotlights for headlights
    this.headLightL = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 5, 0.45, 1)
    this.headLightR = new THREE.SpotLight(0xfff0d0, 2.2, 55, Math.PI / 5, 0.45, 1)
    this.headLightL.position.set(-0.7, 0.2, 2.35)
    this.headLightR.position.set(0.7, 0.2, 2.35)
    this.headLightL.target.position.set(-0.7, 0, 12)
    this.headLightR.target.position.set(0.7, 0, 12)
    root.add(this.headLightL, this.headLightL.target, this.headLightR, this.headLightR.target)

    // Scanner glow point light
    this.scannerLight = new THREE.PointLight(0xff1a1a, 1.8, 8, 2)
    this.scannerLight.position.set(0, 0.35, 2.3)
    root.add(this.scannerLight)

    return root
  }

  update(dt, controls) {
    const velocity = this.chassisBody.velocity
    const forward = new CANNON.Vec3()
    this.chassisBody.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1), forward)
    const speed = velocity.dot(forward)
    this.speedKmh = Math.abs(speed) * 3.6

    const speedFactor = Math.min(1, this.speedKmh / 140)
    const steerVal = controls.steer * this.maxSteer * (1 - speedFactor * 0.65)

    this.vehicle.setSteeringValue(steerVal, 0)
    this.vehicle.setSteeringValue(steerVal, 1)

    let force = 0
    if (controls.throttle) force = this.maxForce * (controls.handbrake ? 0.55 : 1)
    if (controls.brake && speed > 0.5) {
      // reverse lightly when nearly stopped handled below
    }

    // Engine on rear wheels
    this.vehicle.applyEngineForce(-force * (controls.throttle ? 1 : 0), 2)
    this.vehicle.applyEngineForce(-force * (controls.throttle ? 1 : 0), 3)

    // Braking / reverse
    const braking = controls.brake > 0
    const brakeForce = braking ? this.brakeForce : 0
    for (let i = 0; i < 4; i++) {
      this.vehicle.setBrake(brakeForce, i)
    }

    if (braking && this.speedKmh < 8) {
      this.vehicle.applyEngineForce(900, 2)
      this.vehicle.applyEngineForce(900, 3)
    }

    // Handbrake: lock rear wheels / reduce rear grip feel
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

    // Sync mesh
    this.mesh.position.copy(this.chassisBody.position)
    this.mesh.quaternion.copy(this.chassisBody.quaternion)

    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.updateWheelTransform(i)
      const t = this.vehicle.wheelInfos[i].worldTransform
      this.wheelMeshes[i].position.copy(t.position)
      this.wheelMeshes[i].quaternion.copy(t.quaternion)
    }

    // Scanner animation
    this.scannerPhase += dt * 3.2
    const sweep = (Math.sin(this.scannerPhase) + 1) / 2 // 0..1
    const center = sweep * 10
    for (let i = 0; i < this.scannerLeds.length; i++) {
      const d = Math.abs(i - center)
      const intensity = Math.max(0.04, 2.4 - d * 1.15)
      this.scannerLeds[i].material.emissiveIntensity = intensity
    }
    this.scannerLight.position.x = (sweep - 0.5) * 1.6
    this.scannerLight.intensity = 1.4 + Math.sin(this.scannerPhase * 2) * 0.3
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
