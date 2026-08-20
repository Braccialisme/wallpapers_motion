export default {
  id: 'pointcloud',
  name: 'Point Cloud',
  category: '05 cloud',
  scope: 'layer',
  kind: 'points',
  params: {
    density:  { type: 'int',   min: 128, max: 2048, step: 32, default: 900, label: 'Density (grid)', rebuild: true },
    build:    { type: 'float', min: 0, max: 1.3, step: 0.001, default: 1.0, label: 'Build', keyHint: true },
    order:    { type: 'float', min: 0, max: 1, step: 0.01, default: 0.8, label: 'Depth order' },
    settle:   { type: 'float', min: 0.02, max: 0.8, step: 0.01, default: 0.3, label: 'Settle' },
    fly:      { type: 'float', min: 0, max: 0.6, step: 0.005, default: 0.12, label: 'Fly-in dist' },
    zdepth:   { type: 'float', min: 0, max: 1.2, step: 0.01, default: 0.0, label: 'Z depth' },
    persp:    { type: 'float', min: 0, max: 0.8, step: 0.01, default: 0.0, label: 'Perspective' },
    size:     { type: 'float', min: 0.5, max: 24, step: 0.1, default: 2.6, label: 'Point size' },
    sizeNear: { type: 'float', min: 0, max: 3, step: 0.01, default: 0, label: 'Size by depth' },
    soft:     { type: 'float', min: 0.02, max: 1, step: 0.01, default: 0.7, label: 'Point softness' },
    heat:     { type: 'float', min: 0, max: 1, step: 0.01, default: 0.6, label: 'Heat tint' },
    glow:     { type: 'float', min: 0, max: 2, step: 0.01, default: 0.5, label: 'In-flight glow' },
    cloudA:   { type: 'float', min: 0, max: 1, step: 0.01, default: 0, label: 'Cloud opacity (pre-build)' },
  },
  vert: /* glsl */ `
void main(){
  float d   = texture2D(uDepth, aUv).r;
  vec4  src = texture2D(uTex,   aUv);
  vec3  col = src.rgb;

  // reveal order: blend between pure random and strict depth order
  float rnd = hash21(aUv * 997.0 + uSeed);
  float key = mix(rnd, 1.0 - d, p_order);

  float a = clamp((p_build - key) / max(p_settle, 0.001), 0.0, 1.0);
  a = a * a * (3.0 - 2.0 * a);

  // fly-in: points arrive from a depth-scaled offset and settle onto their spot
  float ang = hash21(aUv * 431.0 + uSeed + 7.7) * 6.28318;
  float rad = (0.35 + 0.65 * abs(d - 0.5) * 2.0) * p_fly;
  vec2  off = vec2(cos(ang), sin(ang) * 0.6) * rad * (1.0 - a);

  vec2 p = aUv * 2.0 - 1.0 + off;

  float z = (d - 0.5) * p_zdepth;
  float s = 1.0 / (1.0 - z * p_persp);
  p *= s;

  vColor = mix(heatRamp(1.0 - d), col, a);
  vColor *= 1.0 + p_glow * (1.0 - a);
  // carry the source alpha so empty areas of the layer never emit points.
  // cloudA keeps the un-built points VISIBLE (as the abstract scatter cloud) so they
  // read as a cloud from the start and then resolve into the photo as build rises.
  vAlpha = mix(a, 1.0, p_cloudA) * src.a;

  gl_PointSize = src.a < 0.01 ? 0.0 : p_size * uScale * s * (1.0 + p_sizeNear * (d - 0.5));
  gl_Position  = vec4(p, 0.0, 1.0);
}
`,
}
