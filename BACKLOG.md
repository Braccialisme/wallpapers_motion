# ShimmerLab — Backlog / idea dump

Loose ideas for later. Nothing here is committed work. Ordered roughly by "how much I want it".
Everything is designed to be **additive** — a new effect file or a new opt-in param — so it can't
break the existing graph. Architecture rules to respect: one effect = one file in `src/effects/`,
depth is available to every pass, pixel params × `uScale`, move content across the wall by
keyframing placement not UVs (see README → *The wall, the pasteboard & layout*).

---

## A. Bring back the 3-stage reveal: paper → depth → base colour

The very first look: a sheet of paper, the image **debosses in as grey depth relief**, then
**resolves to full colour**. Right now the reveal is 2-state (ghost tint → photo). Make it a
**staged** reveal so the wavefront passes through three looks in sequence.

**Non-breaking plan:** add a `stages` select to `emboss` (or a new `revealStages` effect), default
`= off` so every existing project is untouched.

Stage math, all driven by the same local reveal progress `r` (0 = untouched, 1 = fully revealed):

```
r in [0.0 .. 0.33]   paper       flat p_tint, no relief
r in [0.33 .. 0.66]  depth       grey shaded relief from uDepth (blind deboss, no colour)
r in [0.66 .. 1.0]   base colour desaturated image, then
r → 1                full colour lerp saturation/exposure up to the real photo
```

- Stage 1→2: fade `emboss` relief strength `0 → full`.
- Stage 2→3: `mix(vec3(luma), src.rgb, t)` — grey relief dissolves into base colour.
- Stage 3→done: push saturation/exposure to 100 %.

`r` comes from the same source the reveal already uses (`scatterReveal` travel/scan/depth field),
so it composes with Parade and the cursor. Expose the three thresholds as params + keyframable.

Bonus: a **"base colour" swatch** per layer (auto-pick the image's dominant colour, k-means on a
downscaled copy) so stage 3 can bloom from a flat brand colour → photo. Tiny, no lib
(`colorThief`-style average in JS, or read one mip level).

---

## B. Segment Anything → per-object masks

Segment the subject (a carved medallion, a figure, a cartouche) and drive effects **per segment**:
reveal object-by-object, glow only the object outline, park the background as paper.

**Lib:** `@huggingface/transformers` (already a dependency) runs **SAM** in-browser.
- `Xenova/slimsam-77-uniform` — tiny (~40 MB), point-prompt SAM, WebGPU. Good default.
- `Xenova/sam-vit-base` — heavier, better masks.
- SAM2 (`facebook/sam2` ports) if we want video-consistent masks later.
- Alternative: **MobileSAM** via `onnxruntime-web` (encoder once, decoder per click — very fast
  interactive masking).

**Flow:** click a point in the viewport → SAM decoder → binary mask → store as `layer.masks[]`
(a texture, same as depth). New uniform `uMask`. Effects gain a `maskChannel` param. Reveal,
emboss, glow can all be masked.

Cost: SAM image-encoder is the heavy step (run once per layer, cache like depth). Decoder with a
point prompt is milliseconds → interactive.

---

## C. Vector / contour extraction

Turn a mask or a depth iso-line into an actual **vector path** — for outlines, animated strokes,
and as the input to the Saber glow (D).

**Libs:**
- `d3-contour` (marching squares) — mask/depth → GeoJSON polygons/isolines. Lightweight, pure JS.
- `potrace` (there's an ESM/wasm build) — bitmap mask → smooth bezier paths. Best for clean
  silhouette outlines.
- `simplify-js` — Douglas–Peucker to thin the point count before animating.
- Authoring/handling: `paper.js` or `two.js` if we want a real editable vector layer; but for
  *rendering* we don't need them — feed the polyline to a shader and rasterise a stroke SDF.

**New layer type:** `kind: 'vector'` — stores points, no image. Renders via an SDF-of-polyline
pass (stroke width, dash, taper). This is the substrate for D.

---

## D. Saber-style energy glow (the fun one)

A clone of Video Copilot **Saber**: a glowing energy beam / electric outline along a path or mask
edge — neon, plasma, lightsaber, calligraphic ink-that-lights-up. Perfect over Arabic script and
carved medallions.

**No lib needed — it's a shader.** Path/mask comes from B or C. Technique:

```
d   = signed distance to the path/mask edge   (SDF; from potrace polyline or mask gradient)
core  = smoothstep(coreW,      0.0, abs(d))          bright centre
glow  = exp(-abs(d) * p_falloff) * p_intensity        soft halo
energy= fbm(pathParam*scroll + uTime*speed)           travelling flicker along the path
flare = periodic bright pulses
col   = coreColor*core + glowColor*(glow*energy) + flare
additive blend
```

Params: core width, glow size/intensity, two colours (core/glow, colour wheels we already have),
flicker speed, "electricity" (noise distortion of `d`), pulse rate, bloom. All keyframable for free.
Drive the reveal by animating where along the path the energy has "drawn to" → the outline
**writes itself on**, like Saber's build-up.

Sources for the path, in order of effort:
1. depth edge (`depthGrad` magnitude threshold) — zero new deps, works today.
2. SAM mask edge (B) — clean object outlines.
3. hand-drawn vector (C) — full control, calligraphy.

Add a global **bloom** post pass (bright-pass + separable gaussian, one small effect file) so the
glow actually blooms on the projection. Reusable by everything.

---

## E. Smaller stuff / nice-to-haves

- **True-infinite pasteboard** — currently bounded 3×; render the visible viewport region instead.
- **Margin slider** — arbitrary pasteboard size, not just on/off.
- **Textured brushes** for the reveal cursor (real stamp textures: chalk, ink, spray) — Procreate-ish.
- **Keyframable cursor** spread / softness / falloff.
- **Link emboss colour to a global** so all layers share one "un-revealed" colour.
- **Parade speed / direction** control on the timeline (currently full-span, linear). Ease in/out.
- **Per-segment Parade** — objects drift at different speeds (parallax by depth).
- **Grain / halation / chromatic edge** film-look global grade for the final 5-min master.

---

## F. More fun (installation energy)

- **Gold-leaf shimmer** — anisotropic specular that catches a slow moving light, keyed to the
  bright/gold pixels. Made for the illuminated manuscript + carved gilding. (GLSL, no dep.)
- **Light sweep / caustics** — a soft light bar (or water caustics) travelling across the wall,
  raking the depth relief so the carving "catches the light". Very projection-native.
- **Breathing** — a barely-there global sine on scale/opacity so a still wall is never dead.
- **Ink-bleed reveal** — wet diffusion wavefront (reaction-diffusion-ish) instead of stipple;
  content blooms out like ink into paper.
- **Embers / dust** — GPU points drifting up over the paper, lit by depth. Ambient life.
- **Duotone / risograph / letterpress** heritage grades (indigo, gold, oxblood) as one-click looks.
- **Site transitions** — themed wipes between Palmyra → Angkor → Agadez for the 5-min master.
- **Audio-reactive** — mic/analyser drives reveal speed / glow pulse. Fun for a live install.
- **Kiosk / presence mode** — pointer or webcam presence reveals the wall as a viewer walks by
  (the Immersive-Garden cursor, but the visitor is the cursor).
- **Depth fog / atmosphere** — distance haze from the depth map for the *scene* shots (caves, arches).
- **Ken Burns** — subtle auto push-in per image during Parade, eased.
- **Parallax parade** — Parade, but each image drifts at a speed set by its depth → layered motion.

---

## Lib shortlist (browser + GPU, no native toolchain)

| need | pick | why |
|---|---|---|
| segmentation | `@huggingface/transformers` SAM (`slimsam`), or `onnxruntime-web` + MobileSAM | already have transformers.js + WebGPU; SAM is the standard, slim variants are fast |
| mask → contour | `d3-contour` | tiny, pure JS, marching squares |
| bitmap → bezier | `potrace` (wasm/esm) | clean silhouette vectors |
| polyline simplify | `simplify-js` | one function, thins points |
| vector authoring (optional) | `two.js` or `paper.js` | only if we want an editable vector layer UI |
| glow / energy / bloom | **none — GLSL** | SDF + fbm + additive; fits the effect registry perfectly |

Order I'd build: **A** (staged reveal, cheap, high joy) → **D via depth-edge** (Saber with zero new
deps) → **B** (SAM) → **C + D upgrade** (vector paths feeding the glow) → **bloom** → the rest.
