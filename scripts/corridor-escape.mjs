/**
 * Corridor containment: aggressive driving must never take the car outside the walled road
 * corridor (outer face of the barriers) on any track, inner OR outer side.
 * Drives (a) wall-ramming probes from many points at several angles on both sides at full
 * throttle + overspeed launches, with handbrake/steer jerks, and (b) frame-time stress (low FPS,
 * big dt -> substeps) to catch tunneling. Uses the real game physics via window.__PEKA_R__.
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5197
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/peka-r')) url = url.slice(7) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(PORT, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await browser.newPage()
await page.goto(`http://127.0.0.1:${PORT}/peka-r/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
const tracks = (process.env.TRACKS || 'norte,bosque,costa,sierra').split(',')
const STRIDE = +(process.env.STRIDE || 4)
let fail = false
for (const id of tracks) {
  const r = await page.evaluate(([id, STRIDE]) => {
    const g = window.__PEKA_R__
    g.startTrack(id); g.state = 'racing'; g.ui.hideCountdown()
    cancelAnimationFrame(g._raf)
    const path = g.track.path, N = path.length, half = (g.track.roadWidth || 12) / 2
    const V = g.world.gravity.constructor
    // Corridor limit: distance from centreline to the OUTER face of the barriers (+ chassis slack).
    // The car's centre can never legitimately be further than this.
    const LIMIT = half + 1.3 + 0.25 + 0.6
    const distToPath = (x, z) => {
      let best = Infinity
      for (let j = 0; j < N; j++) {
        const p = path[j], q = path[(j + 1) % N]
        const ex = q.x - p.x, ez = q.z - p.z, L = ex * ex + ez * ez || 1
        const u = Math.max(0, Math.min(1, ((x - p.x) * ex + (z - p.z) * ez) / L))
        const d = Math.hypot(x - p.x - ex * u, z - p.z - ez * u)
        if (d < best) best = d
      }
      return best
    }
    const ctl = { throttle: 1, brake: 0, steer: 0, handbrake: false }
    g.input.getControls = () => ctl
    g.recoverCar = () => {} // a recover must not hide an escape
    const escapes = []
    let probes = 0
    const probe = (i, side, ang, speed, dtFrame, jerk) => {
      probes++
      const a = path[i], b = path[(i + 1) % N]
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const tx = dx / l, tz = dz / l, nx = -tz * side, nz = tx * side
      // heading: blend of tangent and wall normal
      const hx = tx * Math.cos(ang) + nx * Math.sin(ang), hz = tz * Math.cos(ang) + nz * Math.sin(ang)
      const yaw = Math.atan2(hx, hz)
      const body = g.car.chassisBody
      body.position.set(a.x - nx * 1.5, 0.75, a.z - nz * 1.5)
      body.quaternion.setFromEuler(0, yaw, 0)
      body.velocity.set(hx * speed, 0, hz * speed)
      body.angularVelocity.set(0, 0, 0)
      if (g.car.vehicle?.wheelInfos) for (const w of g.car.vehicle.wheelInfos) { w.deltaRotation = 0; w.rotation = 0 }
      let worst = 0, t = 0
      while (t < 2.2) {
        t += dtFrame
        ctl.throttle = 1; ctl.brake = 0; ctl.handbrake = false
        ctl.steer = side * (jerk ? (Math.sin(t * 9) > 0 ? 1 : -1) : 0.6)
        if (jerk && t > 0.4 && t < 0.9) ctl.handbrake = true
        g.world.step(1 / 90, dtFrame, 6); g.car.update(dtFrame, ctl); g._guardPhysics(dtFrame, ctl)
        const p = body.position
        if (!Number.isFinite(p.x)) break
        const d = distToPath(p.x, p.z)
        if (d > worst) worst = d
        if (d > LIMIT) { escapes.push({ i, side, ang: +ang.toFixed(2), speed: Math.round(speed * 3.6), dt: +dtFrame.toFixed(3), jerk, d: +d.toFixed(2), y: +p.y.toFixed(2), x: +p.x.toFixed(1), z: +p.z.toFixed(1) }); return }
      }
    }
    for (let i = 0; i < N; i += STRIDE)
      for (const side of [1, -1])
        for (const ang of [0.35, 0.8, 1.3])
          for (const [speed, dtF, jerk] of [[34 / 3.6, 1 / 60, false], [80 / 3.6, 1 / 60, true], [140 / 3.6, 1 / 20, false]])
            probe(i, side, ang, speed, dtF, jerk)
    return { id, N, LIMIT: +LIMIT.toFixed(2), probes, escapes: escapes.length, sample: escapes.slice(0, 8) }
  }, [id, STRIDE])
  console.log(JSON.stringify(r))
  if (r.escapes) fail = true
}
await browser.close(); server.close()
console.log(fail ? 'CORRIDOR ESCAPE FAILED' : 'CORRIDOR ESCAPE PASSED'); if (fail) process.exitCode = 1
