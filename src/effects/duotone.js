export default {
  id: 'duotone',
  name: 'Duotone',
  category: '08 grade',
  scope: 'both',
  params: {
    shadow:  { type: 'color', default: [0.10, 0.09, 0.22], label: 'Shadow colour' },
    mid:     { type: 'color', default: [0.55, 0.32, 0.28], label: 'Mid colour' },
    high:    { type: 'color', default: [0.95, 0.82, 0.45], label: 'Highlight colour' },
    contrast:{ type: 'float', min: 0.2, max: 3, step: 0.01, default: 1.15, label: 'Contrast' },
    amount:  { type: 'float', min: 0, max: 1, step: 0.01, default: 1.0, label: 'Amount' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);
  float l = luma(src.rgb);
  l = clamp((l - 0.5) * p_contrast + 0.5, 0.0, 1.0);
  vec3 duo = (l < 0.5) ? mix(p_shadow, p_mid, l / 0.5)
                       : mix(p_mid, p_high, (l - 0.5) / 0.5);
  vec3 col = mix(src.rgb, duo, p_amount);
  gl_FragColor = vec4(col, src.a);
}
`,
}
