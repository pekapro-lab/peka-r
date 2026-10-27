import * as THREE from 'three'

function makeSkyTexture(top, mid, bottom) {
  const c = document.createElement('canvas')
  c.width = 4
  c.height = 256
  const ctx = c.getContext('2d')
  const g = ctx.createLinearGradient(0, 0, 0, 256)
  g.addColorStop(0, top)
  g.addColorStop(0.45, mid)
  g.addColorStop(1, bottom)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 4, 256)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearFilter
  return tex
}

export class Environment {
  constructor(scene) {
    this.scene = scene
    this.group = new THREE.Group()
    scene.add(this.group)

    // Inverted sky dome
    const skyGeo = new THREE.SphereGeometry(380, 24, 16)
    this.skyMat = new THREE.MeshBasicMaterial({
      map: makeSkyTexture('#070b16', '#10182a', '#1a1020'),
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    })
    this.sky = new THREE.Mesh(skyGeo, this.skyMat)
    this.group.add(this.sky)

    // Sun disc
    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(6, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xfff0c0, fog: false }),
    )
    this.sunMesh.position.set(90, 120, 50)
    this.group.add(this.sunMesh)

    // Soft sun glow
    this.sunGlow = new THREE.Mesh(
      new THREE.SphereGeometry(14, 16, 12),
      new THREE.MeshBasicMaterial({
        color: 0xffe0a0,
        transparent: true,
        opacity: 0.22,
        fog: false,
        depthWrite: false,
      }),
    )
    this.sunGlow.position.copy(this.sunMesh.position)
    this.group.add(this.sunGlow)

    // Stars (points)
    const starCount = 700
    const positions = new Float32Array(starCount * 3)
    for (let i = 0; i < starCount; i++) {
      const r = 300 + Math.random() * 60
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(Math.random() * 0.85) // upper hemisphere bias
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi))
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    const starGeo = new THREE.BufferGeometry()
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 1.4,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        fog: false,
      }),
    )
    this.group.add(this.stars)

    // Moon
    this.moon = new THREE.Mesh(
      new THREE.SphereGeometry(4.5, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xdde6ff, fog: false }),
    )
    this.moon.position.set(-80, 100, -40)
    this.group.add(this.moon)
  }

  apply(mode) {
    const day = mode === 'day'
    if (day) {
      this.skyMat.map?.dispose()
      this.skyMat.map = makeSkyTexture('#5aa7e8', '#a8d4f5', '#e8f2fc')
      this.skyMat.needsUpdate = true
      this.sunMesh.visible = true
      this.sunGlow.visible = true
      this.sunMesh.position.set(110, 130, 40)
      this.sunGlow.position.copy(this.sunMesh.position)
      this.stars.visible = false
      this.moon.visible = false
    } else {
      this.skyMat.map?.dispose()
      this.skyMat.map = makeSkyTexture('#02040a', '#070b18', '#120818')
      this.skyMat.needsUpdate = true
      this.sunMesh.visible = false
      this.sunGlow.visible = false
      this.stars.visible = true
      this.moon.visible = true
    }
  }

  dispose() {
    this.scene.remove(this.group)
    this.skyMat.map?.dispose()
    this.skyMat.dispose()
  }
}
