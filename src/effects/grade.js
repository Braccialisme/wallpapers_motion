export default {
  id: 'grade',
  name: 'Grade / Luminance',
  category: '04 color',
  scope: 'both',
  params: {
    exposure:   { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'Exposure' },
    contrast:   { type: 'float', min: 0, max: 2.5, step: 0.01, default: 1, label: 'Contrast' },
    saturation: { type: 'float', min: 0, max: 2, step: 0.01, default: 1, label: 'Saturation' },
    lift:       { type: 'float', min: -0.3, max: 0.3, step: 0.005, default: 0, label: 'Lift' },
    tintR:      { type: 'float', min: 0.5, max: 1.5, step: 0.01, default: 1, label: 'Tint R' },
    tintG:      { type: 'float', min: 0.5, max: 1.5, step: 0.01, default: 1, label: 'Tint G' },
    tintB:      { type: 'float', min: 0.5, max: 1.5, step: 0.01, default: 1, label: 'Tint B' },
    vignette:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'Vignette' },
  },
  frag: /* glsl */ `
void main(){
  vec4 s = texture2D(uTex, vUv);
  vec3 c = s.rgb;

  c *= pow(2.0, p_exposure);
  c = (c - 0.5) * p_contrast + 0.5 + p_lift;
  c = mix(vec3(luma(c)), c, p_saturation);
  c *= vec3(p_tintR, p_tintG, p_tintB);

  vec2 q = (vUv - 0.5) * 2.0;
  c *= 1.0 - p_vignette * dot(q, q) * 0.35;

  gl_FragColor = vec4(clamp(c, 0.0, 1.0), s.a);
}
`,
}
