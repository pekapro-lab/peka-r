import './style.css'
import { UI } from './game/UI.js'
import { Game } from './game/Game.js'

const root = document.querySelector('#app')
const ui = new UI(root)
const game = new Game(root, ui)

// Expose for debugging / Playwright probes
window.__PEKA_R__ = game

ui.setMute(game.audio.muted)
ui.showMenu(true)
ui.showHud(false)
