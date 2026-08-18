export default {
  id: 'paper',
  name: 'Paper Ground',
  category: '00 ground',
  scope: 'global',
  params: {
    tint:    { type: 'color', default: [0.90, 0.92, 0.94], label: 'Paper colour' },
    grain:   { type: 'float', min: 0, max: 0.12, step: 0.001, default: 0.018, label: 'Grain' },
    fibers:  { type: 'float', min: 0, max: 0.12, step: 0.001, default: 0.022, label: 'Fibers' },
    fiberLen:{ type: 'float', min: 1, max: 60, step: 0.5, default: 18, label: 'Fiber length' },
    vignette:{ type: 'float', min: 0, max: 1, step: 0.01, default: 0.25, label: 'Vignette' },
  },
  frag: /* glsl */ `
void main(){
  vec4 top = texture2D(uTex, vUv);

  vec2 px = vUv * uRes;
  float grain  = (hash21(floor(px)) - 0.5) * p_grain;
  float fiber  = (fbm(vec2(px.x / max(p_fiberLen*uScale,1.0), px.y * 0.9)) - 0.5) * p_fibers;

  vec3 paper = p_tint + grain + fiber;

  vec2 q = (vUv - 0.5) * 2.0;
  paper *= 1.0 - p_vignette * (0.06 * q.y * q.y + 0.04 * q.x * q.x) * 6.0;

  // composite whatever is above over the paper
  gl_FragColor = vec4(mix(clamp(paper,0.0,1.0), top.rgb, top.a), 1.0);
}
`,
}
