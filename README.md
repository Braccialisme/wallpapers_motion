# wallpapers_motion — ShimmerLab

A modular, real-time playground for building the **Shimmering Wallpaper** projection pieces:
long ambient motion walls that sit between the three sites of the Abu Dhabi film
(Palmyra · Angkor Wat · Agadez).

Photos in, depth estimated in the browser, effects chained on a GPU, keyframed on a
timeline, exported at full wall resolution as mp4.

Walls: `8750×1000` ×2 and `4550×1000` ×1.

---

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5175

Requires **ffmpeg on PATH** (used for the final mp4 encode).

---

## How it works

```
image ──▶ depth (Depth Anything V2, in-browser)
  │
  ▼
LAYER  ── placed at its own pixel ratio (never stretched)
  │
  ├─▶ effect chain   [displace] → [scatter reveal] → [emboss] → …
  │                   each effect is one GPU pass, depth available to all
  ▼
COMPOSITE ──▶ global chain  [paper ground] → [grade] → …
  ▼
preview (fast)   ·   export (full res → disk → ffmpeg → mp4)
```

Everything is time-driven, never wall-clock driven, so an export is deterministic
and reproduces the preview exactly.

---

## Adding an effect

**Drop one file in `src/effects/`.** That is the entire process — it is auto-discovered,
appears in the `+ Effect` menu, its controls are generated, and every parameter becomes
keyframable.

```js
// src/effects/myEffect.js
export default {
  id: 'myEffect',
  name: 'My Effect',
  category: '01 deform',
  scope: 'layer',              // 'layer' | 'global' | 'both'
  params: {
    amount: { type: 'float', min: 0, max: 100, step: 0.5, default: 20, label: 'Amount' },
  },
  frag: `
void main(){
  vec2 off = vec2(p_amount * uScale / uRes.x, 0.0);
  gl_FragColor = texture2D(uTex, vUv + off);
}
`,
}
```

Each param `k` arrives in GLSL as `uniform float p_k`.

### Available to every shader

| uniform | meaning |
|---|---|
| `uTex` | input colour (previous pass, RGBA — alpha is the reveal channel) |
| `uDepth` | this layer's depth map, `0` = far, `1` = near |
| `uRes` | current render resolution in px |
| `uCanvas` | project canvas size (e.g. `4550×1000`) |
| `uTime` | seconds |
| `uProgress` | `0..1` across the timeline |
| `uScale` | `renderW / canvasW` — multiply pixel-based params by this so preview and export match |
| `uSeed` | per-layer random seed |

Helpers in the prelude: `hash11` `hash21` `vnoise` `fbm` `luma` `sstep` `depthGrad`.

**Important:** any parameter expressed in pixels must be multiplied by `uScale`,
otherwise the preview and the full-resolution export will not match.

### Point-cloud style effects

Set `kind: 'points'` and supply a `vert` instead of a `frag`. The layer is drawn as a
grid of GPU points; each point gets `aUv` and can read `uTex` / `uDepth`.
See `src/effects/pointcloud.js`.

---

## Effects included

| effect | what it does |
|---|---|
| `paper` | off-white paper ground with grain and fibres (global) |
| `displace` | depth-driven parallax displacement |
| `scatterReveal` | grain-in reveal driven by depth wavefront, scan, radial or a point |
| `emboss` | blind-emboss ghost of the depth into the paper where not yet revealed |
| `pointcloud` | GPU point cloud that assembles from depth-ordered scatter into the photo |
| `drift` | slow scroll |
| `grade` | exposure / contrast / saturation / tint / vignette |

---

## Presets

The `preset…` menu applies a starting chain to the selected layer — the garden reveal,
the scan reveal, the point-cloud assembly. Presets are plain functions in
`src/presets.js` that call the same store actions the UI does; nothing is special-cased.

---

## Export

* **Export MP4** — renders every frame at the true wall resolution offscreen, streams
  each PNG to the dev server, which writes to disk and encodes with ffmpeg
  (`libx264`, `crf 16`). Output lands in `exports/`.
  Override with `SHIMMER_OUT=D:/renders npm run dev`.
* **still PNG** — one full-resolution frame at the playhead.

Browser memory is never the ceiling — frames go straight to disk.

---

## Project files

`save` writes a `.shimmer.json` containing the full graph **and the images inlined**,
so a project is a single self-contained file. `open` restores it and re-runs depth.

---

## Layout

```
src/
  effects/      one file per effect  ← add here
  engine/
    Engine.js   layer compositing, effect chains, ping-pong targets, points
    depth.js    Depth Anything V2 in-browser + luminance fallback
    exporter.js full-res frame export
    glsl.js     shared shader prelude
  ui/           panels, inspector, timeline, viewport
  store.js      project state + keyframes
  presets.js    starting chains
```
