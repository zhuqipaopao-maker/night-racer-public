// 胶片公路: sakura park → pink grass meadow → seaside promenade → volcano grassland → Chongqing night streets →
// the stadium and back to the line. Same rounded-rectangle idea as ice: the esses cancel out, the corners add to 360°.
export default [
  ['S', 600],                          // start under the cherry trees
  ['A', 150, 45],
  ['A', 100, -50], ['A', 100, 50],     // park esses
  ['A', 150, 45],
  ['S', 220],                          // into the pink grass
  ['A', 260, 30], ['A', 260, -30],     // a slow S through the pink sea
  ['S', 120],
  ['A', 140, 90],                      // down to the water
  ['S', 420],                          // seaside promenade: ferris wheel, towers across the bay
  ['A', 200, 45],                      // out onto the volcano grassland
  ['A', 300, -30], ['A', 300, 30],     // fast open sweepers
  ['S', 'solve'],
  ['A', 160, 45],                      // into the city
  ['A', 50, 90], ['S', 140], ['A', 50, -90],   // Chongqing: a tight chicane between the buildings
  ['S', 'solve'],                      // the neon street, the monorail overhead
  ['A', 150, 90],                      // past the stadium, back to the line
];
