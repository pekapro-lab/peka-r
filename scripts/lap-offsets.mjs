/** Drive full laps at inner/center/outer lateral offsets on every track; fail on any stall. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const BASE = process.env.URL || null
let server
if (!BASE) {
  server = createServer((req, res) => {
    let url = decodeURIComponent(req.url.split('?')[0])
    if (url.startsWith('/peka-r')) url = url.slice(7) || '/'
    let f = join(ROOT, url === '/' ? 'index.html' : url)
    if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
    res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
    res.end(readFileSync(f))
  })
  await new Promise((r) => server.listen(5195, r))
}
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
const tracks = (process.env.TRACKS || 'norte,bosque,costa,sierra').split(',')
const runs = []
for (const id of tracks) for (const off of [-0.6, 0, 0.6]) runs.push([id, off])
const results = []
for (const [id, off] of runs) results.push(await (async () => {
  const page = await ctx.newPage()
  await page.goto(BASE || 'http://127.0.0.1:5195/peka-r/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__PEKA_R__)
  return page.evaluate(async ([id, off]) => {
    const g = window.__PEKA_R__
    g.startTrack(id); g.state = 'racing'; g.ui.hideCountdown(); g.lapStart = performance.now()
    const force = { throttle: 1, brake: 0, steer: 0, handbrake: false }
    g.input.getControls = () => force
    const path = g.track.path, N = path.length, half = (g.track.roadWidth || 12) / 2
    let ghost = 0, worstGhost = 0, backOut = 0, reversed = 0, progress = 0, lastI = 0, still = 0, worstStill = 0, recovers = 0
    const stalls = []
    const origRec = g.recoverCar.bind(g); g.recoverCar = () => {
      recovers++
      const p = g.car.getPosition(), q = path[lastI]
      if (stalls.length < 4) stalls.push({ i: lastI, lat: +Math.hypot(p.x - q.x, p.z - q.z).toFixed(1), y: +p.y.toFixed(2), w: g.car.wheelsOnGround(), up: +g.car.chassisBody.quaternion.vmult(new g.world.gravity.constructor(0,1,0)).y.toFixed(2), kmh: Math.round(g.car.speedKmh), steer: +force.steer.toFixed(2), thr: force.throttle, x: +p.x.toFixed(1), z: +p.z.toFixed(1), yaw: +Math.atan2(g.car.getForward().x, g.car.getForward().z).toFixed(2), contacts: g.world.contacts.filter(c => c.bi === g.car.chassisBody || c.bj === g.car.chassisBody).map(c => { const o = c.bi === g.car.chassisBody ? c.bj : c.bi; return { grp: o.collisionFilterGroup, ox: +o.position.x.toFixed(1), oz: +o.position.z.toFixed(1), oy: +o.position.y.toFixed(2) } }).slice(0, 3) })
      origRec()
    }
    // Deterministic sim: stop the render loop and step the same physics path at 60 Hz
    cancelAnimationFrame(g._raf)
    const dt = 1 / 60
    let simT = 0
    while (progress < N && simT < 240) {
      simT += dt
      const c = g.input.getControls()
      g.world.step(1 / 90, dt, 6); g.car.update(dt, c); g._updateCheckpoint(); g._guardPhysics(dt, c)
      const pos = g.car.getPosition()
      let bi = lastI, bd = Infinity
      for (let k = -15; k <= 40; k++) { const j = (lastI + k + N) % N; const d = (path[j].x - pos.x) ** 2 + (path[j].z - pos.z) ** 2; if (d < bd) { bd = d; bi = j } }
      let step = (bi - lastI + N) % N; if (step > N / 2) step -= N
      progress += step; lastI = bi
      const a = path[(bi + 6) % N], b = path[(bi + 7) % N]
      const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1
      const tx = a.x + (-dz / l) * off * half, tz = a.z + (dx / l) * off * half
      force.brake = 0
      const f = g.car.getForward()
      const cross = f.x * (tz - pos.z) - f.z * (tx - pos.x)
      force.steer = Math.max(-1, Math.min(1, -cross * 0.12))
      const d0 = path[(bi + 1) % N], d1 = path[(bi + 18) % N], d2 = path[(bi + 19) % N]
      const h0 = Math.atan2(d0.x - path[bi].x, d0.z - path[bi].z), h1 = Math.atan2(d2.x - d1.x, d2.z - d1.z)
      let turn = Math.abs(h1 - h0); if (turn > Math.PI) turn = 2 * Math.PI - turn
      const vmax = Math.max(30, 72 - turn * 45)
      force.throttle = g.car.speedKmh > vmax ? 0 : 1
      // Like a player: if nosed into a wall, reverse out with opposite lock (tests reverse too)
      if (backOut > 0) { backOut -= dt; force.throttle = 0; force.brake = 1; force.steer = -force.steer; reversed++ }
      else if (still > 0.8) { backOut = 1.2; still = 0 }
      const touchingWall = g.world.contacts.some((c) => (c.bi === g.car.chassisBody && c.bj.collisionFilterGroup === 2) || (c.bj === g.car.chassisBody && c.bi.collisionFilterGroup === 2))
      if (g.car.speedKmh < 2 && force.throttle && !touchingWall && simT > 2) { ghost += dt; worstGhost = Math.max(worstGhost, ghost) } else ghost = 0
      if (g.car.speedKmh < 2) { still += dt; worstStill = Math.max(worstStill, still) } else still = 0
    }
    const st = { y: +g.car.getPosition().y.toFixed(2), w: g.car.wheelsOnGround(), i: lastI, x: +g.car.getPosition().x.toFixed(1), z: +g.car.getPosition().z.toFixed(1) }
    return { worstGhost: +worstGhost.toFixed(2), reversed, stalls, id, off, lap: progress >= N, secs: Math.round(simT), worstStill: +worstStill.toFixed(2), recovers }
  }, [id, off]).finally(() => page.close())
})())
for (const r of results) console.log(JSON.stringify(r))
const bad = results.filter((r) => !r.lap || r.worstGhost > 1.0 || r.recovers > 0)
await browser.close(); server?.close()
console.log(bad.length ? 'LAP OFFSETS FAILED' : 'LAP OFFSETS PASSED'); if (bad.length) process.exitCode = 1
