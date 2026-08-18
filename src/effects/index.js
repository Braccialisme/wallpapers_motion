// ---------------------------------------------------------------------------
// Effect registry.
//
// TO ADD AN EFFECT: drop a .js file in this folder. That's the whole process.
// It is auto-discovered here, appears in the "+ Effect" menu, gets its controls
// generated from `params`, and every param becomes keyframable on the timeline.
//
// Contract:
//   id     unique string (stable - used in saved projects)
//   name   label shown in UI
//   kind   'pass'   full-screen fragment shader (default)
//          'points' renders the layer as a GPU point cloud (supply vert + frag)
//   scope  'layer' | 'global' | 'both'
//   params { key: {type,'float'|'int'|'bool'|'color'|'select', ...} }
//          each param is exposed to GLSL as uniform  p_<key>
//          float/int -> float, bool -> float(0/1), color -> vec3, select -> float(index)
//   frag   GLSL fragment source (PRELUDE is prepended automatically)
// ---------------------------------------------------------------------------

const modules = import.meta.glob('./*.js', { eager: true })

export const EFFECTS = {}

for (const [path, mod] of Object.entries(modules)) {
  if (path.endsWith('/index.js')) continue
  const def = mod.default
  if (!def || !def.id) {
    console.warn(`[effects] ${path} has no valid default export, skipped`)
    continue
  }
  if (EFFECTS[def.id]) console.warn(`[effects] duplicate id "${def.id}" in ${path}`)
  EFFECTS[def.id] = {
    kind: 'pass',
    scope: 'layer',
    category: 'misc',
    params: {},
    ...def,
  }
}

export const effectList = (scope) =>
  Object.values(EFFECTS)
    .filter((e) => e.scope === 'both' || e.scope === scope)
    .sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name))

export const getEffect = (type) => EFFECTS[type]

export function defaultParams(type) {
  const def = EFFECTS[type]
  if (!def) return {}
  const out = {}
  for (const [k, p] of Object.entries(def.params)) out[k] = p.default
  return out
}
