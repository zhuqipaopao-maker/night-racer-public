import * as THREE from 'three';

// Exponential height fog layered on top of three's distance fog: dense in the valleys, thinning with
// altitude, with gentle patchiness. Patches the shared fog shader chunks, so call it before anything
// is rendered. Uses the analytic integral of density c·e^(−b·(y−base)) along the view ray.
export function installHeightFog({ base = 0, falloff = 0.045, density = 0.0075, color = [0.8, 0.71, 0.76] } = {}) {
  const f = v => Number(v).toFixed(6);
  THREE.ShaderChunk.fog_pars_vertex = `#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = `#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  #ifdef USE_INSTANCING
    vFogWorld = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;
  #else
    vFogWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
  #endif
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth;\n\tvarying vec3 vFogWorld;');
  THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(/#endif\s*$/, `
  {
    vec3 rd = vFogWorld - cameraPosition;
    float L = length( rd );
    float dy = rd.y / max( L, 1e-4 );
    float b = ${f(falloff)};
    float c = ${f(density)} * ( 0.72 + 0.28 * sin( vFogWorld.x * 0.011 ) * sin( vFogWorld.z * 0.0137 + 1.3 ) );
    float t = dy * b * L;
    float amount = c * exp( - ( cameraPosition.y - ${f(base)} ) * b ) * L * ( abs( t ) > 1e-4 ? ( 1.0 - exp( - t ) ) / t : 1.0 );
    float hf = 1.0 - exp( - amount );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, vec3( ${color.map(f).join(', ')} ), clamp( hf, 0.0, 0.93 ) );
  }
#endif
`);
}
