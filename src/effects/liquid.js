export default {
  id: 'liquid',
  name: 'Liquid warp',
  category: '01 deform',
  scope: 'both',
  params: {
    amount: { type: 'float', min: 0, max: 120, step: 1, default: 24, label: 'Amount px' },
    scale:  { type: 'float', min: 0.3, max: 6, step: 0.05, default: 2.0, label: 'Scale' },
    speed:  { type: 'float', min: 0, max: 2, step: 0.01, default: 0.3, label: 'Speed' },
    swirl:  { type: 'float', min: 0, max: 2, step: 0.01, default: 0.6, label: 'Swirl' },
  },
  frag: /* glsl */ `
void main(){
  vec2 uv = vUv;
  float t = uTime * p_speed;
  // two-tap domain warp -> flowing liquid
  vec2 w = vec2(fbm(uv * p_scale + vec2(0.0, t)),
                fbm(uv * p_scale + vec2(5.2, -t)));
  vec2 w2 = vec2(fbm(uv * p_scale * 1.7 + w * p_swirl + vec2(t)),
                 fbm(uv * p_scale * 1.7 - w * p_swirl + vec2(3.1)));
  vec2 off = (w2 - 0.5) * p_amount * uScale / uRes;
  gl_FragColor = texture2D(uTex, uv + off);
}
`,
}
