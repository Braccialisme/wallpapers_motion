# ShimmerLab — `fun` branch (experimental)

Playground branch for the wilder effects. `main` stays stable; this is where the toys live.
Everything here is **additive and opt-in** — new effect files + one guarded flag on `emboss` —
so a project made on `main` still opens fine here.

## What's new

| effect | scope | what it does |
|---|---|---|
| **Saber (energy glow)** `saber` | layer | glowing energy outline along the depth edges — neon / plasma / lightsaber. Flicker + electricity + a "draw it on" front (keyframe `draw` L→R so the outline writes itself on). Made for the Arabic script and carved medallions. |
| **Bloom** `bloom` | global | single-pass bright-pass bloom so the glow (and any highlights) actually bloom on the projection. |
| **Gold-leaf shimmer** `goldLeaf` | layer | a slowly rotating light rakes the surface relief and sparkles on the bright/warm (gilded) pixels. For the illuminated manuscript and gilding. |
| **Staged reveal** (in `emboss`) | layer | the original look: as the reveal wavefront passes, each pixel goes **paper → grey depth relief → desaturated base colour → full photo**. Toggle **Staged** on the Blind Emboss effect; three thresholds control the timing. Off by default. |
| **Duotone** `duotone` | both | luma mapped through a 3-stop colour ramp (shadow / mid / highlight). |
| **Audio-reactive** | — | the **Audio** toggle in the viewbar opens the mic; `meyda` extracts level + bass/mid/treble into shader uniforms `uAudio / uAudioLow / uAudioMid / uAudioHigh`. Saber glow pumps on bass, gold-leaf twinkles on treble (set their *Audio-react* amount). Any effect can read those uniforms. |

## Layout & motion

- **Mosaic ▦** (Layers panel) — fits all photos into a recursively subdivided grid (binary
  space partition, jittered so it's messy-but-not-too-much), cover-cropped, no paper. Click
  again to reshuffle.
- **Motion gradient** `gradient` — animated domain-warped mesh gradient (3 colours, flow,
  warp, grain). Use full (`amount 1`) as a background wash, or **Screen over image** for a
  motion-design colour overlay. Preset: **Motion gradient (wash)**.

## Motion-design pack

| effect | scope | what it does |
|---|---|---|
| **Film grade** `filmgrade` | global | chromatic-edge + halation bleed + grain + vignette + contrast/sat — instant premium finish. |
| **Halftone / Riso** `halftone` | both | posterize + rotated dot screen on a paper colour — graphic, printy. |
| **Liquid warp** `liquid` | both | flowing domain-warp displacement of the image — wobbling liquid. |
| **Flow field** `flowfield` | layer (points) | GPU points streaming along an animated noise field, coloured by the photo. |

## New presets

- **Cursor reveal (black emboss → colour)** — the keeper: black blind-emboss on paper, staged
  into depth → base colour as the reveal cursor sweeps across (left→right by default).
- **Motion gradient (wash)** · **Film finish (grain + halation)** · **Flow field**
- **Kinetic type (fly in)** — the selected layer scales + rises + fades in over the first ~1.2s.
- **Ken Burns (slow push)** — every layer slowly pushes in and drifts across the timeline.
- **Parade + gradient wash** — the filmstrip scroll with a screen gradient + bloom over it.

## Subject cut-out & text

- **Cut subject ✂** (selected-layer row) — `@imgly/background-removal` strips the background to
  transparent so the subject floats on the paper. First run downloads a small model, then cached.
- **Text → glyph layer** (Layers panel: type text, pick a `.ttf/.otf`, **Add text**) — `opentype.js`
  renders the glyph outlines to a layer. Apply the **Saber outline** preset and the letters
  light up. (Latin/decorative shaping only — Arabic joining needs a harfbuzz pass, see BACKLOG.)

## Libs added

`meyda` (audio features) · `chroma-js` (palettes / duotone) · `d3-contour` + `simplify-js`
(depth/mask → vector paths) · `opentype.js` (glyph outlines → light-up calligraphy) ·
`simplex-noise` (procedural fields) · `@imgly/background-removal` (subject cut-out) · `d3-ease`
(easing). Audio + duotone are wired now; the rest are installed and ready for the next round
(see `../wallpapers_motion/BACKLOG.md`).

## New presets

- **Staged reveal (paper→depth→colour)**
- **Saber outline (energy glow)**
- **Gilded (gold-leaf shimmer)**

## Running both versions side by side

Two working copies, two git branches (one repo, git worktrees):

```
Desktop/wallpapers_motion       branch main   ← stable
Desktop/wallpapers_motion_fun   branch fun    ← this, experimental
```

```bash
# stable
cd Desktop/wallpapers_motion; npm run desktop

# fun
cd Desktop/wallpapers_motion_fun; npm run desktop
```

(The fun worktree shares `main`'s `node_modules` via a junction, so no second install.)

Merge anything you like back into `main` once it's proven:

```bash
cd Desktop/wallpapers_motion
git checkout main
git merge fun            # or cherry-pick single effect files
```
