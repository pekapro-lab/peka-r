import * as THREE from 'three'
import * as CANNON from 'cannon-es'

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return new THREE.Vector3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  )
}

export function sampleLoop(controlPoints, samplesPerSeg = 12) {
  const pts = controlPoints.map((p) => new THREE.Vector3(p.x, p.y || 0, p.z))
  const n = pts.length
  const out = []
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    for (let s = 0; s < samplesPerSeg; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg))
    }
  }
  return out
}

export function buildTrack(world, scene, def) {
  const path = sampleLoop(def.points, def.samplesPerSeg || 14)
  const roadWidth = def.roadWidth || 12
  const group = new THREE.Group()
  const bodies = []

  // Ground plane under whole track
  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane(),
  })
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
  world.addBody(groundBody)
  bodies.push(groundBody)

  const groundSize = def.groundSize || 420
  const groundMat = new THREE.MeshStandardMaterial({
    color: def.groundColor || 0x0c1018,
    roughness: 0.95,
    metalness: 0.05,
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  // Road ribbon
  const half = roadWidth / 2
  const positions = []
  const normals = []
  const uvs = []
  const indices = []
  const leftEdge = []
  const rightEdge = []
  const centerline = []

  for (let i = 0; i < path.length; i++) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x).normalize()
    const L = a.clone().addScaledVector(side, half)
    const R = a.clone().addScaledVector(side, -half)
    L.y = 0.02
    R.y = 0.02
    leftEdge.push(L)
    rightEdge.push(R)
    centerline.push(a.clone())

    const u = i / path.length
    const base = i * 2
    positions.push(L.x, L.y, L.z, R.x, R.y, R.z)
    normals.push(0, 1, 0, 0, 1, 0)
    uvs.push(0, u * 40, 1, u * 40)

    const i2 = ((i + 1) % path.length) * 2
    indices.push(base, i2, base + 1, base + 1, i2, i2 + 1)
  }

  const roadGeo = new THREE.BufferGeometry()
  roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  roadGeo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  roadGeo.setIndex(indices)
  roadGeo.computeVertexNormals()

  const roadMat = new THREE.MeshStandardMaterial({
    color: def.roadColor || 0x1a1d24,
    roughness: 0.85,
    metalness: 0.1,
  })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.receiveShadow = true
  group.add(road)

  // Center dashed line
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8dce8 })
  for (let i = 0; i < path.length; i += 3) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.4), lineMat)
    seg.position.set(a.x, 0.04, a.z)
    seg.rotation.y = Math.atan2(dir.x, dir.z)
    group.add(seg)
  }

  // Curbs + barriers
  const curbMatL = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.7 })
  const curbMatR = new THREE.MeshStandardMaterial({ color: 0xc41e1e, roughness: 0.7 })
  const barrierMat = new THREE.MeshStandardMaterial({
    color: def.barrierColor || 0x8a909c,
    metalness: 0.55,
    roughness: 0.4,
  })

  for (let i = 0; i < path.length; i++) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = dir.length()
    dir.normalize()
    const yaw = Math.atan2(dir.x, dir.z)
    const side = new THREE.Vector3(-dir.z, 0, dir.x)

    // curbs every segment
    for (const [sign, mat] of [[1, curbMatL], [-1, curbMatR]]) {
      const curb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, Math.max(0.4, len * 0.98)), mat)
      const pos = a.clone().addScaledVector(side, sign * (half + 0.15))
      curb.position.set(pos.x, 0.08, pos.z)
      curb.rotation.y = yaw
      group.add(curb)
    }

    // physical + visual barriers every other segment
    if (i % 2 === 0) {
      for (const sign of [1, -1]) {
        const wallLen = len * 1.95
        const wall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.1, wallLen), barrierMat)
        const pos = a.clone().addScaledVector(side, sign * (half + 1.1))
        wall.position.set(pos.x, 0.55, pos.z)
        wall.rotation.y = yaw
        wall.castShadow = true
        wall.receiveShadow = true
        group.add(wall)

        const shape = new CANNON.Box(new CANNON.Vec3(0.175, 0.55, wallLen / 2))
        const body = new CANNON.Body({ mass: 0 })
        body.addShape(shape)
        body.position.set(pos.x, 0.55, pos.z)
        body.quaternion.setFromEuler(0, yaw, 0)
        world.addBody(body)
        bodies.push(body)
      }
    }
  }

  // Start/finish markers
  const finishMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  const finish = new THREE.Mesh(new THREE.BoxGeometry(roadWidth, 0.05, 1.2), finishMat)
  const start = path[0]
  const next = path[1]
  const sdir = new THREE.Vector3().subVectors(next, start).normalize()
  finish.position.set(start.x, 0.05, start.z)
  finish.rotation.y = Math.atan2(sdir.x, sdir.z)
  group.add(finish)

  // Checkered posts
  for (const sign of [-1, 1]) {
    const post = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 3.2, 0.25),
      new THREE.MeshStandardMaterial({ color: 0x111111 }),
    )
    const side = new THREE.Vector3(-sdir.z, 0, sdir.x)
    const p = start.clone().addScaledVector(side, sign * (half + 0.6))
    post.position.set(p.x, 1.6, p.z)
    group.add(post)
  }

  // Scenery: grandstands / trees / lights depending on theme
  if (def.theme === 'night-city') {
    addGrandstands(group, path, half, def)
    addStreetLights(group, path, half)
  } else {
    addPines(group, path, half)
    addHills(group, def)
  }

  scene.add(group)

  const spawnYaw = Math.atan2(sdir.x, sdir.z)
  const spawn = {
    x: start.x - sdir.x * 4,
    y: 0.5,
    z: start.z - sdir.z * 4,
    yaw: spawnYaw,
  }

  return {
    group,
    bodies,
    path: centerline,
    spawn,
    laps: def.laps || 3,
    name: def.name,
    id: def.id,
    lighting: def.lighting,
    dispose() {
      scene.remove(group)
      for (const b of bodies) world.removeBody(b)
    },
  }
}

function addGrandstands(group, path, half, def) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.8 })
  const seat = new THREE.MeshStandardMaterial({ color: 0x3a4558, roughness: 0.75 })
  for (let i = 8; i < path.length; i += Math.floor(path.length / 6)) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const base = a.clone().addScaledVector(side, half + 8)
    const stand = new THREE.Mesh(new THREE.BoxGeometry(18, 4, 6), mat)
    stand.position.set(base.x, 2, base.z)
    stand.rotation.y = Math.atan2(dir.x, dir.z)
    stand.castShadow = true
    group.add(stand)
    const seats = new THREE.Mesh(new THREE.BoxGeometry(17, 0.4, 5), seat)
    seats.position.set(base.x, 3.2, base.z)
    seats.rotation.y = Math.atan2(dir.x, dir.z)
    group.add(seats)
  }
}

function addStreetLights(group, path, half) {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x22262e, metalness: 0.6, roughness: 0.4 })
  for (let i = 0; i < path.length; i += 10) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    for (const sign of [1, -1]) {
      const p = a.clone().addScaledVector(side, sign * (half + 2.2))
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 5.5, 6), poleMat)
      pole.position.set(p.x, 2.75, p.z)
      group.add(pole)
      const lamp = new THREE.PointLight(0xffd9a0, 0.55, 22, 2)
      lamp.position.set(p.x, 5.2, p.z)
      group.add(lamp)
    }
  }
}

function addPines(group, path, half) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 })
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1a3d28, roughness: 0.85 })
  for (let i = 0; i < path.length; i += 5) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    for (const sign of [1, -1]) {
      if ((i + sign) % 3 === 0) continue
      const dist = half + 4 + ((i * 17) % 9)
      const p = a.clone().addScaledVector(side, sign * dist)
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.25, 2.2, 5), trunkMat)
      trunk.position.set(p.x, 1.1, p.z)
      group.add(trunk)
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.4, 7), leafMat)
      leaves.position.set(p.x, 3.4, p.z)
      leaves.castShadow = true
      group.add(leaves)
    }
  }
}

function addHills(group, def) {
  const mat = new THREE.MeshStandardMaterial({ color: def.hillColor || 0x152218, roughness: 1 })
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(18 + (i % 4) * 5, 10, 8), mat)
    const ang = (i / 10) * Math.PI * 2
    hill.position.set(Math.cos(ang) * 140, -8, Math.sin(ang) * 140)
    hill.scale.y = 0.35
    group.add(hill)
  }
}
