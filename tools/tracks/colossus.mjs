// 巨像遗迹 · 苔藓古林 Colossus Ruins: one ~6 km lap through a mossy old-growth forest swallowing fallen and standing
// colossi. Rounded-rectangle loop (the corners add to 360°, the esses cancel out) so the solved straights stay positive.
export default [
  ['S', 'solve'],                      // start/finish between the legs of the standing (broken) colossus
  ['A', 280, -40], ['A', 280, 40],     // misty pine forest: puddles across the forest floor, mossy fallen pines
  ['A', 160, 50],
  ['A', 110, -70], ['A', 110, 70],     // moss forest esses: stumps, mushrooms, ferns
  ['S', 380],                          // the waterfall and the mossy stone bridge
  ['A', 180, 40],
  ['S', 520],                          // up the fallen colossus's arm, and the jump off its hand
  ['A', 220, 90],
  ['S', 160],
  ['A', 260, -35], ['A', 260, 35],     // under the propped-up head
  ['S', 420],                          // the colossus's torso and broken columns in the moss
  ['A', 90, -60], ['A', 90, 60],       // fallen logs and columns chicane
  ['A', 200, 45],
  ['S', 320],                          // redwood cathedral: giant trees either side
  ['A', 140, -50], ['A', 140, 50],     // fern gully
  ['S', 220],                          // through the hollow fallen giant
  ['A', 200, 45],
  ['A', 300, 30], ['A', 300, -30],     // climbing through the forest to the cliff temple
  ['S', 'solve'],                      // the temple at the top, then the dive down the steps
  ['A', 140, 45], ['A', 120, -45],
  ['A', 150, 90],                      // back onto the start straight
];

// a meandering forest track: the line sways a few metres either way (the first 120 m stay straight for the grid)
export const wiggle = { amp: 6, from: 120 };
