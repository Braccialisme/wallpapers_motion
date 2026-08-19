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

Each param `k` arrives in GLSL as `uniform float p_k` — or `uniform vec3 p_k` for
`type:'color'`, which gets a colour wheel in the UI and is stored as `[r,g,b]` 0..1.

Param types: `float` `int` `bool` `select` (`options:[…]`) `color`.

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

## Depth quality

**Pick the right estimator first — it matters far more than model size.**

| source | use it for | how it works |
|---|---|---|
| **relief** *(default)* | carvings, reliefs, masonry, textiles, mud walls — anything flat shot head-on | height from shading. No model, instant |
| **scene** | real space: a cave, an arch, a receding wall | monocular depth (Depth Anything V2) |
| **hybrid** | a carved surface that also recedes | large shapes from the model, detail from shading |

A monocular model estimates *scene* depth — how far away things are. A frieze photographed
head-on has almost none: the whole wall is one distance away, so the model returns a nearly
constant field, and normalising that to full contrast amplifies its noise into what looks
like grainy garbage. That is the failure mode, and no amount of model size fixes it.

For bas-relief the height lives in the **shading** instead, which is what `relief` reads.

There is deliberately no auto mode: measured on this project's own material, a flat frieze
and a real cave interior score 0.84 vs 0.96 on the best separability metric available —
far too close to guess from, so choosing silently would often be wrong.

**Paintings and manuscripts** have no real relief; there `relief` follows the pigment rather
than geometry, so keep the strength low or leave the depth flat.

Controls: *Relief scale* is the size of features treated as relief, *Relief strength* how
pronounced. For `scene`, *Edge radius* / *Edge lock* drive a guided filter that snaps depth
to the photo's edges — keep the lock above ~0.02 or the photo's texture leaks into the depth.

* **Model** — `small` (50 MB, fast) · `base` (190 MB, clearly better structure) ·
  `large` (640 MB, best). Downloaded once, then cached by the browser.
  Start on `base` for anything you intend to show.
* **Edge refine** — a guided filter that re-snaps the depth to the photo's own edges.
  This is the single biggest quality win and costs milliseconds.
  *Edge radius* = how far it looks; *Sharpness* = how hard it locks to edges
  (lower is sharper, but can start pulling in texture detail).

Press <kbd>D</kbd> to inspect the depth map itself — always judge depth by looking at it,
not by looking at the effect on top of it.

WebGPU is used when a real adapter exists, otherwise wasm. Depth survives HMR, engine
recreation and project reloads within a session, so you never pay for the model twice.

---

## Keyboard

| key | |
|---|---|
| <kbd>Space</kbd> | play / pause |
| <kbd>←</kbd> <kbd>→</kbd> | step one frame (hold <kbd>⇧</kbd> for one second) |
| <kbd>Home</kbd> <kbd>End</kbd> | start / end |
| <kbd>D</kbd> | toggle depth view |
| <kbd>L</kbd> | toggle loop |
| <kbd>V</kbd> | show / hide selected layer |
| <kbd>[</kbd> <kbd>]</kbd> | previous / next layer |
| <kbd>⌫</kbd> | delete selected layer |
| <kbd>?</kbd> | shortcut list |

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

---

## Hosted version

Pushed to `main` deploys automatically to
**https://braccialisme.github.io/wallpapers_motion/**

The hosted build has no ffmpeg behind it, so export switches to encoding in the browser
with WebCodecs. That works well up to what the GPU encoder accepts; very wide walls
(8750 px) may be refused, in which case run locally for the full-size render. Everything
else — depth, effects, keyframes, autosave — is identical.

## Saving

Work is written continuously to IndexedDB in your browser. Reloading, closing the tab or
stopping the dev server costs nothing; the session is restored on the next visit, images
included. The project-name menu beside the logo keeps named versions, and
**Export JSON** produces a single self-contained file to hand to someone else.
