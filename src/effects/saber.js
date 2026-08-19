export default {
  id: 'saber',
  name: 'Saber (energy glow)',
  category: '04 light',
  scope: 'both',
  params: {
    gain:     { type: 'float', min: 1, max: 120, step: 1, default: 40, label: 'Edge gain' },
    thin:     { type: 'float', min: 0, max: 1, step: 0.01, default: 0.45, label: 'Thinness' },
    core:     { type: 'float', min: 0, max: 1, step: 0.01, default: 0.55, label: 'Core threshold' },
    intensity:{ type: 'float', min: 0, max: 4, step: 0.01, default: 1.3, label: 'Glow intensity' },
    speed:    { type: 'float', min: 0, max: 8, step: 0.05, default: 1.6, label: 'Flicker speed' },
    electric: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.5, label: 'Electricity' },
    coreCol:  { type: 'color', default: [1.0, 0.98, 0.9], label: 'Core colour' },
    glowCol:  { type: 'color', default: [0.35, 0.7, 1.0], label: 'Glow colour' },
    spread:   { type: 'float', min: 0.5, max: 5, step: 0.1, default: 1.4, label: 'Edge sample spread' },
    draw:     { type: 'float', min: 0, max: 1.2, step: 0.005, default: 1.2, label: 'Draw front (L→R)', keyHint: true },
    drawSoft: { type: 'float', min: 0.005, max: 0.5, step: 0.005, default: 0.08, label: 'Draw softness' },
    audio:    { type: 'float', min: 0, max: 3, step: 0.01, default: 0, label: 'Audio-react (bass)' },
    keepImage:{ type: 'bool', default: true, label: 'Keep the photo under' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);

  // path = depth discontinuities (carving outlines). magnitude of the depth gradient.
  vec2 texel = (p_spread / uRes);
  float edge = length(depthGrad(uDepth, vUv, texel)) * p_gain;
  edge = pow(clamp(edge, 0.0, 1.0), 1.0 / (0.15 + p_thin));   // thin/fatten the line

  // travelling electricity along the line
  float flick = mix(1.0, fbm(vUv * uRes * 0.03 + vec2(uTime * p_speed, 0.0)), p_electric);
  float pulse = 0.85 + 0.15 * sin(uTime * (p_speed * 2.0) + vUv.x * 20.0);

  float core = smoothstep(p_core, 1.0, edge);
  float glow = edge * flick * pulse;

  // "draw it on" left→right: everything left of the front is lit
  float vis = smoothstep(p_draw + p_drawSoft, p_draw, vUv.x);
  core *= vis; glow *= vis;

  float aud = 1.0 + uAudioLow * p_audio;          // bass pumps the glow
  vec3 energy = p_coreCol * core + p_glowCol * glow * p_intensity * aud;

  vec3 baseCol = (p_keepImage > 0.5) ? src.rgb : vec3(0.0);
  float baseA  = (p_keepImage > 0.5) ? src.a : 0.0;

  vec3 col = baseCol + energy;                       // additive glow over the photo
  float a  = max(baseA, clamp(core + glow, 0.0, 1.0) * src.a);
  gl_FragColor = vec4(col, a);
}
`,
}
