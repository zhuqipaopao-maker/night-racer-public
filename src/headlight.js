import * as THREE from 'three';

// Headlight that lights only the road (and roadside meshes it's applied to), done inside their shaders:
// a widening beam in front of the player's car that multiplies the surface colour, so texture and edges
// read in the dark. Other cars are never touched (no glare on their tails).
export const beam = {
  pos: { value: new THREE.Vector3() },
  dir: { value: new THREE.Vector2(0, 1) },
  strength: { value: 0 },
};

export function applyHeadlight(material) {
  if (material.userData.headlight) return;
  material.userData.headlight = true;
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.hlPos = beam.pos; sh.uniforms.hlDir = beam.dir; sh.uniforms.hlStr = beam.strength;
    sh.vertexShader = 'varying vec3 vHlWorld;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
      vHlWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = 'uniform vec3 hlPos; uniform vec2 hlDir; uniform float hlStr; varying vec3 vHlWorld;\n' +
      sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      {
        vec3 d = vHlWorld - hlPos;
        float f = dot(d.xz, hlDir), side = dot(d.xz, vec2(-hlDir.y, hlDir.x));
        float w = 2.2 + max(f, 0.0) * 0.28;                       // the beam spreads as it goes
        float along = smoothstep(-1.5, 3.0, f) * (1.0 - smoothstep(30.0, 70.0, f));
        float across = exp(-(side * side) / (w * w));
        float up = 1.0 - smoothstep(1.5, 4.5, d.y);               // low beam: lights the ground and kerb height
        float k = hlStr * along * across * up / (1.0 + max(f, 0.0) * 0.035);
        gl_FragColor.rgb += diffuseColor.rgb * vec3(1.0, 0.96, 0.88) * k;
      }`);
  };
  material.needsUpdate = true;
}
