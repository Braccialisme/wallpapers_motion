export default {
  id: 'relight',
  name: 'Relight (moving light)',
  category: '04 light',
  scope: 'both',
  params: {
    lightAng:  { type: 'float', min: 0, max: 6.283, step: 0.01, default: 0.8, label: 'Light angle' },
    elev:      { type: 'float', min: 0.05, max: 1.5, step: 0.01, default: 0.6, label: 'Light height' },
    height:    { type: 'float', min: 0, max: 4, step: 0.01, default: 1.2, label: 'Relief height' },
    diffuse:   { type: 'float', min: 0, max: 2, step: 0.01, default: 1.0, label: 'Diffuse' },
    specular:  { type: 'float', min: 0, max: 2, step: 0.01, default: 0.35, label: 'Specular' },
    shininess: { type: 'float', min: 2, max: 128, step: 1, default: 32, label: 'Shininess' },
    ambient:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0.35, label: 'Ambient' },
    shadow:    { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Self-shadow' },
    move:      { type: 'float', min: 0, max: 2, step: 0.01, default: 0, label: 'Auto-orbit speed' },
    tint:      { type: 'color', default: [1.0, 0.96, 0.88], label: 'Light colour' },
    spread:    { type: 'float', min: 0.5, max: 4, step: 0.1, default: 1.2, label: 'Normal spread' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);

  // surface normal from the depth heightfield
  vec2 texel = p_spread / uRes;
  vec2 g = depthGrad(uDepth, vUv, texel) * (p_height * 60.0);
  vec3 n = normalize(vec3(-g.x, -g.y, 1.0));

  // light direction (optionally orbiting)
  float ang = p_lightAng + uTime * p_move;
  vec3 L = normalize(vec3(cos(ang) * cos(p_elev), sin(ang) * cos(p_elev), sin(p_elev)));
  vec3 V = vec3(0.0, 0.0, 1.0);

  float diff = max(dot(n, L), 0.0);
  float spec = pow(max(dot(reflect(-L, n), V), 0.0), p_shininess);

  // cheap self-shadow: march the heightfield toward the light, occluded if it rises above the ray
  float sh = 0.0;
  if (p_shadow > 0.001) {
    float h0 = texture2D(uDepth, vUv).r * p_height;
    vec2 step = L.xy * texel * 3.0;
    float occ = 0.0;
    for (int i = 1; i <= 10; i++){
      vec2 suv = vUv + step * float(i);
      float hs = texture2D(uDepth, suv).r * p_height;
      float rayH = h0 + L.z * float(i) * 0.02;
      occ = max(occ, clamp((hs - rayH) * 6.0, 0.0, 1.0));
    }
    sh = occ * p_shadow;
  }

  float lit = p_ambient + diff * p_diffuse * (1.0 - sh);
  vec3 col = src.rgb * lit + p_tint * spec * p_specular * (1.0 - sh);
  gl_FragColor = vec4(col, src.a);
}
`,
}
