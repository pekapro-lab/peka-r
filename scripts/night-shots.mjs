import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync, writeFileSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/peka-r')) url = url.slice(7) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f))
})
await new Promise((r) => server.listen(5201, r))
const OUT = process.env.OUT || '/workspace'
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] })
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
const shots = [['night', 'norte', 40], ['night', 'bosque', 60], ['night', 'costa', 30], ['night', 'sierra', 50], ['day', 'sierra', 0]]
for (const [mode, id, at] of shots) {
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERR', e.message))
  await page.addInitScript((m) => localStorage.setItem('peka-r-tod', m), mode)
  await page.goto('http://127.0.0.1:5201/peka-r/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__PEKA_R__)
  await page.evaluate(([id, at, mode]) => {
    const g = window.__PEKA_R__
    g.startTrack(id); g.state = 'racing'; g.ui.hideCountdown()
    g.cameraMode = 'chase'
    const P = g.track.path, a = P[at], b = P[(at + 1) % P.length]
    g.car.teleport(a.x, 0.7, a.z, Math.atan2(b.x - a.x, b.z - a.z))
    for (let i = 0; i < 90; i++) { g.world.step(1 / 90, 1 / 60, 6); g.car.update(1 / 60, { throttle: 0, brake: 1, steer: 0, handbrake: true }) }
    if (mode === 'day') {
      // close-up 3/4 view of the new car
      const p = g.car.getPosition(), f = g.car.getForward()
      g.camera.position.set(p.x + f.x * 5.5 + f.z * 3.2, 1.9, p.z + f.z * 5.5 - f.x * 3.2)
      g.camera.fov = 45; g.camera.updateProjectionMatrix(); g.camera.lookAt(p.x, 0.5, p.z)
    } else for (let i = 0; i < 60; i++) g._updateCamera()
    g._updateCamera = () => {}
    g.state = 'paused'
  }, [id, at, mode])
  const file = `${OUT}/peka-r-1.0.5-${mode === 'day' ? 'coche-dia-sierra' : 'noche-' + id}.png`
  await page.waitForTimeout(900)
  await page.screenshot({ path: file })
  console.log(file)
  await page.close()
}
// Audio smoke test: engine graph builds and renders non-silent, bounded output offline
const page = await ctx.newPage()
await page.goto('http://127.0.0.1:5201/peka-r/', { waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__PEKA_R__)
const au = await page.evaluate(async () => {
  const g = window.__PEKA_R__
  const out = {}
  for (const [kmh, thr] of [[0, 0], [30, 1], [90, 1], [140, 1]]) {
    const off = new OfflineAudioContext(1, 44100 * 1, 44100)
    const a = Object.create(Object.getPrototypeOf(g.audio)); a.muted = false; a.ctx = off
    a._buildEngine(); for (let i = 0; i < 30; i++) a.setDriving({ speedKmh: kmh, throttle: thr, brake: 0 })
    const buf = await off.startRendering(); const d = buf.getChannelData(0)
    let peak = 0, rms = 0; for (let i = 22050; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); rms += d[i] * d[i] }
    out[`${kmh}kmh`] = { rpm: Math.round(a._rpm), peak: +peak.toFixed(3), rms: +Math.sqrt(rms / 22050).toFixed(3) }
  }
  return out
})
console.log('AUDIO', JSON.stringify(au))
await browser.close(); server.close()
