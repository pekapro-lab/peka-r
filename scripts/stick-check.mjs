/** Mobile: analog stick gives proportional steer; screenshot for visual check. */
import { chromium } from 'playwright'
import { createServer } from 'http'
import { readFileSync, existsSync, statSync } from 'fs'
import { join, extname } from 'path'
import { fileURLToPath } from 'url'
const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'dist')
const server = createServer((req, res) => { let url = decodeURIComponent(req.url.split('?')[0]); if (url.startsWith('/peka-r')) url = url.slice(7) || '/'; let f = join(ROOT, url === '/' ? 'index.html' : url); if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, 'index.html'); res.writeHead(200, { 'Content-Type': { '.js': 'text/javascript', '.html': 'text/html', '.css': 'text/css' }[extname(f)] || 'application/octet-stream' }); res.end(readFileSync(f)) })
await new Promise((r) => server.listen(5197, r))
const browser = await chromium.launch({ args: ['--use-gl=swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage()
await page.goto(process.env.URL || 'http://127.0.0.1:5197/peka-r/'); await page.waitForFunction(() => window.__PEKA_R__)
await page.evaluate(() => { const g = window.__PEKA_R__; g.timeOfDay = 'day'; g.startTrack('sierra'); g.state = 'racing'; g.ui.hideCountdown(); g.ui.showTouch?.(true); document.querySelector('#touch')?.classList.remove('hidden') })
await page.waitForTimeout(800)
const box = await page.locator('#stick').boundingBox()
const cx = box.x + box.width / 2, cy = box.y + box.height / 2
await page.evaluate(() => { window.__xs = []; document.querySelector('#stick').addEventListener('pointermove', (e) => window.__xs.push(e.clientX)); document.querySelector('#stick').addEventListener('pointerdown', (e) => window.__xs.push('d' + e.clientX)) })
const vals = []
const cdp = await page.context().newCDPSession(page)
const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: cy, id: 1 }] })
await touch('touchStart', cx)
for (const f of [-1, -0.5, -0.25, 0, 0.25, 0.5, 1]) { await touch('touchMove', cx + f * box.width / 2); vals.push([f, +(await page.evaluate(async () => { for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r)); return window.__PEKA_R__.input.getControls().steer })).toFixed(2)]) }
await touch('touchMove', cx - box.width * 0.3)
await page.screenshot({ path: '/workspace/stick.png' })
await touch('touchEnd', cx)
const after = await page.evaluate(() => window.__PEKA_R__.input.getControls().steer)
console.log(JSON.stringify({ vals, afterRelease: after, cx, xs: await page.evaluate(() => window.__xs) }))
const ok = vals[0][1] > 0.9 && vals[6][1] < -0.9 && vals[1][1] > 0.3 && vals[1][1] < 0.7 && vals[3][1] === 0 && after === 0
await browser.close(); server.close()
console.log(ok ? 'STICK PASSED' : 'STICK FAILED'); if (!ok) process.exitCode = 1
