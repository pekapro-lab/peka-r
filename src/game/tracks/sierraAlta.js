export const sierraAlta = {
  id: 'sierra',
  name: 'Sierra Alta',
  description: 'Horquillas de montaña entre riscos y nieve.',
  laps: 3,
  roadWidth: 10,
  samplesPerSeg: 16,
  theme: 'mountain',
  roadColor: 0x2c3036,
  groundColor: 0x4e5a48,
  shoulderColor: 0x3e4a3a,
  barrierColor: 0x6e6660,
  hillColor: 0x455445,
  groundSize: 500,
  // Technical mountain: switchbacks and a tight chicane
  points: [
    { x: 0, z: -85 },
    { x: 30, z: -100 },
    { x: 65, z: -75 },
    { x: 50, z: -40 },   // hairpin prep
    { x: 85, z: -15 },
    { x: 70, z: 25 },
    { x: 35, z: 20 },    // chicane inward
    { x: 15, z: 50 },
    { x: 45, z: 85 },
    { x: 5, z: 105 },
    { x: -40, z: 90 },
    { x: -75, z: 55 },
    { x: -40, z: 25 },   // valley cut
    { x: -90, z: -5 },
    { x: -70, z: -45 },
    { x: -95, z: -75 },
    { x: -50, z: -95 },
    { x: -15, z: -90 },
  ],
}
