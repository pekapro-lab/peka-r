/** Launch from standstill with full throttle, zero steer: heading must stay straight (launch-assist torque regression). */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => { let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/peka-r')) url = url.slice(7) || '/'; let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(5198, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
await page.goto('http://127.0.0.1:5198/peka-r/'); await page.waitForFunction(() => window.__PEKA_R__)
const tracks = await page.evaluate(() => [...document.querySelectorAll('[data-track]')].map((e) => e.dataset.track))
const ids = tracks.length ? [...new Set(tracks)] : ['sierra']
const out = []
for (const id of ['sierra', 'bosque', 'costa', 'norte']) {
  out.push(await page.evaluate(async (id) => {
    const g = window.__PEKA_R__; g.timeOfDay = 'day'; g.startTrack(id)
    await new Promise((r) => setTimeout(r, 300))
    g.state = 'racing'; g.ui.hideCountdown()
    g.input.getControls = () => ({ throttle: 1, brake: 0, steer: 0, handbrake: false })
    const b = g.car.chassisBody
    const yaw = () => { const v = new b.position.constructor(); b.vectorToWorldFrame(new v.constructor(0, 0, 1), v); return Math.atan2(v.x, v.z) * 180 / Math.PI }
    const y0 = yaw(); let maxW = 0
    const t0 = performance.now()
    while (performance.now() - t0 < 1500) { await new Promise((r) => requestAnimationFrame(r)); maxW = Math.max(maxW, Math.abs(b.angularVelocity.y)) }
    let d = yaw() - y0; d = ((d + 540) % 360) - 180
    const r = { id, yawDeltaDeg: +d.toFixed(2), maxYawRate: +maxW.toFixed(3), kmh: +g.car.speedKmh.toFixed(1) }
    delete g.input.getControls; g.exitToMenu(); return r
  }, id))
}
console.log(JSON.stringify(out))
const ok = out.every((r) => Math.abs(r.yawDeltaDeg) < 3)
await browser.close(); server.close()
console.log(ok ? 'LAUNCH PASSED' : 'LAUNCH FAILED'); if (!ok) process.exitCode = 1
