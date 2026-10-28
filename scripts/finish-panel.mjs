/** After crossing the line on the final lap the "Carrera terminada" panel must appear with Repetir + Menú, engine silent. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => { let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/peka-r')) url = url.slice(7) || '/'; let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(5296, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
await page.goto('http://127.0.0.1:5296/peka-r/'); await page.waitForFunction(() => window.__PEKA_R__)
const probe = () => page.evaluate(() => {
  const g = window.__PEKA_R__, vis = (s) => { const e = document.querySelector(s); return !!e && !e.closest('.hidden') && e.offsetParent !== null }
  return { state: g.state, panel: vis('#pause'), title: document.querySelector('#pause-title').textContent, resume: vis('#btn-resume'), restart: vis('#btn-restart'), menu: vis('#btn-menu'), results: document.querySelector('#pause-results')?.textContent || '', gain: g.audio._engine ? +g.audio._engine.gain.gain.value.toFixed(4) : null }
})
await page.evaluate(async () => {
  const g = window.__PEKA_R__; await g.audio.ensure(); g.audio.muted = false
  g.startTrack('norte'); await new Promise((r) => setTimeout(r, 200)); g.state = 'racing'; g.ui.hideCountdown()
  g.input.getControls = () => ({ throttle: 1, brake: 0, steer: 0, handbrake: false })
  await new Promise((r) => setTimeout(r, 800))
  // simulate crossing the line on the last lap: run the real lap logic
  g.lap = g.totalLaps; g.lapStart = performance.now() - 30000
  const p = g.track.path[2], b = g.car.chassisBody
  b.position.x = p.x; b.position.z = p.z; g._lastProgress = 0.95
})
await page.waitForTimeout(2500)
const after = await probe()
await page.screenshot({ path: '/workspace/finish.png' })
// Repetir → new race starts
await page.click('#btn-restart').catch(() => {})
await page.waitForTimeout(500)
const afterRestart = await probe()
console.log(JSON.stringify({ after, afterRestart }))
const ok = after.state === 'finished' && after.panel && after.title === 'Carrera terminada' && after.restart && after.menu && !after.resume && after.gain < 0.005 && /Total/.test(after.results) && afterRestart.state === 'countdown' && !afterRestart.panel
await browser.close(); server.close()
console.log(ok ? 'FINISH PASSED' : 'FINISH FAILED'); if (!ok) process.exitCode = 1
