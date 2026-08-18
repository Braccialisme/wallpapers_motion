export default {
  id: 'scatterReveal',
  name: 'Scatter Reveal',
  category: '02 reveal',
  scope: 'both',
  params: {
    driver:    { type: 'select', options: ['depth wave', 'scan X', 'scan Y', 'radial', 'point'], default: 0, label: 'Driver' },
    progress:  { type: 'float', min: 0, max: 1.2, step: 0.001, default: 0.5, label: 'Progress', keyHint: true },
    softness:  { type: 'float', min: 0.005, max: 0.8, step: 0.005, default: 0.14, label: 'Edge softness' },
    scatter:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0.55, label: 'Scatter' },
    grain:     { type: 'float', min: 0.2, max: 12, step: 0.05, default: 2.2, label: 'Grain size px' },
    clump:     { type: 'float', min: 0, max: 1, step: 0.01, default: 0.35, label: 'Clumping' },
    px:        { type: 'float', min: -0.5, max: 1.5, step: 0.005, default: 0.5, label: 'Point X' },
    py:        { type: 'float', min: -0.5, max: 1.5, step: 0.005, default: 0.5, label: 'Point Y' },
    radius:    { type: 'float', min: 0.02, max: 1.5, step: 0.01, default: 0.3, label: 'Point radius' },
    invert:    { type: 'bool', default: false, label: 'Invert' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);
  float d = texture2D(uDepth, vUv).r;

  // ---- driver: raw 0..1 field, reveal happens where field < progress ----
  float field;
  int drv = int(p_driver + 0.5);
  if (drv == 0)      field = 1.0 - d;                      // depth wavefront (near -> far)
  else if (drv == 1) field = vUv.x;                        // scan across
  else if (drv == 2) field = 1.0 - vUv.y;                  // scan down
  else if (drv == 3) field = length((vUv - 0.5) * vec2(uCanvas.x/uCanvas.y, 1.0)) * 0.8;
  else {
    vec2 q = (vUv - vec2(p_px, p_py)) * vec2(uCanvas.x/uCanvas.y, 1.0);
    field = length(q) / max(p_radius, 0.001);
  }

  // ---- stipple: scatter the threshold so it grains in rather than wipes ----
  vec2 gpx = vUv * uRes / max(p_grain * uScale, 0.35);
  float stip = mix(hash21(floor(gpx)), fbm(gpx * 0.25), p_clump);

  float thr = field + (stip - 0.5) * p_scatter;
  float m = sstep(thr - p_softness, thr + p_softness, p_progress);
  if (p_invert > 0.5) m = 1.0 - m;

  gl_FragColor = vec4(src.rgb, src.a * clamp(m, 0.0, 1.0));
}
`,
}
