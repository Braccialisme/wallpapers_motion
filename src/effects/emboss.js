export default {
  id: 'emboss',
  name: 'Blind Emboss (ghost)',
  category: '03 surface',
  scope: 'layer',
  params: {
    tint:     { type: 'color', default: [0.93, 0.89, 0.82], label: 'Un-revealed colour' },
    ghost:    { type: 'float', min: 0, max: 1, step: 0.01, default: 1.0, label: 'Colour vs image' },
    relief:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Deboss depth' },
    lightAng: { type: 'float', min: 0, max: 6.283, step: 0.01, default: 2.4, label: 'Light angle' },
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

  // the chosen colour is the BASE; relief only adds a gentle light/dark deboss on top,
  // so the un-revealed area stays the colour you picked (not dragged toward grey/black)
  vec3 ghostCol = clamp(p_tint + (shade - 0.62) * p_relief * 0.35, 0.0, 1.0);

  // coverage = the image footprint; paint only inside it, and OPAQUE, so stacked layers
  // and the paper below never bleed through (that was the muddy opacity)
  float cov = texture2D(uCover, vUv).a;
  vec3 hidden = mix(src.rgb, ghostCol, p_ghost);      // 1 = pure colour, 0 = show the image faded
  vec3 col = mix(hidden, src.rgb, clamp(src.a, 0.0, 1.0));
  gl_FragColor = vec4(col, cov);
}
`,
}
