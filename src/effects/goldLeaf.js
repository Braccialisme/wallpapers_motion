export default {
  id: 'goldLeaf',
  name: 'Gold-leaf shimmer',
  category: '04 light',
  scope: 'both',
  params: {
    thresh:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0.55, label: 'Bright threshold' },
    goldOnly: { type: 'float', min: 0, max: 1, step: 0.01, default: 0.7, label: 'Warm/gold only' },
    speed:    { type: 'float', min: 0, max: 4, step: 0.02, default: 0.6, label: 'Light speed' },
    sharp:    { type: 'float', min: 1, max: 40, step: 0.5, default: 12, label: 'Sharpness' },
    intensity:{ type: 'float', min: 0, max: 3, step: 0.01, default: 1.0, label: 'Shimmer intensity' },
    spread:   { type: 'float', min: 0.5, max: 5, step: 0.1, default: 1.4, label: 'Relief spread' },
    audio:    { type: 'float', min: 0, max: 3, step: 0.01, default: 0, label: 'Audio-react (treble)' },
    tint:     { type: 'color', default: [1.0, 0.86, 0.45], label: 'Shimmer tint' },
  },
  frag: /* glsl */ `
void main(){
  vec4 src = texture2D(uTex, vUv);

  // a light direction that slowly rotates, raking across the surface relief
  vec2 texel = (p_spread / uRes);
  vec2 g = depthGrad(uDepth, vUv, texel);
  vec2 L = vec2(cos(uTime * p_speed), sin(uTime * p_speed));
  float rake = dot(normalize(g * 80.0 + vec2(0.0, 1e-3)), L) * 0.5 + 0.5;
  float spec = pow(clamp(rake, 0.0, 1.0), p_sharp);

  // where the gilding is: bright + warm
  float l = luma(src.rgb);
  float warm = clamp((src.r - src.b) * 3.0, 0.0, 1.0);
  float mask = smoothstep(p_thresh, 1.0, l) * mix(1.0, warm, p_goldOnly);

  float aud = 1.0 + uAudioHigh * p_audio;        // treble makes it twinkle
  vec3 col = src.rgb + p_tint * spec * mask * p_intensity * aud;
  gl_FragColor = vec4(col, src.a);
}
`,
}
