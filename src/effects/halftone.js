export default {
  id: 'halftone',
  name: 'Halftone / Riso',
  category: '08 grade',
  scope: 'both',
  params: {
    cell:   { type: 'float', min: 2, max: 40, step: 0.5, default: 6, label: 'Dot size px' },
    angle:  { type: 'float', min: 0, max: 1.57, step: 0.01, default: 0.4, label: 'Screen angle' },
    levels: { type: 'float', min: 2, max: 16, step: 1, default: 5, label: 'Posterize levels' },
    amount: { type: 'float', min: 0, max: 1, step: 0.01, default: 1.0, label: 'Amount' },
    paper:  { type: 'color', default: [0.98, 0.97, 0.94], label: 'Paper colour' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);

  // posterize the colour (riso banding)
  vec3 q = floor(src.rgb * p_levels + 0.5) / p_levels;

  // rotated dot screen; dot grows as the tone darkens
  float cell = max(p_cell * uScale, 1.0);
  float ca = cos(p_angle), sa = sin(p_angle);
  vec2 p = vUv * uRes;
  vec2 pr = vec2(p.x * ca - p.y * sa, p.x * sa + p.y * ca);
  vec2 g = fract(pr / cell) - 0.5;
  float d = length(g) * 2.0;
  float tone = 1.0 - luma(q);
  float dot = smoothstep(tone + 0.08, tone - 0.08, d);   // inside dot -> 1

  vec3 ht = mix(p_paper, q, dot);
  vec3 col = mix(src.rgb, ht, p_amount);
  gl_FragColor = vec4(col, src.a);
}
`,
}
