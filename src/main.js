import './style.css'
import { UI } from './game/UI.js'
import { Game } from './game/Game.js'

const root = document.querySelector('#app')
const ui = new UI(root)
const game = new Game(root, ui)

// Expose for debugging / Playwright probes
window.__PEKA_R__ = game
// eslint-disable-next-line no-undef
window.__PEKA_R_VERSION__ = __PEKA_R_VERSION__
document.documentElement.dataset.version = __PEKA_R_VERSION__

ui.setMute(game.audio.muted)
ui.showMenu(true)
ui.showHud(false)

// App to background / tab hidden: pause the race and silence the engine; resume the audio context on return
document.addEventListener('visibilitychange', () => {
  const a = game.audio
  if (document.hidden) {
    if (game.state === 'racing') game.pause()
    a.silence(true)
    a.ctx?.suspend?.().catch(() => {})
  } else {
    a.ctx?.resume?.().catch(() => {})
  }
})
