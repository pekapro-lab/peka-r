import { circuitoNorte } from './circuitoNorte.js'
import { bosqueRojo } from './bosqueRojo.js'

export const TRACKS = [circuitoNorte, bosqueRojo]

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0]
}
