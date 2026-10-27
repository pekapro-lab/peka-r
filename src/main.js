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
