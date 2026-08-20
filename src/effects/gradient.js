export default {
  id: 'gradient',
  name: 'Motion gradient',
  category: '05 gradient',
  scope: 'both',
  params: {
    c1:     { type: 'color', default: [0.10, 0.06, 0.35], label: 'Colour 1' },
    c2:     { type: 'color', default: [0.85, 0.25, 0.45], label: 'Colour 2' },
    c3:     { type: 'color', default: [0.98, 0.78, 0.35], label: 'Colour 3' },
    scale:  { type: 'float', min: 0.2, max: 6, step: 0.05, default: 1.6, label: 'Scale' },
    speed:  { type: 'float', min: 0, max: 2, step: 0.01, default: 0.25, label: 'Flow speed' },
    warp:   { type: 'float', min: 0, max: 2, step: 0.01, default: 0.8, label: 'Warp' },
    grain:  { type: 'float', min: 0, max: 0.15, step: 0.001, default: 0.02, label: 'Grain' },
    amount: { type: 'float', min: 0, max: 1, step: 0.01, default: 1.0, label: 'Amount (0=image,1=gradient)' },
    screen: { type: 'bool', default: false, label: 'Screen over image' },
  },
  frag: /* glsl */ `
void main(){
  vec4 base = texture2D(uTex, vUv);
  vec2 uv = vUv * vec2(uRes.x / uRes.y, 1.0) * p_scale;
  float tm = uTime * p_speed;

  // domain-warped flow — the mesh-gradient look
  vec2 w = vec2(fbm(uv + vec2(0.0, tm)), fbm(uv + vec2(5.2, -tm)));
  float a = fbm(uv * 0.8 + w * p_warp + tm * 0.6);
  float b = fbm(uv * 0.6 - w * p_warp - tm * 0.4 + 3.1);

  vec3 g = mix(p_c1, p_c2, smoothstep(0.15, 0.85, a));
  g = mix(g, p_c3, smoothstep(0.30, 0.90, b));
  g += (hash21(vUv * uRes) - 0.5) * p_grain;
  g = clamp(g, 0.0, 1.0);

  vec3 col;
  if (p_screen > 0.5) col = 1.0 - (1.0 - base.rgb) * (1.0 - g * p_amount);   // screen over image
  else                col = mix(base.rgb, g, p_amount);

  float alpha = (p_amount > 0.99 && p_screen < 0.5) ? 1.0 : max(base.a, p_amount);
  gl_FragColor = vec4(col, alpha);
}
`,
}
