export default {
  id: 'filmgrade',
  name: 'Film grade (grain + halation)',
  category: '09 post',
  scope: 'global',
  params: {
    contrast: { type: 'float', min: 0.5, max: 2, step: 0.01, default: 1.06, label: 'Contrast' },
    sat:      { type: 'float', min: 0, max: 2, step: 0.01, default: 1.05, label: 'Saturation' },
    chroma:   { type: 'float', min: 0, max: 12, step: 0.1, default: 2.0, label: 'Chromatic edge px' },
    halation: { type: 'float', min: 0, max: 2, step: 0.01, default: 0.5, label: 'Halation' },
    grain:    { type: 'float', min: 0, max: 0.2, step: 0.001, default: 0.04, label: 'Grain' },
    vignette: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.3, label: 'Vignette' },
  },
  frag: /* glsl */ `
void main(){
  vec2 uv = vUv;
  vec2 dir = uv - 0.5;

  // chromatic aberration on the R/B channels, growing toward the edges
  float ca = p_chroma * uScale / uRes.x;
  vec3 col;
  col.r = texture2D(uTex, uv + dir * ca).r;
  col.g = texture2D(uTex, uv).g;
  col.b = texture2D(uTex, uv - dir * ca).b;

  // contrast + saturation
  col = (col - 0.5) * p_contrast + 0.5;
  float l = luma(col);
  col = mix(vec3(l), col, p_sat);

  // halation: warm bleed from the bright areas
  vec3 hal = vec3(0.0);
  for (int i = 0; i < 8; i++){
    float a = float(i) * 0.7853981;
    vec2 o = vec2(cos(a), sin(a)) * 9.0 * uScale / uRes;
    hal += max(vec3(0.0), texture2D(uTex, uv + o).rgb - 0.6);
  }
  col += hal / 8.0 * p_halation * vec3(1.0, 0.7, 0.5);

  // grain (animated) + vignette
  col += (hash21(uv * uRes + vec2(uTime * 60.0)) - 0.5) * p_grain;
  col *= clamp(1.0 - p_vignette * dot(dir, dir) * 1.8, 0.0, 1.0);

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
}
