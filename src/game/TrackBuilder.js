import * as THREE from 'three'
import * as CANNON from 'cannon-es'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t
  const t3 = t2 * t
  return new THREE.Vector3(
    0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3),
  )
}


function lightenHex(hex, amount) {
  const r = (hex >> 16) & 255
  const g = (hex >> 8) & 255
  const b = hex & 255
  const lr = Math.min(255, Math.round(r + (255 - r) * amount))
  const lg = Math.min(255, Math.round(g + (255 - g) * amount))
  const lb = Math.min(255, Math.round(b + (255 - b) * amount))
  return (lr << 16) | (lg << 8) | lb
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

  // Collision groups: 1=ground, 2=barrier, 4=chassis. Wheel rays only hit ground.
  const GROUP_GROUND = 1
  const GROUP_BARRIER = 2
  const GROUP_CHASSIS = 4

  const groundPhysMat = world._pekarGroundMat || new CANNON.Material('pekar-ground')
  const barrierMatPhys = world._pekarBarrierMat || new CANNON.Material('pekar-barrier')
  world._pekarGroundMat = groundPhysMat
  world._pekarBarrierMat = barrierMatPhys

  // Ground plane under whole track
  // One continuous flat ground collider. NOT a CANNON.Plane: with SAPBroadphase the
  // rotated plane gets a half-infinite AABB (z<=0 only), so every ray at z>0 missed
  // the ground — the "ghost bump" where wheels lost traction. A huge static box has a
  // correct AABB and its top face sits exactly at y=0 (no seams, no steps).
  const gs = (def.groundSize || 420) / 2 + 200
  const groundBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(gs, 1, gs)),
    material: groundPhysMat,
  })
  groundBody.position.set(0, -1, 0)
  groundBody.collisionFilterGroup = GROUP_GROUND
  groundBody.collisionFilterMask = GROUP_CHASSIS

  const half = roadWidth / 2
  const distToPath = (x, z) => {
    let best = Infinity
    for (let j = 0; j < path.length; j++) {
      const p = path[j], q = path[(j + 1) % path.length]
      const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
      const u = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L))
      best = Math.min(best, Math.hypot(x - p.x - ex * u, z - p.z - ez * u))
    }
    return best
  }
  // Barriers must stay outside the road (+0.6 m margin)
  const barrierIntrudes = (pos, yaw, thick, len) => {
    const c = Math.cos(yaw), s = Math.sin(yaw)
    for (const lx of [-thick / 2, thick / 2]) {
      for (let k = -1; k <= 1.001; k += 0.25) {
        const lz = (k * len) / 2
        if (distToPath(pos.x + lx * c + lz * s, pos.z - lx * s + lz * c) < half + 0.6) return true
      }
    }
    return false
  }
  world.addBody(groundBody)
  bodies.push(groundBody)

  const groundSize = def.groundSize || 420
  const isDay = def.timeOfDay === 'day'
  let groundColor = def.groundColor || 0x0c1018
  let roadColor = def.roadColor || 0x1a1d24
  if (isDay) {
    // Lift dark theme colors so day reads clearly
    groundColor = lightenHex(groundColor, 0.35)
    roadColor = lightenHex(roadColor, 0.22)
  }
  const groundMat = new THREE.MeshStandardMaterial({
    color: groundColor,
    roughness: 0.95,
    metalness: 0.05,
  })
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(groundSize, groundSize), groundMat)
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  group.add(ground)

  // Road ribbon
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
    color: roadColor,
    roughness: 0.85,
    metalness: 0.1,
  })
  const road = new THREE.Mesh(roadGeo, roadMat)
  road.receiveShadow = true
  group.add(road)

  // Soft shoulder / runoff tint beside road (visual only)
  const shoulderMat = new THREE.MeshStandardMaterial({
    color: def.shoulderColor || 0x2a2e28,
    roughness: 0.95,
    metalness: 0.02,
  })
  for (let i = 0; i < path.length; i += 2) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a)
    const len = Math.max(0.5, dir.length())
    dir.normalize()
    const yaw = Math.atan2(dir.x, dir.z)
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    for (const sign of [1, -1]) {
      const sh = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, len * 1.9), shoulderMat)
      const pos = a.clone().addScaledVector(side, sign * (half + 1.4))
      sh.position.set(pos.x, 0.015, pos.z)
      sh.rotation.y = yaw
      sh.receiveShadow = true
      group.add(sh)
    }
  }

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

  }

  // Barriers: continuous chains along each offset edge. Each piece spans offset point i→i+1
  // (+overlap), so the OUTSIDE of curves (longer arc) has no gaps. Pieces that would poke
  // into the road (tight inner curves / hairpins) are shortened or dropped.
  const wallThick = 0.5
  const wallThickCol = 1.6
  const wallH = 1.15
  const wallOff = half + 1.3
  const N = path.length
  for (const sign of [1, -1]) {
    const offs = []
    for (let i = 0; i < N; i++) {
      const prev = path[(i - 1 + N) % N], next = path[(i + 1) % N]
      const d = new THREE.Vector3().subVectors(next, prev).setY(0).normalize()
      offs.push(path[i].clone().addScaledVector(new THREE.Vector3(-d.z, 0, d.x), sign * wallOff))
    }
    for (let i = 0; i < N; i++) {
      const p0 = offs[i], p1 = offs[(i + 1) % N]
      const seg = new THREE.Vector3().subVectors(p1, p0).setY(0)
      const segLen = seg.length()
      if (segLen < 0.05) continue
      const yaw = Math.atan2(seg.x, seg.z)
      const pos = p0.clone().addScaledVector(seg, 0.5)
      let wallLen = segLen + 0.7 // overlap → no seams/gaps
      while (wallLen > 0.4 && barrierIntrudes(pos, yaw, wallThick, wallLen)) wallLen *= 0.85
      if (wallLen <= 0.4) continue
      const wall = new THREE.Mesh(new THREE.BoxGeometry(wallThick, wallH, wallLen), barrierMat)
      wall.position.set(pos.x, wallH / 2, pos.z)
      wall.rotation.y = yaw
      wall.castShadow = true
      wall.receiveShadow = true
      group.add(wall)
      // Physics wall: full height from the ground (0..colH) so the chassis can never ride up
      // and over it (the old 0.275..0.825 m rail was climbable at any speed), and thicker,
      // grown OUTWARD only (inner face stays exactly where the visual wall is, never in the
      // road), so a fast hit at a low frame rate cannot tunnel through it.
      const colH = 2.4
      const nx = (-seg.z / segLen) * sign, nz = (seg.x / segLen) * sign // outward normal
      let colThick = wallThickCol
      let cpos = pos.clone().addScaledVector(new THREE.Vector3(nx, 0, nz), (colThick - wallThick) / 2)
      if (barrierIntrudes(cpos, yaw, colThick, wallLen)) { colThick = wallThick; cpos = pos }
      const body = new CANNON.Body({ mass: 0, material: barrierMatPhys })
      body.addShape(new CANNON.Box(new CANNON.Vec3(colThick / 2, colH / 2, wallLen / 2)))
      body.position.set(cpos.x, colH / 2, cpos.z)
      body.quaternion.setFromEuler(0, yaw, 0)
      body.collisionFilterGroup = GROUP_BARRIER
      body.collisionFilterMask = GROUP_CHASSIS
      world.addBody(body)
      bodies.push(body)
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

  // Street lamps on every circuit (visual only, no colliders, outside the walls).
  const lamps = addTrackLamps(group, path, half, distToPath, !isDay)

  for (const c of group.children) c.userData.road = true
  const sceneryStart = group.children.length
  // Scenery depending on theme
  const isNight = def.timeOfDay !== 'day'
  if (def.theme === 'night-city') {
    addGrandstands(group, path, half, def)
  } else if (def.theme === 'coast') {
    addCoastScenery(group, path, half, def)
  } else if (def.theme === 'mountain') {
    addMountainScenery(group, path, half, def)
  } else {
    addPines(group, path, half, isDay ? 0x2d7a42 : 0x1a3d28)
    addHills(group, def, isDay)
  }

  const corridor = half + 1.0 // road + curbs, inside the walls
  const sceneryCheck = () => findSceneryIntrusions(group, distToPath, corridor)
  // Sink scenery that pokes above the road corridor; drop it if it can't be cleared.
  const sceneryFixed = { removed: 0, sunk: 0 }
  for (const m of sceneryCheck()) {
    const sz = new THREE.Box3().setFromObject(m).getSize(new THREE.Vector3())
    if (Math.max(sz.x, sz.z) < 10) { m.parent?.remove(m); sceneryFixed.removed++; continue } // trees, rocks, posts
    let tries = 0
    while (tries++ < 60 && meshIntrudes(m, distToPath, corridor)) m.position.y -= 0.5
    if (meshIntrudes(m, distToPath, corridor)) { m.parent?.remove(m); sceneryFixed.removed++ } else sceneryFixed.sunk++
  }
  void sceneryStart
  // Scenery check result is computed on the individual meshes, before they are merged.
  const sceneryResult = sceneryCheck()
  // Performance (mobile/WebKit): merge all static meshes per material -> a few dozen draw calls
  // instead of ~1-2k meshes. Visual result is identical.
  const merged = mergeStatic(group)

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
    roadWidth,
    laps: def.laps || 3,
    name: def.name,
    id: def.id,
    lighting: def.lighting,
    sceneryCheck: () => sceneryResult,
    lamps,
    merged,
    sceneryFixed,
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

function addCoastScenery(group, path, half, def) {
  const isNight = def.timeOfDay !== 'day'

  // Ocean — large plane offset to one side of the circuit
  const waterMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x0a2a48 : 0x1e7eb8,
    roughness: 0.18,
    metalness: 0.55,
    transparent: true,
    opacity: 0.92,
  })
  const water = new THREE.Mesh(new THREE.CircleGeometry(260, 48), waterMat)
  water.rotation.x = -Math.PI / 2
  water.position.set(190, -0.08, 10)
  group.add(water)

  // Lighter shallow water ring
  const shallow = new THREE.Mesh(
    new THREE.RingGeometry(70, 120, 40),
    new THREE.MeshStandardMaterial({
      color: isNight ? 0x1a4a66 : 0x4eb8d4,
      roughness: 0.35,
      metalness: 0.3,
      transparent: true,
      opacity: 0.55,
    }),
  )
  shallow.rotation.x = -Math.PI / 2
  shallow.position.set(150, -0.04, 10)
  group.add(shallow)

  // Beach strip between track and water
  const sandMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x6a5a3e : 0xe2c990,
    roughness: 1,
  })
  for (let i = 0; i < 18; i++) {
    const beach = new THREE.Mesh(new THREE.SphereGeometry(16 + (i % 3) * 5, 8, 6), sandMat)
    const ang = -0.6 + (i / 18) * 1.6
    beach.position.set(95 + Math.cos(ang) * 40, -7, Math.sin(ang) * 90)
    beach.scale.set(1.6, 0.22, 1.3)
    beach.receiveShadow = true
    group.add(beach)
  }

  // Inland dunes
  for (let i = 0; i < 10; i++) {
    const dune = new THREE.Mesh(new THREE.SphereGeometry(12 + (i % 4) * 3, 8, 6), sandMat)
    const ang = Math.PI + (i / 10) * Math.PI
    dune.position.set(Math.cos(ang) * 130, -5, Math.sin(ang) * 130)
    dune.scale.set(1.5, 0.3, 1.2)
    group.add(dune)
  }

  // Palms along the seaside edge
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.85 })
  const leafMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x1a4a28 : 0x2f9a45,
    roughness: 0.75,
  })
  for (let i = 0; i < path.length; i += 5) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    // Prefer the side facing +X (coast)
    const towardCoast = side.x > 0 ? 1 : -1
    for (const sign of [towardCoast, -towardCoast]) {
      if (sign !== towardCoast && (i % 10 !== 0)) continue
      const dist = half + (sign === towardCoast ? 6 : 8) + (i % 4)
      const p = a.clone().addScaledVector(side, sign * dist)
      const lean = sign * 0.15
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 5.2, 6), trunkMat)
      trunk.position.set(p.x, 2.5, p.z)
      trunk.rotation.z = lean
      trunk.castShadow = true
      group.add(trunk)
      for (let k = 0; k < 7; k++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3.2, 4, 1, true), leafMat)
        leaf.position.set(p.x + lean * 2.0, 4.6, p.z)
        leaf.rotation.y = (k / 7) * Math.PI * 2
        leaf.rotation.x = 1.05
        leaf.castShadow = true
        group.add(leaf)
      }
    }
  }

  // Simple pier / jetty decoration
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 })
  const pier = new THREE.Mesh(new THREE.BoxGeometry(4, 0.35, 28), wood)
  pier.position.set(135, 0.4, -20)
  pier.castShadow = true
  group.add(pier)
  for (const z of [-28, -14, 0, 14]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 2.2, 6), wood)
    post.position.set(135, 0.9, -20 + z * 0.35)
    group.add(post)
  }
}

function addMountainScenery(group, path, half, def) {
  const isNight = def.timeOfDay !== 'day'
  const rockMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x2a322c : 0x5a6a58,
    roughness: 0.92,
  })
  const cliffMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x3a3836 : 0x7a746c,
    roughness: 0.88,
  })
  const snowMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0xb8c4d8 : 0xf2f6ff,
    roughness: 0.7,
  })

  // Layered peaks with snow caps
  for (let i = 0; i < 16; i++) {
    const h = 32 + (i % 5) * 12
    const r = 10 + (i % 4) * 3.5
    const peak = new THREE.Mesh(new THREE.ConeGeometry(r, h, 7), rockMat)
    const ang = (i / 16) * Math.PI * 2
    const dist = 100 + (i % 5) * 16
    peak.position.set(Math.cos(ang) * dist, h * 0.32 - 2, Math.sin(ang) * dist)
    peak.castShadow = true
    peak.receiveShadow = true
    group.add(peak)
    if (h > 40) {
      const snow = new THREE.Mesh(new THREE.ConeGeometry(r * 0.45, h * 0.28, 7), snowMat)
      snow.position.set(peak.position.x, peak.position.y + h * 0.28, peak.position.z)
      group.add(snow)
    }
  }

  // Mid hills closer in
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(18 + (i % 3) * 6, 10, 8), rockMat)
    const ang = (i / 10) * Math.PI * 2 + 0.2
    hill.position.set(Math.cos(ang) * 75, -6, Math.sin(ang) * 75)
    hill.scale.y = 0.45
    hill.receiveShadow = true
    group.add(hill)
  }

  // Rock walls / cliffs hugging the technical sections
  for (let i = 0; i < path.length; i += 4) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    const sign = i % 8 < 4 ? 1 : -1
    const p = a.clone().addScaledVector(side, sign * (half + 5.5 + (i % 3)))
    const h = 3.5 + (i % 4) * 1.2
    const rock = new THREE.Mesh(new THREE.BoxGeometry(4.2, h, 5.5), cliffMat)
    rock.position.set(p.x, h / 2, p.z)
    rock.rotation.y = Math.atan2(dir.x, dir.z) + (i % 2) * 0.25
    rock.castShadow = true
    rock.receiveShadow = true
    group.add(rock)
  }

  // Highland pines (sparser)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 })
  const leafMat = new THREE.MeshStandardMaterial({
    color: isNight ? 0x163528 : 0x1f5a36,
    roughness: 0.85,
  })
  for (let i = 0; i < path.length; i += 8) {
    const a = path[i]
    const b = path[(i + 1) % path.length]
    const dir = new THREE.Vector3().subVectors(b, a).normalize()
    const side = new THREE.Vector3(-dir.z, 0, dir.x)
    for (const sign of [1, -1]) {
      const p = a.clone().addScaledVector(side, sign * (half + 10 + (i % 5)))
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 2.4, 5), trunkMat)
      trunk.position.set(p.x, 1.2, p.z)
      group.add(trunk)
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.5, 3.8, 7), leafMat)
      leaves.position.set(p.x, 3.6, p.z)
      leaves.castShadow = true
      group.add(leaves)
    }
  }
}

function addPines(group, path, half, leafColor = 0x1a3d28) {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3b2a1a, roughness: 0.9 })
  const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85 })
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

function addHills(group, def, isDay = false) {
  let c = def.hillColor || 0x152218
  if (isDay) c = lightenHex(c, 0.4)
  const mat = new THREE.MeshStandardMaterial({ color: c, roughness: 1 })
  for (let i = 0; i < 10; i++) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(18 + (i % 4) * 5, 10, 8), mat)
    const ang = (i / 10) * Math.PI * 2
    hill.position.set(Math.cos(ang) * 140, -8, Math.sin(ang) * 140)
    hill.scale.y = 0.35
    group.add(hill)
  }
}

const _ray = new THREE.Raycaster()
const _down = new THREE.Vector3(0, -1, 0)
/** True if any part of mesh is above y=0 inside the road corridor. */
function meshIntrudes(mesh, distToPath, corridor) {
  mesh.updateWorldMatrix(true, true)
  const box = new THREE.Box3().setFromObject(mesh)
  if (box.isEmpty() || box.max.y <= 0) return false
  const step = Math.max(0.5, Math.min(1.5, (box.max.x - box.min.x) / 20))
  for (let x = box.min.x; x <= box.max.x + 1e-6; x += step) {
    for (let z = box.min.z; z <= box.max.z + 1e-6; z += step) {
      if (distToPath(x, z) > corridor) continue
      _ray.set(new THREE.Vector3(x, box.max.y + 1, z), _down)
      const hit = _ray.intersectObject(mesh, true)
      if (hit.length && hit[0].point.y > 0) return true
    }
  }
  return false
}
export function findSceneryIntrusions(group, distToPath, corridor) {
  const out = []
  for (const c of group.children) {
    if (c.userData.road) continue
    if (meshIntrudes(c, distToPath, corridor)) out.push(c)
  }
  return out
}

/** Bake and merge static meshes that share a material (and shadow flags) into one mesh each. */
function mergeStatic(group) {
  group.updateMatrixWorld(true)
  const buckets = new Map()
  const keep = []
  for (const c of [...group.children]) {
    if (!c.isMesh || c.userData.noMerge) { keep.push(c); continue }
    const key = `${c.material.uuid}|${c.castShadow ? 1 : 0}${c.receiveShadow ? 1 : 0}|${c.userData.road ? 1 : 0}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key).push(c)
  }
  let before = 0, after = 0
  for (const list of buckets.values()) {
    before += list.length
    if (list.length < 2) { after++; continue }
    const geos = []
    for (const m of list) {
      let g = m.geometry.clone()
      if (g.index === null) g = g.toNonIndexed()
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name)
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2))
      if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx) }
      g.applyMatrix4(m.matrixWorld)
      geos.push(g)
    }
    const mergedGeo = mergeGeometries(geos, false)
    if (!mergedGeo) { after += list.length; continue }
    const mesh = new THREE.Mesh(mergedGeo, list[0].material)
    mesh.castShadow = list[0].castShadow
    mesh.receiveShadow = list[0].receiveShadow
    mesh.userData.road = !!list[0].userData.road
    mesh.renderOrder = list[0].renderOrder
    for (const m of list) { group.remove(m); m.geometry.dispose() }
    for (const g of geos) g.dispose()
    group.add(mesh)
    after++
  }
  return { before, after: after + keep.length }
}

let _poolTex = null
function poolTexture() {
  if (_poolTex) return _poolTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  g.addColorStop(0, 'rgba(255,214,150,0.95)')
  g.addColorStop(0.45, 'rgba(255,190,120,0.45)')
  g.addColorStop(1, 'rgba(255,170,100,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  _poolTex = new THREE.CanvasTexture(c)
  _poolTex.colorSpace = THREE.SRGBColorSpace
  return _poolTex
}

/**
 * Street lamps along the circuit, alternating sides, outside the barriers (half + 3.4 m).
 * No physics bodies. At night the light is faked (no real lights): emissive lamp heads,
 * an additive glow halo, and an additive light pool painted on the road under each lamp.
 */
function addTrackLamps(group, path, half, distToPath, night) {
  const N = path.length
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.6, roughness: 0.45 })
  const headMat = new THREE.MeshStandardMaterial({
    color: night ? 0xfff1d6 : 0xd8d8d0,
    emissive: 0xffd9a0,
    emissiveIntensity: night ? 3.0 : 0.0,
    roughness: 0.4,
  })
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2,
  })
  const haloMat = new THREE.MeshBasicMaterial({
    map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9, fog: false, side: THREE.DoubleSide,
  })
  // ~1 lamp every 26 m
  let acc = 0, side = 1, count = 0
  const spacing = 22
  for (let i = 0; i < N; i++) {
    const a = path[i], b = path[(i + 1) % N]
    acc += a.distanceTo(b)
    if (acc < spacing) continue
    acc = 0
    side = -side
    const dir = new THREE.Vector3().subVectors(b, a).setY(0).normalize()
    const nrm = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(side)
    let s = side
    let p = a.clone().addScaledVector(nrm, half + 3.4)
    if (distToPath(p.x, p.z) < half + 3.0) { // inner hairpin: try the other side
      s = -side
      p = a.clone().addScaledVector(nrm, -(half + 3.4))
      if (distToPath(p.x, p.z) < half + 3.0) continue
    }
    const toRoad = new THREE.Vector3(a.x - p.x, 0, a.z - p.z).normalize()
    const H = 6.2
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, H, 6), poleMat)
    pole.position.set(p.x, H / 2, p.z)
    group.add(pole)
    const armLen = 2.4
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, armLen), poleMat)
    arm.position.set(p.x + toRoad.x * armLen / 2, H - 0.05, p.z + toRoad.z * armLen / 2)
    arm.rotation.y = Math.atan2(toRoad.x, toRoad.z)
    group.add(arm)
    const hx = p.x + toRoad.x * armLen, hz = p.z + toRoad.z * armLen
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.7), headMat)
    head.position.set(hx, H - 0.16, hz)
    head.rotation.y = arm.rotation.y
    group.add(head)
    if (night) {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(8.5, 20), poolMat)
      pool.rotation.x = -Math.PI / 2
      pool.position.set(hx + toRoad.x * 1.5, 0.045, hz + toRoad.z * 1.5)
      pool.renderOrder = 1
      group.add(pool)
      // horizontal halo under the head reads as a glowing bulb from the driver's view
      for (const ry of [0, Math.PI / 2]) {
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), haloMat)
        halo.position.set(hx, H - 0.3, hz)
        halo.rotation.y = ry
        halo.renderOrder = 2
        group.add(halo)
      }
    }
    void s
    count++
  }
  return count
}
