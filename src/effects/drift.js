export default {
  id: 'drift',
  name: 'Drift / Scroll',
  category: '01 deform',
  scope: 'both',
  params: {
    speedX: { type: 'float', min: -400, max: 400, step: 0.5, default: 10, label: 'Speed X px/s' },
    speedY: { type: 'float', min: -400, max: 400, step: 0.5, default: 0, label: 'Speed Y px/s' },
    wrap:   { type: 'bool', default: true, label: 'Wrap' },
  },
  frag: /* glsl */ `
void main(){
  vec2 off = vec2(p_speedX, p_speedY) * uTime * uScale / uRes;
  vec2 uv = vUv + off;
  if (p_wrap > 0.5) uv = fract(uv);
  else if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texture2D(uTex, uv);
}
`,
}
