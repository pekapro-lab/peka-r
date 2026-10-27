import { circuitoNorte } from './circuitoNorte.js'
import { bosqueRojo } from './bosqueRojo.js'
import { costaDorada } from './costaDorada.js'
import { sierraAlta } from './sierraAlta.js'

export const TRACKS = [circuitoNorte, bosqueRojo, costaDorada, sierraAlta]

export function getTrack(id) {
  return TRACKS.find((t) => t.id === id) || TRACKS[0]
}
