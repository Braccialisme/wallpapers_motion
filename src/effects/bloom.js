export default {
  id: 'bloom',
  name: 'Bloom',
  category: '09 post',
  scope: 'global',
  params: {
    threshold:{ type: 'float', min: 0, max: 1, step: 0.01, default: 0.65, label: 'Bright threshold' },
    radius:   { type: 'float', min: 1, max: 200, step: 1, default: 48, label: 'Radius px' },
    intensity:{ type: 'float', min: 0, max: 3, step: 0.01, default: 0.8, label: 'Intensity' },
  },
  frag: /* glsl */ `
void main(){
  vec3 base = texture2D(uTex, vUv).rgb;

  // single-pass approximate bloom: bright-pass over a golden-angle spiral of taps
  float rad = p_radius * uScale;
  vec2 px = rad / uRes;
  const int N = 24;
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = 0; i < N; i++){
    float fi = float(i);
    float a = fi * 2.399963;                      // golden angle
    float r = sqrt(fi / float(N));
    vec2 o = vec2(cos(a), sin(a)) * r * px;
    float w = 1.0 - r;                            // weight centre more
    vec3 c = texture2D(uTex, vUv + o).rgb;
    float b = max(0.0, luma(c) - p_threshold);
    sum += c * b * w;
    wsum += w;
  }
  vec3 bloom = sum / max(wsum, 1e-3) * p_intensity;
  gl_FragColor = vec4(base + bloom, 1.0);
}
`,
}
