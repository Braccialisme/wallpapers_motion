import React from 'react'
import { useStore } from '../store.js'
import { KEYS } from './Shortcuts.jsx'

const Section = ({ title, children }) => (
  <div style={{ marginTop: 26 }}>
    <div className="sec-title" style={{ marginBottom: 10 }}>{title}</div>
    <div style={{ color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.75 }}>{children}</div>
  </div>
)

const B = ({ children }) => <b style={{ color: 'var(--text)', fontWeight: 650 }}>{children}</b>

export default function GuideModal() {
  const showGuide = useStore((s) => s.ui.showGuide)
  const setUI = useStore((s) => s.setUI)
  if (!showGuide) return null

  return (
    <div className="modal" onClick={() => setUI({ showGuide: false })}>
      <div className="card" style={{ maxWidth: 720, maxHeight: '86vh', overflowY: 'auto', padding: 30 }}
        onClick={(e) => e.stopPropagation()}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 24, fontWeight: 650, letterSpacing: '-.03em' }}>How it works</div>
          <span style={{ flex: 1 }} />
          <button className="btn ico" onClick={() => setUI({ showGuide: false })}>✕</button>
        </div>
        <div style={{ color: 'var(--faint)', fontSize: 12.5, marginTop: 6 }}>
          A playground for building the projection walls — photos in, depth estimated,
          effects chained on the GPU, keyframed, exported at full wall resolution.
        </div>

        <Section title="The idea">
          Every image becomes a <B>layer</B>, placed at its own pixel ratio — never stretched.
          Each layer gets a <B>depth map</B> estimated from the photo, and its own <B>chain of
          effects</B>. The layers composite together, then a <B>global chain</B> runs over the
          whole wall. Nothing is baked in: every look is just a chain you can take apart.
        </Section>

        <Section title="1 · Add images">
          Drop images into the left panel, or press <B>Add</B>. They are laid out side by side
          and scaled to the wall height. Depth starts as a rough luminance guess so you can work
          immediately, then the real model result replaces it a few seconds later.
        </Section>

        <Section title="2 · Depth">
          Depth drives almost everything — parallax, the reveal order, the point cloud, the emboss.
          Pick the <B>model</B> in the left panel: <B>small</B> is fast, <B>base</B> is what you
          should use for anything you will show, <B>large</B> is best and slowest. Downloaded once,
          then cached.
          <br /><br />
          <B>Edge refine</B> snaps the depth onto the photo's real edges. Monocular depth is soft
          and slightly misaligned by nature; this is what removes the blobby feel. Judge it by
          pressing <B>D</B> to look at the depth map directly, never by guessing from the effect
          on top of it.
        </Section>

        <Section title="3 · Effects">
          Select a layer, then <B>+ Add effect</B>. Order matters — the chain runs top to bottom,
          each effect receiving the previous one's result. Effects can be muted, reordered, removed.
          <br /><br />
          The alpha channel is the <B>reveal</B> channel: <B>Scatter Reveal</B> writes it,
          <B> Blind Emboss</B> fills whatever is not yet revealed with a debossed ghost of the
          depth, and the layer composites over the <B>Paper Ground</B> underneath. That trio is
          the garden look.
        </Section>

        <Section title="4 · Animate">
          Every parameter has a <B>○</B> beside it. Click it to drop a keyframe at the playhead.
          Move the playhead, change the value, and a second keyframe is written automatically.
          Keys appear as diamonds on the timeline — click to jump, shift-click to delete.
          <br /><br />
          Motion is driven by time, not by the clock, so the export reproduces the preview exactly.
        </Section>

        <Section title="5 · Export">
          <B>Export MP4</B> renders every frame at the true wall size and encodes it.
          Running locally it hands the frames to ffmpeg and writes into <B>exports/</B>;
          in a hosted browser it encodes in-page instead. <B>PNG</B> gives you a single
          full-resolution still at the playhead.
          <br /><br />
          An export keeps running if you switch tabs. The live preview does not — browsers
          stop animating hidden tabs — so leave the tab visible if you want to watch it.
        </Section>

        <Section title="Saving">
          Work is saved continuously to this browser — closing the tab, reloading, or stopping the
          dev server costs nothing. Use the <B>project name menu</B> beside the logo to keep named
          versions, and <B>Export JSON</B> to hand a project to someone else (images travel inside
          the file).
        </Section>

        <Section title="Adding a new effect">
          Drop one file into <span className="mono">src/effects/</span>. It is discovered
          automatically, its controls are generated from its parameter list, and every parameter
          becomes keyframable. No wiring. See the README for the shader contract.
        </Section>

        <Section title="Keyboard">
          <div className="klist" style={{ marginTop: 4 }}>
            {KEYS.map(([k, d]) => (
              <React.Fragment key={k}><span className="kbd">{k}</span><span>{d}</span></React.Fragment>
            ))}
          </div>
        </Section>

        <button className="btn pri" style={{ width: '100%', justifyContent: 'center', marginTop: 26 }}
          onClick={() => setUI({ showGuide: false })}>Close</button>
      </div>
    </div>
  )
}
