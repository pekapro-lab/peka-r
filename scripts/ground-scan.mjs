/** Scan all tracks: road must be smooth ground with no non-ground colliders inside it. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5193
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/peka-r')) url = url.slice('/peka-r'.length) || '/'
  let file = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch({ headless: true, args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/peka-r/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
let fail = false
for (const id of ['norte', 'bosque', 'costa', 'sierra']) {
  const r = await page.evaluate((id) => {
    const g = window.__PEKA_R__
    g.startTrack(id)
    const world = g.world, path = g.track.path, half = (g.track.roadWidth || 12) / 2
    const W = world.bodies[0].constructor // CANNON.Body
    const Vec3 = world.gravity.constructor
    const RR = g.car.vehicle.wheelInfos[0].raycastResult.constructor
    const chassis = g.car.chassisBody
    let maxStep = 0, intrusions = [], misses = 0, samples = 0
    for (let i = 0; i < path.length; i++) {
      const a = path[i], b = path[(i + 1) % path.length]
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const sx = -dz / l, sz = dx / l
      for (let s = 0; s < 3; s++) {
        const t = s / 3
        const cx = a.x + dx * t, cz = a.z + dz * t
        let prev = null
        for (let k = -10; k <= 10; k++) {
          const o = (k / 10) * (half - 0.3)
          const x = cx + sx * o, z = cz + sz * o
          samples++
          // ground ray
          const res = new RR()
          world.raycastClosest(new Vec3(x, 20, z), new Vec3(x, -5, z), { collisionFilterGroup: 4, collisionFilterMask: 1, skipBackfaces: false }, res)
          if (!res.hasHit) { misses++; prev = null; continue }
          const y = res.hitPointWorld.y
          if (prev !== null) maxStep = Math.max(maxStep, Math.abs(y - prev))
          prev = y
          // anything non-ground at car height inside the road?
          const res2 = new RR()
          world.raycastClosest(new Vec3(x, y + 1.5, z), new Vec3(x, y + 0.02, z), { collisionFilterGroup: 4, collisionFilterMask: 2, skipBackfaces: false }, res2)
          if (res2.hasHit && res2.body !== chassis && intrusions.length < 8)
            intrusions.push({ i, o: +o.toFixed(1), x: +x.toFixed(1), z: +z.toFixed(1) })
          else if (res2.hasHit) intrusions.length < 8 || intrusions.push(null)
        }
      }
    }
    // Geometric: no barrier box corner/edge may sit within the road (+0.4 m margin)
    const distToPath = (x, z) => {
      let best = Infinity
      for (let j = 0; j < path.length; j++) {
        const p = path[j], q = path[(j + 1) % path.length]
        const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
        let u = ((x - p.x) * ex + (z - p.z) * ez) / L; u = Math.max(0, Math.min(1, u))
        best = Math.min(best, Math.hypot(x - p.x - ex * u, z - p.z - ez * u))
      }
      return best
    }
    let boxHits = []
    for (const body of world.bodies) {
      if (body.collisionFilterGroup !== 2) continue
      const h = body.shapes[0].halfExtents
      for (const [lx, lz] of [[-1,-1],[1,-1],[-1,1],[1,1],[-1,0],[1,0],[-1,-0.5],[1,0.5],[-1,0.5],[1,-0.5]]) {
        const w = body.pointToWorldFrame(new Vec3(lx * h.x, 0, lz * h.z))
        const d = distToPath(w.x, w.z)
        if (d < half + 0.4) { boxHits.push({ x: +w.x.toFixed(1), z: +w.z.toFixed(1), d: +d.toFixed(2) }); break }
      }
    }
    intrusions.push(...boxHits.slice(0, 6)); const boxCount = boxHits.length
    return { id, boxCount, samples, misses, maxStep: +maxStep.toFixed(3), intrusions: intrusions.filter(Boolean) }
  }, id)
  console.log(JSON.stringify(r))
  if (r.misses || r.maxStep > 0.03 || r.intrusions.length) fail = true
}
await browser.close(); server.close()
console.log(fail ? 'GROUND SCAN FAILED' : 'GROUND SCAN PASSED'); if (fail) process.exitCode = 1
