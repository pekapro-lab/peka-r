# Peka-R

Juego de carreras 3D en el navegador: conduce un muscle car negro de los 80, largo y bajo, con una barra de luces rojas animada en el morro. Vista principal desde el capó y cámara de persecución opcional.

**Jugar:** https://pekapro-lab.github.io/peka-r/

## Controles

| Acción | Teclado | Táctil |
|--------|---------|--------|
| Acelerar | W / ↑ | Botón ▲ |
| Frenar / marcha atrás | S / ↓ | Botón ▼ |
| Girar | A D / ← → | ◀ ▶ |
| Freno de mano | Espacio | FRENO DE MANO |
| Cambiar cámara | C | Botón C |
| Pausa | P / Esc | Botón Ⅱ |
| Silencio | M | Botón sonido |

## Circuitos

- **Circuito Norte** — anillo urbano con tribunas
- **Bosque Rojo** — trazado técnico entre pinos
- **Costa Dorada** — circuito costero abierto entre dunas y mar
- **Sierra Alta** — montaña técnica con horquillas y rocas

En el menú puedes elegir **Día** o **Noche** (se recuerda en el navegador). Los mejores tiempos de vuelta se guardan por circuito (`localStorage`).

## Tecnologías

- Vite + Three.js + cannon-es (vehículo con raycast)
- Sonido de motor sintético con Web Audio (sin archivos externos)
- Assets procedurales

## Desarrollo

```bash
npm install
npm run dev
npm run build
```

La base de Vite es `/peka-r/` para GitHub Pages.

## Licencia

Código propio de pekapro-lab. Sin marcas ni nombres de series/películas de terceros.
