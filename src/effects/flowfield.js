export default {
  id: 'flowfield',
  name: 'Flow field (points)',
  category: '05 cloud',
  scope: 'layer',
  kind: 'points',
  params: {
    density: { type: 'int',   min: 128, max: 2048, step: 32, default: 800, label: 'Density (grid)', rebuild: true },
    scale:   { type: 'float', min: 0.3, max: 8, step: 0.05, default: 2.5, label: 'Field scale' },
    speed:   { type: 'float', min: 0, max: 3, step: 0.01, default: 0.5, label: 'Field drift' },
    flow:    { type: 'float', min: 0, max: 3, step: 0.01, default: 1.0, label: 'Stream length' },
    rate:    { type: 'float', min: 0, max: 3, step: 0.01, default: 0.6, label: 'Respawn rate' },
    heat:    { type: 'float', min: 0, max: 1, step: 0.01, default: 0.0, label: 'Heat tint' },
    size:    { type: 'float', min: 0.5, max: 16, step: 0.1, default: 2.2, label: 'Point size' },
    opacity: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.9, label: 'Opacity' },
    soft:    { type: 'float', min: 0.02, max: 1, step: 0.01, default: 0.7, label: 'Point softness' },
  },
  vert: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, aUv);
  vec3 col = src.rgb;

  float t = uTime * p_speed;
  vec2 pos = aUv;
  // integrate a few steps along the noise flow field
  for (int i = 0; i < 5; i++){
    float n = fbm(pos * p_scale + vec2(t, -t));
    float ang = n * 12.566;                 // 2*2pi
    pos += vec2(cos(ang), sin(ang)) * p_flow * 0.02;
  }

  // per-point life so the streams twinkle / respawn
  float life = fract(hash21(aUv * 13.0 + uSeed) + uTime * p_rate * 0.2);
  float a = smoothstep(0.0, 0.15, life) * smoothstep(1.0, 0.65, life) * src.a;

  vec2 p = pos * 2.0 - 1.0;
  vColor = mix(col, heatRamp(0.7), p_heat);
  vAlpha = a * p_opacity;
  gl_PointSize = src.a < 0.01 ? 0.0 : p_size * uScale;
  gl_Position  = vec4(p, 0.0, 1.0);
}
`,
}
