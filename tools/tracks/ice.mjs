// 冰原极光: a rounded rectangle (four +90° corners) with esses that cancel out tucked into the sides, so the
// solved straights always come out positive and the loop never crosses itself.
export default [
  ['S', 560],                          // start: research station on the left
  ['A', 140, 45],                      // into the pine forest
  ['A', 90, -60], ['A', 90, 60],       // forest esses
  ['S', 120],
  ['A', 140, 45],
  ['S', 200],                          // out onto the frozen lake
  ['A', 300, 40], ['A', 300, -40],     // long S across the ice, past the frozen ship
  ['S', 150],
  ['A', 120, 90],
  ['S', 300],                          // the run-up and the crevasse jump
  ['A', 100, 30],                      // into the ice canyon
  ['A', 75, -75], ['A', 75, 75],       // canyon flick
  ['A', 100, -30],
  ['S', 'solve'],                      // under the glacier arch
  ['A', 130, 90],
  ['S', 'solve'],                      // tundra: radar dome, igloos
  ['A', 140, 90],                      // back onto the start straight
];
