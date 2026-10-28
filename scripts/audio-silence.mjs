/** Engine gain must drop to ~0 after pause, finish, menu and when the page is hidden. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => { let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/peka-r')) url = url.slice(7) || '/'; let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(5199, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 800, height: 450 } })
await page.goto('http://127.0.0.1:5199/peka-r/'); await page.waitForFunction(() => window.__PEKA_R__)
const res = await page.evaluate(async () => {
  const g = window.__PEKA_R__; const a = g.audio; await a.ensure(); a.muted = false
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const gain = () => +a._engine.gain.gain.value.toFixed(4)
  const drive = async () => { g.startTrack('norte'); await wait(200); g.state = 'racing'; g.ui.hideCountdown(); g.input.getControls = () => ({ throttle: 1, brake: 0, steer: 0, handbrake: false }); await wait(900); return gain() }
  const r = {}
  r.drivingA = await drive(); g.pause(); await wait(600); r.afterPause = gain()
  g.resume(); await wait(600); r.drivingB = gain()
  g.lap = g.totalLaps; g.state = 'finished'; a.silence(); await wait(600); r.afterFinish = gain()
  g.exitToMenu(); await wait(600); r.afterMenu = gain()
  r.drivingC = await drive()
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'))
  await wait(600); r.afterHidden = gain(); r.stateHidden = g.state
  delete g.input.getControls; return r
})
console.log(JSON.stringify(res))
const ok = res.drivingA > 0.05 && res.drivingB > 0.05 && res.drivingC > 0.05 && [res.afterPause, res.afterFinish, res.afterMenu, res.afterHidden].every((v) => v < 0.005) && res.stateHidden === 'paused'
await browser.close(); server.close()
console.log(ok ? 'AUDIO PASSED' : 'AUDIO FAILED'); if (!ok) process.exitCode = 1
