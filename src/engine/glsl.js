// Shared GLSL available to every effect. Keep additions here so all effects benefit.

export const PRELUDE = /* glsl */ `
precision highp float;

uniform sampler2D uTex;     // input color (previous pass / source image)
uniform sampler2D uDepth;   // depth map for this layer (0=far, 1=near)
uniform vec2  uRes;         // current render resolution in px
uniform vec2  uCanvas;      // project canvas size in px (e.g. 4550x1000)
uniform float uTime;        // seconds
uniform float uProgress;    // 0..1 across the timeline
uniform float uScale;       // renderW / canvasW  -> scale pixel-based params
uniform float uSeed;
uniform sampler2D uTouch;   // canvas-space: time the cursor first reached each pixel
uniform float uHasTouch;    // 1 if a cursor path exists
uniform sampler2D uCover;   // the layer's ORIGINAL placed image (alpha = image footprint)
uniform vec4 uFrameRect;    // export frame within the rendered world: x,y,w,h (normalised)
uniform float uAudio;       // overall audio level 0..1 (0 when audio off)
uniform float uAudioLow;    // bass band 0..1
uniform float uAudioMid;    // mid band 0..1
uniform float uAudioHigh;   // treble band 0..1

varying vec2 vUv;

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i+vec2(0,0)), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for(int i=0;i<5;i++){ v += a*vnoise(p); p *= 2.02; a *= 0.5; }
  return v;
}

float sstep(float a, float b, float x){ return smoothstep(a, b, x); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// depth gradient -> surface normal-ish, for relief/emboss lighting
vec2 depthGrad(sampler2D d, vec2 uv, vec2 texel){
  float l = texture2D(d, uv - vec2(texel.x,0.0)).r;
  float r = texture2D(d, uv + vec2(texel.x,0.0)).r;
  float b = texture2D(d, uv - vec2(0.0,texel.y)).r;
  float t = texture2D(d, uv + vec2(0.0,texel.y)).r;
  return vec2(r-l, t-b);
}
`

// Prepended to the vertex shader of every kind:'points' effect.
export const POINTS_PRELUDE = /* glsl */ `
precision highp float;

attribute vec2 aUv;         // 0..1 position of this point in the source image

uniform sampler2D uTex;
uniform sampler2D uDepth;
uniform vec2  uRes;
uniform vec2  uCanvas;
uniform float uTime;
uniform float uProgress;
uniform float uScale;
uniform float uSeed;

varying vec3  vColor;
varying float vAlpha;

float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash21(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash21(i+vec2(0,0)), hash21(i+vec2(1,0)), u.x),
             mix(hash21(i+vec2(0,1)), hash21(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v=0.0,a=0.5; for(int i=0;i<5;i++){ v+=a*vnoise(p); p*=2.02; a*=0.5; } return v; }

vec3 heatRamp(float t){
  vec3 c0 = vec3(0.02,0.01,0.09), c1 = vec3(0.35,0.05,0.45);
  vec3 c2 = vec3(0.85,0.25,0.25), c3 = vec3(1.00,0.72,0.25), c4 = vec3(1.0,0.98,0.88);
  t = clamp(t,0.0,1.0);
  if(t<0.25) return mix(c0,c1,t/0.25);
  if(t<0.50) return mix(c1,c2,(t-0.25)/0.25);
  if(t<0.75) return mix(c2,c3,(t-0.50)/0.25);
  return mix(c3,c4,(t-0.75)/0.25);
}
`

export const POINTS_FRAG = /* glsl */ `
precision highp float;
varying vec3  vColor;
varying float vAlpha;
uniform float p_soft;
void main(){
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = 1.0 - smoothstep(1.0 - clamp(p_soft,0.01,1.0), 1.0, r);
  if (a <= 0.001) discard;
  gl_FragColor = vec4(vColor, vAlpha * a);
}
`

export const VERT_QUAD = /* glsl */ `
varying vec2 vUv;
void main(){
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`
