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
