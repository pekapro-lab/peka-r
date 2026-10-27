/**
 * Regression: reverse gear + first-curve must not permanently kill acceleration.
 */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const PORT = 5188
const TRACKS = ['norte', 'bosque', 'costa', 'sierra']
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
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
})).newPage()
page.on('pageerror', (e) => console.error('PAGEERROR', e.message))
await page.goto(`http://127.0.0.1:${PORT}/peka-r/`, { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)

const failures = []
const results = []

for (const id of TRACKS) {
  const info = await page.evaluate(async (trackId) => {
    const g = window.__PEKA_R__
    g.timeOfDay = 'day'
    g.startTrack(trackId)
    g.state = 'racing'
    g.lapStart = performance.now()
    g.ui.hideCountdown()
    g.cameraMode = 'chase'

    let force = { throttle: 0, brake: 0, steer: 0, handbrake: false }
    g.input.getControls = () => force
    for (let i = 0; i < 40; i++) await new Promise((r) => requestAnimationFrame(r))

    // Reverse from rest
    force = { throttle: 0, brake: 1, steer: 0, handbrake: false }
    const before = { x: g.car.getPosition().x, z: g.car.getPosition().z }
    const fwd0 = g.car.getForward().clone()
    let gearR = false
    const tRev = performance.now()
    while (performance.now() - tRev < 2200) {
      if (g.car.gear === 'R') gearR = true
      await new Promise((r) => requestAnimationFrame(r))
    }
    const after = { x: g.car.getPosition().x, z: g.car.getPosition().z }
    const backed = Math.hypot(after.x - before.x, after.z - before.z)
    const alongForward = fwd0.x * (after.x - before.x) + fwd0.z * (after.z - before.z)

    // Fresh start for curve drive
    g.startTrack(trackId)
    g.state = 'racing'
    g.lapStart = performance.now()
    g.ui.hideCountdown()
    force = { throttle: 1, brake: 0, steer: 0, handbrake: false }
    g.input.getControls = () => force

    const t0 = performance.now()
    let maxSpeed = 0, longestDead = 0, deadAcc = 0, sunken = false
    while (performance.now() - t0 < 10000) {
      const pos = g.car.getPosition()
      const path = g.track.path
      let bestI = 0, bestD = Infinity
      for (let i = 0; i < path.length; i++) {
        const d = (path[i].x - pos.x) ** 2 + (path[i].z - pos.z) ** 2
        if (d < bestD) { bestD = d; bestI = i }
      }
      const look = path[(bestI + 5) % path.length]
      const forward = g.car.getForward()
      const cross = forward.x * (look.z - pos.z) - forward.z * (look.x - pos.x)
      force.steer = Math.max(-1, Math.min(1, -cross * 0.1))
      maxSpeed = Math.max(maxSpeed, g.car.speedKmh)
      if (pos.y < 0.15) sunken = true
      if (performance.now() - t0 > 2000 && g.car.speedKmh < 2 && force.throttle) {
        deadAcc += 1 / 60
        longestDead = Math.max(longestDead, deadAcc)
      } else deadAcc = 0
      await new Promise((r) => requestAnimationFrame(r))
    }

    // Recover then accelerate
    g._checkpointIndex = 0
    g.recoverCar()
    force = { throttle: 1, brake: 0, steer: 0, handbrake: false }
    const tw = performance.now()
    let driveOk = false
    let peakAfter = 0
    let wheelsAt = 0
    while (performance.now() - tw < 4500) {
      await new Promise((r) => requestAnimationFrame(r))
      peakAfter = Math.max(peakAfter, g.car.speedKmh)
      wheelsAt = g.car.wheelsOnGround()
      if (g.car.speedKmh > 15) { driveOk = true; break }
    }

    return {
      track: trackId,
      maxSpeed: Math.round(maxSpeed),
      sunken,
      longestDead: +longestDead.toFixed(2),
      permanentDead: longestDead >= 3.5,
      driveOk,
      peakAfter: Math.round(peakAfter),
      wheelsAt,
      reverse: { gearR, backed: +backed.toFixed(2), alongForward: +alongForward.toFixed(2) },
      finalY: +g.car.getPosition().y.toFixed(2),
    }
  }, id)

  results.push(info)
  console.log(JSON.stringify(info))
  const revOk = info.reverse.gearR && info.reverse.backed >= 1.5 && info.reverse.alongForward < 0
  if (info.permanentDead || info.sunken || !info.driveOk || !revOk) failures.push(info.track)
}

await browser.close(); server.close()
console.log('SUMMARY', JSON.stringify(results, null, 2))
if (failures.length) { console.error('FAILED', failures); process.exitCode = 1 }
else console.log('CURVE REGRESSION PASSED')
