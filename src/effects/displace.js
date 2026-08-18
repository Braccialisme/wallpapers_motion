export default {
  id: 'displace',
  name: 'Displace (depth)',
  category: '01 deform',
  scope: 'layer',
  params: {
    amount:   { type: 'float', min: -300, max: 300, step: 0.5, default: 30, label: 'Amount px' },
    amountY:  { type: 'float', min: -300, max: 300, step: 0.5, default: 10, label: 'Amount Y px' },
    swayX:    { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'Sway X' },
    swayY:    { type: 'float', min: -1, max: 1, step: 0.01, default: 0, label: 'Sway Y' },
    speed:    { type: 'float', min: 0, max: 2, step: 0.01, default: 0.12, label: 'Sway speed' },
    center:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Depth pivot' },
  },
  frag: /* glsl */ `
void main(){
  float d = texture2D(uDepth, vUv).r - p_center;
  float sx = p_swayX + sin(uTime * p_speed * 6.2831) * (1.0 - abs(p_swayX));
  float sy = p_swayY + cos(uTime * p_speed * 6.2831 * 0.77) * (1.0 - abs(p_swayY));
  vec2 off = vec2(p_amount * sx, p_amountY * sy) * d * uScale / uRes;
  gl_FragColor = texture2D(uTex, vUv + off);
}
`,
}
