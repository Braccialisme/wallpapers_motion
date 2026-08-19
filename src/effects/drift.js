export default {
  id: 'drift',
  name: 'Drift / Scroll',
  category: '01 deform',
  scope: 'both',
  params: {
    mode:   { type: 'select', options: ['span (from → to)', 'speed'], default: 0, label: 'Mode' },
    // span: set a start and end offset; the layer travels between them across the timeline
    fromX:  { type: 'float', min: -8000, max: 8000, step: 1, default: 0, label: 'From X px' },
    toX:    { type: 'float', min: -8000, max: 8000, step: 1, default: 400, label: 'To X px' },
    fromY:  { type: 'float', min: -4000, max: 4000, step: 1, default: 0, label: 'From Y px' },
    toY:    { type: 'float', min: -4000, max: 4000, step: 1, default: 0, label: 'To Y px' },
    // speed: constant velocity
    speedX: { type: 'float', min: -400, max: 400, step: 0.5, default: 12, label: 'Speed X px/s' },
    speedY: { type: 'float', min: -400, max: 400, step: 0.5, default: 0, label: 'Speed Y px/s' },
    wrap:   { type: 'bool', default: true, label: 'Wrap around' },
  },
  frag: /* glsl */ `
void main(){
  vec2 off;
  if (int(p_mode + 0.5) == 0) off = mix(vec2(p_fromX, p_fromY), vec2(p_toX, p_toY), uProgress);
  else                        off = vec2(p_speedX, p_speedY) * uTime;
  vec2 uv = vUv + off * uScale / uRes;
  if (p_wrap > 0.5) uv = fract(uv);
  else if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0); return; }
  gl_FragColor = texture2D(uTex, uv);
}
`,
}
