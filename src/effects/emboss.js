export default {
  id: 'emboss',
  name: 'Blind Emboss (ghost)',
  category: '03 surface',
  scope: 'layer',
  params: {
    ghost:    { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Ghost alpha' },
    relief:   { type: 'float', min: 0, max: 3, step: 0.01, default: 0.9, label: 'Relief' },
    lightAng: { type: 'float', min: 0, max: 6.283, step: 0.01, default: 2.4, label: 'Light angle' },
    tint:     { type: 'color', default: [0.90, 0.92, 0.94], label: 'Paper colour' },
    spread:   { type: 'float', min: 0.5, max: 6, step: 0.1, default: 1.6, label: 'Sample spread' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);

  // relief from the depth map, lit from an angle -> debossed-into-paper look
  vec2 texel = p_spread / uRes;
  vec2 g = depthGrad(uDepth, vUv, texel);
  vec2 L = vec2(cos(p_lightAng), sin(p_lightAng));
  float shade = dot(normalize(vec3(-g * 40.0, 1.0)), normalize(vec3(L, 0.75)));

  vec3 ghostCol = clamp(p_tint * (1.0 + (shade - 0.62) * p_relief), 0.0, 1.0);

  // fill in wherever the image is not (yet) revealed
  float need = (1.0 - src.a) * p_ghost;
  gl_FragColor = vec4(mix(ghostCol, src.rgb, src.a), clamp(src.a + need, 0.0, 1.0));
}
`,
}
