/** Perf probe (not part of test:all): draw calls, triangles, lights and CPU-side render ms per track/mode. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0])
  if (url.startsWith('/peka-r')) url = url.slice(7) || '/'
  let f = join(ROOT, url === '/' ? 'index.html' : url)
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html')
  res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' })
  res.end(readFileSync(f))
})
await new Promise((r) => server.listen(5199, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })
const out = []
for (const mode of ['day', 'night']) for (const id of ['norte', 'bosque', 'costa', 'sierra']) {
  const page = await ctx.newPage()
  await page.addInitScript((m) => localStorage.setItem('peka-r-tod', m), mode)
  await page.goto('http://127.0.0.1:5199/peka-r/', { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__PEKA_R__)
  out.push(await page.evaluate(async (id) => {
    const g = window.__PEKA_R__
    g.startTrack(id); g.state = 'racing'; g.ui.hideCountdown()
    cancelAnimationFrame(g._raf); g._raf = 0
    g._updateCamera()
    let lights = 0, meshes = 0
    g.scene.traverse((o) => { if (o.isLight) lights++; if (o.isMesh) meshes++ })
    g.renderer.render(g.scene, g.camera)
    const t0 = performance.now(); const F = 20
    for (let i = 0; i < F; i++) { g.renderer.render(g.scene, g.camera); g.renderer.getContext().finish() }
    const ms = (performance.now() - t0) / F
    const inf = g.renderer.info.render
    return { id, calls: inf.calls, tris: inf.triangles, lights, meshes, pr: g.renderer.getPixelRatio(), ms: +ms.toFixed(1) }
  }, id).then((r) => ({ mode, ...r })))
  await page.close()
}
for (const r of out) console.log(JSON.stringify(r))
await browser.close(); server.close()
