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


## Instalar en Android

1. Descarga el APK de la [última release](https://github.com/pekapro-lab/peka-r/releases/latest) (`Peka-R-1.0.0.apk`).
2. En el teléfono: **Ajustes → Seguridad / Instalar aplicaciones desconocidas** → permite la app con la que lo descargaste (Chrome, Files…).
3. Abre el APK y pulsa **Instalar**. Si Play Protect avisa, elige **Instalar de todas formas** (la app no está en Play Store; está firmada por pekapro-lab).
4. Abre **Peka-R**. Gira el móvil a horizontal.

Android 7 o superior. No hace falta conexión para jugar (el juego va embebido en el APK).

También puedes jugar en el navegador: https://pekapro-lab.github.io/peka-r/

Para regenerar el APK: `npm run build:apk` y luego `cd android && ./gradlew assembleRelease`, o lanza el workflow **Build Android APK** / publica un tag `v*`.

## Licencia

Código propio de pekapro-lab. Sin marcas ni nombres de series/películas de terceros.
