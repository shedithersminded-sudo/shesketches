// Brush engines. Everything paints at full page resolution, so the art stays sharp at export size.
//
// Engines:
//  stamp  dry media (pencils, pens, charcoal, crayon). Builds up in layers, catches the paper grain.
//  paint  wet media (oils, acrylic, gouache, pastels, ink brush, blenders, water brush). The brush
//         carries paint, picks up what is under it and mixes it like real pigment, so blue and
//         yellow make green. It can drag, blend, thin, lift and leave thick ridges.
//  water  watercolor glaze. See-through washes that darken like real layered watercolor, with wet edges.
//  marker, splat, erase.
import { grainTile } from './paper.js';

// ---------- what every setting means (used by the brush panel and the brush maker) ----------
// engines: which engines use the setting
export const TIP_SHAPES = { round: 'Round', square: 'Square', flat: 'Flat brush', bristle: 'Bristle hairs', fan: 'Fan brush', rake: 'Rake (spaced hairs)', chalk: 'Chalky stick', sponge: 'Sponge', triangle: 'Triangle', diamond: 'Diamond', star: 'Star', heart: 'Heart', nib: 'Pen nib' };
// outlined tip shapes drawn from a path (the rest are built from hairs, chalk or a soft circle)
const PATH_SHAPES = new Set(['square', 'triangle', 'diamond', 'star', 'heart', 'fan']);
const HAIR_SHAPES = new Set(['bristle', 'fan', 'rake']);
export function shapePath(g, shape, r) {
  g.beginPath();
  if (shape === 'square') g.roundRect(-r, -r, r * 2, r * 2, r * 0.1);
  else if (shape === 'triangle') { g.moveTo(0, -r); g.lineTo(r * 0.95, r * 0.8); g.lineTo(-r * 0.95, r * 0.8); g.closePath(); }
  else if (shape === 'diamond') { g.moveTo(0, -r); g.lineTo(r * 0.72, 0); g.lineTo(0, r); g.lineTo(-r * 0.72, 0); g.closePath(); }
  else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
  else if (shape === 'heart') { g.moveTo(0, r * 0.95); g.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.75, -r * 1.05, 0, -r * 0.45); g.bezierCurveTo(r * 0.75, -r * 1.05, r * 1.25, r * 0.05, 0, r * 0.95); g.closePath(); }
  else if (shape === 'fan') { const cy = r * 0.62; g.moveTo(0, cy); g.arc(0, cy, r * 1.3, -Math.PI / 2 - 0.85, -Math.PI / 2 + 0.85); g.closePath(); }
  else g.arc(0, 0, r, 0, Math.PI * 2);
}
// a filled tip shape with a soft edge (hardness 1 = crisp)
function fillShape(g, shape, r, hard) {
  const blur = Math.max(0, (1 - hard) * r * 0.45);
  g.save();
  if (blur > 0.4) g.filter = `blur(${blur.toFixed(1)}px)`;
  shapePath(g, shape, Math.max(r * 0.35, r - blur * 1.3)); g.fill();
  g.restore();
}
// sponge: a soft blob full of holes
function spongeHoles(g, r, rnd) {
  g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
  const n = Math.round(10 + r * 1.2);
  for (let i = 0; i < n; i++) { const a = rnd() * 6.283, rr = Math.sqrt(rnd()) * r, s = r * (0.05 + rnd() * 0.14); g.globalAlpha = 0.5 + rnd() * 0.5; g.beginPath(); g.arc(Math.cos(a) * rr, Math.sin(a) * rr, s, 0, 7); g.fill(); }
  g.restore();
}
const seeded = s => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };

export const PARAMS = [
  { k: 'size', short: 'Size', g: 'Basics', label: 'Size', min: 1, max: 600, step: 0.5, unit: 'px', help: 'How wide the brush is.', engines: '*' },
  { k: 'opacity', short: 'Strength', g: 'Basics', label: 'Strength', min: 0.02, max: 1, step: 0.01, pct: 1, help: 'How dark or solid the mark can get. Lower it for light, see-through layers.', engines: '*' },
  { k: 'flow', short: 'Flow', g: 'Basics', label: 'Flow', min: 0.01, max: 1, step: 0.01, pct: 1, help: 'How much color each touch adds. Low flow builds up slowly.', engines: '*' },
  { k: 'stabilize', short: 'Stabilizer', g: 'Basics', label: 'Stabilizer (pulled string)', min: 0, max: 1, step: 0.01, pct: 1, help: 'The brush follows your hand on a string, so shaky hands make smooth lines. Higher is steadier.', engines: '*' },
  { k: 'min', short: 'Light press', g: 'Pen pressure', label: 'Lightest press size', min: 0, max: 1, step: 0.01, pct: 1, help: 'Size when you press lightly. 100% means pressure does not change the size.', engines: '*' },
  { k: 'pOpacity', short: 'Press = darker', g: 'Pen pressure', label: 'Pressure to strength', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much pressing harder makes the mark darker.', engines: '*' },
  { k: 'smooth', short: 'Steady line', g: 'Pen pressure', label: 'Smoothing', min: 0, max: 0.95, step: 0.01, pct: 1, help: 'Steadies shaky lines. High values trail a bit behind your hand.', engines: '*' },
  { k: 'tip', g: 'Tip', label: 'Tip shape', type: 'select', options: TIP_SHAPES, help: 'The shape of the brush tip.', engines: ['paint', 'stamp', 'erase'] },
  { k: 'hard', short: 'Hardness', g: 'Tip', label: 'Hardness', min: 0, max: 1, step: 0.01, pct: 1, help: 'Soft fuzzy edges, or crisp sharp edges.', engines: ['stamp', 'paint', 'water', 'marker', 'erase'] },
  { k: 'spacing', short: 'Spacing', g: 'Tip', label: 'Spacing', min: 0.02, max: 1, step: 0.01, pct: 1, help: 'Gap between each touch of the tip. Small is smooth, big makes dots.', engines: ['stamp', 'paint', 'water', 'marker', 'erase'] },
  { k: 'round', short: 'Roundness', g: 'Tip', label: 'Roundness', min: 0.08, max: 1, step: 0.01, pct: 1, help: 'Squash the tip flatter, like a chisel marker.', engines: ['stamp', 'paint', 'marker', 'erase'] },
  { k: 'angle', short: 'Tip angle', g: 'Tip', label: 'Tip angle', min: -90, max: 90, step: 1, unit: '°', help: 'Which way a flat or squashed tip points.', engines: ['stamp', 'paint', 'marker', 'erase'] },
  { k: 'follow', g: 'Tip', label: 'Turn tip with the stroke', type: 'check', help: 'The tip turns as your line turns, like a real flat brush.', engines: ['paint', 'stamp'] },
  { k: 'bristles', short: 'Bristles', g: 'Tip', label: 'Bristles', min: 4, max: 90, step: 1, help: 'Number of hairs. Fewer hairs make rougher streaks.', engines: ['paint'] },
  { k: 'dry', short: 'Runs dry', g: 'Tip', label: 'Runs dry', min: 0, max: 2, step: 0.01, pct: 0.5, help: 'How fast the brush runs out of paint. High values give scratchy ends.', engines: ['paint'] },
  { k: 'jitter', short: 'Jitter', g: 'Texture', label: 'Size jitter', min: 0, max: 1, step: 0.01, pct: 1, help: 'Random size changes for a natural, uneven line.', engines: ['stamp', 'water', 'erase'] },
  { k: 'scatter', short: 'Scatter', g: 'Texture', label: 'Scatter', min: 0, max: 2, step: 0.01, pct: 1, help: 'Spreads marks away from the line, like crumbly charcoal.', engines: ['stamp'] },
  { k: 'grain', short: 'Paper grain', g: 'Texture', label: 'Paper grain', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much the paper texture shows through the mark.', engines: ['stamp', 'paint', 'water', 'erase'] },
  { k: 'wax', short: 'Wax', g: 'Texture', label: 'Press into grain', min: 0, max: 1.5, step: 0.01, pct: 1, help: 'Pressing harder fills the paper texture, like crayon.', engines: ['stamp', 'paint'] },
  { k: 'dust', short: 'Dust', g: 'Texture', label: 'Dust', min: 0, max: 1, step: 0.01, pct: 1, help: 'Little specks around the line, like charcoal dust.', engines: ['stamp'] },
  { k: 'load', short: 'Paint', g: 'Paint and mixing', label: 'Paint on brush', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much new color the brush adds. 0 only blends what is there.', engines: ['paint'] },
  { k: 'pickup', short: 'Mix', g: 'Paint and mixing', label: 'Mix (pick up and blend)', min: 0, max: 1, step: 0.01, pct: 1, help: 'How much it mixes with colors underneath. High values blend like wet paint.', engines: ['paint'] },
  { k: 'drag', short: 'Drag', g: 'Paint and mixing', label: 'Drag (how far colors smear)', min: 0, max: 1, step: 0.01, pct: 1, help: 'How far colors smear along your stroke. Low blends in place, high pulls far.', engines: ['paint'] },
  { k: 'wet', short: 'Water', g: 'Paint and mixing', label: 'Water', min: 0, max: 1, step: 0.01, pct: 1, help: 'Adds water, so paint goes on thinner and see-through.', engines: ['paint'] },
  { k: 'lift', short: 'Lift', g: 'Paint and mixing', label: 'Lift paint off', min: 0, max: 1, step: 0.01, pct: 1, help: 'Takes paint off the page as you brush, like a damp brush.', engines: ['paint'] },
  { k: 'soften', short: 'Soften', g: 'Paint and mixing', label: 'Soften', min: 0, max: 1, step: 0.01, pct: 1, help: 'Blurs the paint on the brush for smoother blends.', engines: ['paint'] },
  { k: 'mixMode', g: 'Paint and mixing', label: 'Color mixing', type: 'select', options: { paint: 'Like real paint (blue + yellow = green)', light: 'Like light (blue + yellow = gray)' }, help: 'Paint: blue + yellow = green. Light: blue + yellow = gray.', engines: ['paint'] },
  { k: 'sampleAll', g: 'Paint and mixing', label: 'Blend with all layers below', type: 'check', help: 'On: mixes with everything below. Off: only this layer.', engines: ['paint'] },
  { k: 'impasto', short: 'Thick paint', g: 'Effects', label: 'Thick paint', min: 0, max: 1.5, step: 0.01, pct: 1, help: 'Raised, thick paint that catches the light.', engines: ['paint'] },
  { k: 'wetEdge', short: 'Wet edges', g: 'Effects', label: 'Wet edges', min: 0, max: 1, step: 0.01, pct: 1, help: 'Darker edges as the wash dries, like real watercolor.', engines: ['water'] },
  { k: 'blend', g: 'Effects', label: 'Blend mode', type: 'select', options: { 'source-over': 'Normal', multiply: 'Multiply (glaze, darkens)', screen: 'Screen (lightens)', overlay: 'Overlay', 'soft-light': 'Soft light', darken: 'Darken', lighten: 'Lighten', color: 'Color only', luminosity: 'Brightness only' }, help: 'How the mark mixes with what is under it. Multiply darkens like ink.', engines: ['stamp', 'water', 'marker', 'splat', 'paint'] },
];
export const ENGINES = { stamp: 'Dry media (pencil, pen, charcoal)', paint: 'Wet paint that mixes', water: 'Watercolor glaze', marker: 'Marker', splat: 'Splatter', erase: 'Eraser' };
export const TOOLS = { pencil: 'Pencil', charcoal: 'Charcoal stick', pastel: 'Pastel stick', pen: 'Pen', fineliner: 'Fineliner', nib: 'Dip pen', marker: 'Marker', airbrush: 'Airbrush', brush: 'Paint brush', inkbrush: 'Ink brush', flat: 'Flat brush', knife: 'Palette knife', eraser: 'Eraser', finger: 'Finger', stump: 'Blending stump', waterbrush: 'Water brush', spray: 'Spray can' };
export const paramsFor = engine => PARAMS.filter(p => p.engines === '*' || p.engines.includes(engine));

// kind: draw | blend | erase (which tool shows the brush)
const D = 'draw', B = 'blend';
export const PRESETS = [
  // ---- dry media
  { id: 'pencil-2h', kind: D, name: 'Pencil 2H', tool: 'pencil', engine: 'stamp', size: 4, min: 0.6, opacity: 0.7, pOpacity: 0.7, flow: 0.25, hard: 0.75, spacing: 0.12, grain: 0.9, jitter: 0.1, smooth: 0.35, color: '#5a5a5e', desc: 'Hard, light pencil. Best for first sketches you erase later.' },
  { id: 'pencil-hb', kind: D, name: 'Pencil HB', tool: 'pencil', engine: 'stamp', size: 5, min: 0.5, opacity: 0.9, pOpacity: 0.7, flow: 0.35, hard: 0.7, spacing: 0.12, grain: 0.85, jitter: 0.15, smooth: 0.35, color: '#3a3a3c', desc: 'Everyday pencil. Press harder for darker lines.' },
  { id: 'pencil-6b', kind: D, name: 'Pencil 6B', tool: 'pencil', engine: 'stamp', size: 10, min: 0.4, opacity: 1, pOpacity: 0.7, flow: 0.5, hard: 0.55, spacing: 0.1, grain: 0.9, jitter: 0.2, smooth: 0.3, color: '#1e1e20', desc: 'Very soft, dark pencil. Best for deep shading.' },
  { id: 'colored', kind: D, name: 'Colored pencil', tool: 'pencil', engine: 'stamp', size: 7, min: 0.5, opacity: 0.95, pOpacity: 0.7, flow: 0.4, hard: 0.65, spacing: 0.1, grain: 0.95, jitter: 0.15, smooth: 0.3, blend: 'multiply', desc: 'Waxy colored pencil. Layer colors to mix them.' },
  { id: 'wc-pencil', kind: D, name: 'Watercolor pencil', tool: 'pencil', engine: 'stamp', size: 8, min: 0.5, opacity: 0.95, pOpacity: 0.7, flow: 0.4, hard: 0.6, spacing: 0.1, grain: 0.95, jitter: 0.15, smooth: 0.3, color: '#2f6fa8', desc: 'Pencil that melts. Go over it with the Water brush.' },
  { id: 'charcoal', kind: D, name: 'Charcoal', tool: 'charcoal', engine: 'stamp', size: 26, min: 0.35, opacity: 1, pOpacity: 0.6, flow: 0.45, hard: 0.35, spacing: 0.08, grain: 1, jitter: 0.35, scatter: 0.6, dust: 0.5, smooth: 0.25, color: '#151414', desc: 'Dusty, rough black. Smudge it with a finger or stump.' },
  { id: 'soft-pastel', kind: D, name: 'Soft pastel', tool: 'pastel', engine: 'paint', tip: 'chalk', size: 30, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 0.7, hard: 0.7, spacing: 0.06, grain: 0.85, wax: 0.3, load: 0.85, pickup: 0.18, smooth: 0.2, follow: true, round: 0.7, color: '#e7a3b6', desc: 'Chalky color that blends into colors under it.' },
  { id: 'pastel', kind: D, name: 'Oil pastel', tool: 'pastel', engine: 'paint', tip: 'chalk', size: 28, min: 0.6, opacity: 1, pOpacity: 0.4, flow: 0.9, hard: 0.85, spacing: 0.05, grain: 0.75, wax: 1, load: 0.6, pickup: 0.4, smooth: 0.2, follow: true, round: 0.75, color: '#ef5a7a', desc: 'Creamy, waxy color. Colors smear together.' },
  { id: 'crayon', kind: D, name: 'Wax crayon', tool: 'pastel', engine: 'stamp', size: 16, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 0.7, hard: 0.9, spacing: 0.07, grain: 1, jitter: 0.2, wax: 0.7, smooth: 0.2, desc: 'Waxy crayon. Press hard to fill the paper texture.' },
  { id: 'mech-pencil', kind: D, name: 'Mechanical pencil', tool: 'pencil', engine: 'stamp', size: 3, min: 0.8, opacity: 0.9, pOpacity: 0.6, flow: 0.45, hard: 0.85, spacing: 0.1, grain: 0.7, jitter: 0.05, smooth: 0.45, color: '#3a3a3c', desc: 'Thin line that never changes width. Best for neat details.' },
  { id: 'pencil-4b', kind: D, name: 'Sketching pencil 4B', tool: 'pencil', engine: 'stamp', size: 9, min: 0.45, opacity: 0.95, pOpacity: 0.75, flow: 0.4, hard: 0.55, spacing: 0.1, grain: 0.9, jitter: 0.2, smooth: 0.3, color: '#29292b', desc: 'Soft, dark and loose. Best for quick sketches.' },
  { id: 'graphite-stick', kind: D, name: 'Graphite stick', tool: 'pencil', engine: 'stamp', tip: 'flat', size: 30, min: 0.5, opacity: 0.9, pOpacity: 0.7, flow: 0.3, hard: 0.6, spacing: 0.06, round: 0.3, follow: true, grain: 0.95, jitter: 0.1, smooth: 0.3, color: '#3a3a3c', desc: 'Wide block of graphite. Best for big shaded areas.' },
  { id: 'vine-charcoal', kind: D, name: 'Vine charcoal', tool: 'charcoal', engine: 'stamp', size: 18, min: 0.4, opacity: 0.8, pOpacity: 0.6, flow: 0.28, hard: 0.3, spacing: 0.08, grain: 1, jitter: 0.3, scatter: 0.4, dust: 0.3, smooth: 0.25, color: '#2a2726', desc: 'Light gray charcoal. Easy to smudge and erase.' },
  { id: 'compressed-charcoal', kind: D, name: 'Compressed charcoal', tool: 'charcoal', engine: 'stamp', tip: 'square', size: 22, min: 0.5, opacity: 1, pOpacity: 0.5, flow: 0.7, hard: 0.55, spacing: 0.06, grain: 0.75, wax: 0.6, jitter: 0.15, dust: 0.4, smooth: 0.25, color: '#0c0b0b', desc: 'Very dark, dense black. Best for strong darks.' },
  { id: 'conte', kind: D, name: 'Conte crayon', tool: 'pastel', engine: 'stamp', tip: 'square', size: 20, min: 0.5, opacity: 1, pOpacity: 0.55, flow: 0.55, hard: 0.6, spacing: 0.07, grain: 0.85, wax: 0.5, jitter: 0.1, smooth: 0.25, color: '#7a3b24', desc: 'Square earth-color stick. Corner for lines, side for tone.' },
  { id: 'chalk', kind: D, name: 'Chalk', tool: 'pastel', engine: 'stamp', tip: 'sponge', size: 24, min: 0.5, opacity: 1, pOpacity: 0.5, flow: 0.55, hard: 0.5, spacing: 0.07, grain: 1, jitter: 0.25, scatter: 0.3, dust: 0.6, smooth: 0.2, color: '#f4f1ea', desc: 'Dry, broken chalk. Shows best on dark paper.' },
  { id: 'pastel-pencil', kind: D, name: 'Pastel pencil', tool: 'pencil', engine: 'paint', tip: 'chalk', size: 10, min: 0.5, opacity: 1, pOpacity: 0.5, flow: 0.7, hard: 0.7, spacing: 0.06, grain: 0.85, wax: 0.2, load: 0.8, pickup: 0.15, smooth: 0.3, color: '#c86aa0', desc: 'Pastel you can control. Best for blended details.' },
  // ---- ink
  { id: 'ink-pen', kind: D, name: 'Ink pen', tool: 'pen', engine: 'stamp', size: 6, min: 0.25, opacity: 1, flow: 1, hard: 0.95, spacing: 0.05, grain: 0, smooth: 0.55, color: '#101012', desc: 'Smooth ink line that responds to pressure.' },
  { id: 'fineliner', kind: D, name: 'Fineliner', tool: 'fineliner', engine: 'stamp', size: 3.5, min: 1, opacity: 1, flow: 1, hard: 1, spacing: 0.05, grain: 0, smooth: 0.6, color: '#101012', desc: 'Clean line that never changes width.' },
  { id: 'brush-pen', kind: D, name: 'Brush pen', tool: 'pen', engine: 'stamp', size: 18, min: 0.08, opacity: 1, flow: 1, hard: 0.9, spacing: 0.04, grain: 0.05, smooth: 0.6, color: '#101012', desc: 'Ink brush tip. Press for thick, lift for thin.' },
  { id: 'dip-pen', kind: D, name: 'Calligraphy nib', tool: 'nib', engine: 'stamp', tip: 'nib', size: 16, min: 0.6, opacity: 1, flow: 1, hard: 0.95, spacing: 0.03, round: 0.18, angle: 40, grain: 0.05, smooth: 0.55, color: '#1a1520', desc: 'Slanted nib. Thick one way, thin the other. Best for lettering.' },
  { id: 'gel', kind: D, name: 'Gel pen', tool: 'fineliner', engine: 'stamp', size: 5, min: 0.85, opacity: 1, flow: 1, hard: 0.95, spacing: 0.05, grain: 0.1, smooth: 0.5, color: '#f4f1ea', desc: 'Bright, smooth gel ink. Shows on dark paper.' },
  { id: 'sumi', kind: D, name: 'Ink brush (sumi)', tool: 'inkbrush', engine: 'paint', tip: 'bristle', size: 40, min: 0.12, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 30, load: 0.9, pickup: 0.08, dry: 0.55, hard: 0.6, spacing: 0.04, follow: true, smooth: 0.35, color: '#0d0d0e', desc: 'Soft ink brush with hair streaks.' },
  { id: 'ballpoint', kind: D, name: 'Ballpoint pen', tool: 'pen', engine: 'stamp', size: 2.6, min: 0.6, opacity: 0.85, pOpacity: 0.75, flow: 0.6, hard: 0.9, spacing: 0.08, grain: 0.35, smooth: 0.4, color: '#1f2f6b', desc: 'Everyday blue pen. Light pressure skips a little.' },
  { id: 'tech-pen', kind: D, name: 'Technical pen', tool: 'fineliner', engine: 'stamp', size: 2, min: 1, opacity: 1, flow: 1, hard: 1, spacing: 0.04, grain: 0, smooth: 0.7, color: '#0b0b0c', desc: 'Crisp, even black line. Best for clean inking.' },
  { id: 'felt-tip', kind: D, name: 'Felt tip pen', tool: 'fineliner', engine: 'marker', size: 6, min: 0.85, opacity: 0.9, flow: 1, hard: 0.85, spacing: 0.05, smooth: 0.45, color: '#202024', desc: 'Bold, soft line. Gets darker where lines cross.' },
  { id: 'stipple-pen', kind: D, name: 'Stippling pen', tool: 'fineliner', engine: 'stamp', size: 4, min: 0.6, opacity: 1, flow: 1, hard: 0.95, spacing: 1, scatter: 1.4, jitter: 0.4, grain: 0, smooth: 0.1, color: '#101012', desc: 'Leaves dots. Go over an area again to darken it.' },
  { id: 'crowquill', kind: D, name: 'Crowquill nib', tool: 'nib', engine: 'stamp', size: 6, min: 0.15, opacity: 1, pOpacity: 0.2, flow: 1, hard: 0.95, spacing: 0.03, grain: 0.05, smooth: 0.5, color: '#121014', desc: 'Springy fine nib. Press for thick, lift for hairline.' },
  { id: 'dry-ink', kind: D, name: 'Dry ink brush', tool: 'inkbrush', engine: 'paint', tip: 'rake', size: 34, min: 0.3, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 30, load: 0.8, pickup: 0.05, dry: 1.4, hard: 0.6, spacing: 0.04, follow: true, grain: 0.5, smooth: 0.3, color: '#0d0d0e', desc: 'Scratchy split ink strokes.' },
  // ---- paint
  { id: 'oil', kind: D, name: 'Oil brush', tool: 'brush', engine: 'paint', tip: 'bristle', size: 38, min: 0.5, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 36, load: 0.42, pickup: 0.45, dry: 0.15, impasto: 0.2, hard: 0.72, spacing: 0.04, follow: true, smooth: 0.3, desc: 'Buttery oil paint that mixes with wet colors.' },
  { id: 'impasto', kind: D, name: 'Impasto oil', tool: 'knife', engine: 'paint', tip: 'bristle', size: 70, min: 0.6, opacity: 1, pOpacity: 0.2, flow: 1, bristles: 44, load: 0.45, pickup: 0.35, dry: 0.08, impasto: 1, hard: 0.7, spacing: 0.035, follow: true, smooth: 0.3, color: '#5b6a3c', desc: 'Thick oil paint with raised ridges.' },
  { id: 'knife', kind: D, name: 'Palette knife', tool: 'knife', engine: 'paint', tip: 'flat', size: 60, min: 0.8, opacity: 1, pOpacity: 0.2, flow: 1, load: 0.4, pickup: 0.6, impasto: 0.9, hard: 0.95, spacing: 0.03, round: 0.22, follow: true, smooth: 0.4, color: '#c9b27a', desc: 'Spread flat slabs of paint. Best for big blends.' },
  { id: 'acrylic', kind: D, name: 'Acrylic brush', tool: 'flat', engine: 'paint', tip: 'bristle', size: 34, min: 0.5, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 30, load: 0.65, pickup: 0.12, dry: 0.3, hard: 0.6, spacing: 0.04, round: 0.45, follow: true, smooth: 0.3, desc: 'Bold, solid color with light brush marks.' },
  { id: 'drybrush', kind: D, name: 'Dry brush', tool: 'brush', engine: 'paint', tip: 'bristle', size: 46, min: 0.4, opacity: 1, pOpacity: 0.4, flow: 1, bristles: 26, load: 0.5, pickup: 0.05, dry: 1.2, grain: 0.5, hard: 0.5, spacing: 0.04, follow: true, smooth: 0.3, desc: 'Scratchy streaks that catch the paper.' },
  { id: 'gouache', kind: D, name: 'Gouache', tool: 'brush', engine: 'paint', tip: 'round', size: 34, min: 0.5, opacity: 1, pOpacity: 0.4, flow: 0.9, load: 0.5, pickup: 0.32, hard: 0.55, spacing: 0.05, grain: 0.15, smooth: 0.35, desc: 'Flat, matte, solid color that blends while wet.' },
  { id: 'filbert', kind: D, name: 'Filbert oil brush', tool: 'brush', engine: 'paint', tip: 'bristle', size: 36, min: 0.45, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 40, load: 0.5, pickup: 0.4, drag: 0.55, dry: 0.12, impasto: 0.35, hard: 0.75, spacing: 0.04, round: 0.7, follow: true, smooth: 0.35, desc: 'Rounded oil brush. Best for skin, clouds and petals.' },
  { id: 'smooth-oil', kind: D, name: 'Smooth oil (no texture)', tool: 'brush', engine: 'paint', tip: 'round', size: 36, min: 0.5, opacity: 1, pOpacity: 0.3, flow: 1, load: 0.5, pickup: 0.5, drag: 0.6, soften: 0.35, hard: 0.6, spacing: 0.04, smooth: 0.35, desc: 'Silky oil paint with no brush marks.' },
  { id: 'liner', kind: D, name: 'Detail liner brush', tool: 'brush', engine: 'paint', tip: 'round', size: 7, min: 0.2, opacity: 1, pOpacity: 0.3, flow: 1, load: 0.85, pickup: 0.1, hard: 0.75, spacing: 0.04, smooth: 0.55, desc: 'Thin brush. Best for hair, grass and fine lines.' },
  { id: 'fan', kind: D, name: 'Fan brush', tool: 'flat', engine: 'paint', tip: 'fan', size: 60, min: 0.6, opacity: 1, pOpacity: 0.4, flow: 1, bristles: 34, load: 0.45, pickup: 0.3, dry: 0.5, hard: 0.6, spacing: 0.04, follow: true, smooth: 0.3, desc: 'Spread hairs. Best for grass, leaves and fur.' },
  { id: 'rake', kind: D, name: 'Rake brush', tool: 'flat', engine: 'paint', tip: 'rake', size: 44, min: 0.6, opacity: 1, pOpacity: 0.3, flow: 1, bristles: 30, load: 0.6, pickup: 0.2, dry: 0.3, hard: 0.7, spacing: 0.04, follow: true, smooth: 0.3, desc: 'Several lines in one stroke. Best for hair and wood.' },
  { id: 'sponge', kind: D, name: 'Sponge', tool: 'brush', engine: 'paint', tip: 'sponge', size: 70, min: 0.6, opacity: 1, pOpacity: 0.4, flow: 0.9, load: 0.55, pickup: 0.2, hard: 0.6, spacing: 0.25, jitter: 0, grain: 0.2, smooth: 0.2, desc: 'Dab on texture. Best for leaves and rock.' },
  { id: 'glaze-oil', kind: D, name: 'Oil glaze', tool: 'brush', engine: 'paint', tip: 'round', size: 60, min: 0.6, opacity: 0.45, pOpacity: 0.3, flow: 0.8, load: 0.5, pickup: 0.25, soften: 0.6, hard: 0.2, spacing: 0.04, blend: 'multiply', smooth: 0.35, desc: 'Thin see-through oil. Tints colors under it.' },
  { id: 'heavy-knife', kind: D, name: 'Heavy knife', tool: 'knife', engine: 'paint', tip: 'square', size: 60, min: 0.8, opacity: 1, pOpacity: 0.2, flow: 1, load: 0.55, pickup: 0.45, impasto: 1.2, hard: 0.9, spacing: 0.03, round: 0.4, follow: true, smooth: 0.4, color: '#c23b3b', desc: 'Thick slabs of paint off a knife.' },
  { id: 'wet-wash', kind: D, name: 'Watercolor wet-in-wet', tool: 'brush', engine: 'paint', tip: 'round', size: 60, min: 0.4, opacity: 0.8, pOpacity: 0.5, flow: 0.5, load: 0.3, pickup: 0.4, wet: 0.65, soften: 0.5, hard: 0.15, spacing: 0.05, grain: 0.35, smooth: 0.35, blend: 'multiply', color: '#3b6ea8', desc: 'Soft wet color that bleeds into other wet colors.' },
  { id: 'watercolor', kind: D, name: 'Watercolor glaze', tool: 'brush', engine: 'water', size: 50, min: 0.3, opacity: 0.55, flow: 0.18, hard: 0.15, spacing: 0.08, grain: 0.5, wetEdge: 0.7, smooth: 0.35, blend: 'multiply', color: '#3b6ea8', desc: 'See-through wash with darker dried edges.' },
  { id: 'marker', kind: D, name: 'Marker', tool: 'marker', engine: 'marker', size: 24, min: 1, opacity: 0.6, flow: 1, hard: 0.9, spacing: 0.05, smooth: 0.4, blend: 'multiply', color: '#c23b3b', desc: 'Alcohol marker. Go over it again to darken.' },
  { id: 'chisel', kind: D, name: 'Chisel marker', tool: 'marker', engine: 'marker', size: 30, min: 1, opacity: 0.6, flow: 1, hard: 0.95, spacing: 0.04, round: 0.3, angle: 30, smooth: 0.4, blend: 'multiply', color: '#3b8a6a', desc: 'Wide flat marker. Best for blocking in and lettering.' },
  { id: 'highlighter', kind: D, name: 'Highlighter', tool: 'marker', engine: 'marker', size: 34, min: 1, opacity: 0.45, flow: 1, hard: 1, spacing: 0.05, round: 0.4, angle: 0, smooth: 0.5, blend: 'multiply', color: '#f2e14c', desc: 'Bright see-through color.' },
  { id: 'brush-marker', kind: D, name: 'Brush marker', tool: 'marker', engine: 'marker', size: 20, min: 0.25, opacity: 0.55, pOpacity: 0, flow: 1, hard: 0.75, spacing: 0.04, smooth: 0.45, blend: 'multiply', color: '#6b4a8a', desc: 'Flexible marker. Press for wide, lift for thin.' },
  { id: 'paint-marker', kind: D, name: 'Paint marker', tool: 'marker', engine: 'marker', size: 12, min: 1, opacity: 1, flow: 1, hard: 0.95, spacing: 0.04, smooth: 0.45, color: '#f4f1ea', desc: 'Solid paint. Covers dark colors, even white on black.' },
  { id: 'wc-round', kind: D, name: 'Watercolor round', tool: 'brush', engine: 'water', size: 30, min: 0.25, opacity: 0.6, flow: 0.25, hard: 0.3, spacing: 0.06, grain: 0.45, wetEdge: 0.6, smooth: 0.4, blend: 'multiply', color: '#b3211e', desc: 'Pointed watercolor brush. Best for washes and details.' },
  { id: 'wc-dry', kind: D, name: 'Dry watercolor', tool: 'brush', engine: 'water', size: 44, min: 0.5, opacity: 0.6, flow: 0.3, hard: 0.4, spacing: 0.08, grain: 1, wetEdge: 0.3, smooth: 0.3, blend: 'multiply', color: '#2e8a7a', desc: 'Dry watercolor that sparkles on the paper texture.' },
  { id: 'ink-wash', kind: D, name: 'Ink wash', tool: 'inkbrush', engine: 'water', size: 60, min: 0.4, opacity: 0.45, flow: 0.2, hard: 0.15, spacing: 0.06, grain: 0.4, wetEdge: 0.8, smooth: 0.35, blend: 'multiply', color: '#2a2a2c', desc: 'Watered-down ink. Best for gray shading.' },
  { id: 'spray', kind: D, name: 'Spray paint', tool: 'spray', engine: 'stamp', tip: 'sponge', size: 90, min: 0.6, opacity: 0.9, flow: 0.08, hard: 0.2, spacing: 0.05, scatter: 0.5, grain: 0, smooth: 0.2, color: '#e0533d', desc: 'Grainy spray can mist. Build it up slowly.' },
  { id: 'star-stamp', kind: D, name: 'Star stamp', tool: 'marker', engine: 'stamp', tip: 'star', size: 30, min: 0.6, opacity: 1, flow: 1, hard: 0.95, spacing: 1, jitter: 0.4, scatter: 1, smooth: 0.1, color: '#f2c94c', desc: 'Scatters stars. Try other shapes in Tip shape.' },
  { id: 'airbrush', kind: D, name: 'Airbrush', tool: 'airbrush', engine: 'stamp', size: 80, min: 0.4, opacity: 0.8, flow: 0.04, hard: 0, spacing: 0.05, grain: 0, smooth: 0.3, desc: 'Very soft spray. Best for smooth shading and glows.' },
  { id: 'splatter', kind: D, name: 'Splatter', tool: 'spray', engine: 'splat', size: 60, min: 0.5, opacity: 1, flow: 1, smooth: 0.1, desc: 'Flicked paint drops.' },
  // ---- blending
  { id: 'smudge', kind: B, name: 'Finger smudge', tool: 'finger', engine: 'paint', tip: 'round', size: 40, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 1, load: 0, pickup: 0.85, soften: 0.3, hard: 0.3, spacing: 0.05, grain: 0.15, smooth: 0.3, desc: 'Drag colors with your fingertip. Works on everything.' },
  { id: 'smoother', kind: B, name: 'Smoothing brush', tool: 'brush', engine: 'paint', tip: 'round', size: 70, min: 0.7, opacity: 1, pOpacity: 0.3, flow: 0.9, load: 0, pickup: 0.65, soften: 0.9, hard: 0, spacing: 0.035, grain: 0, smooth: 0.45, desc: 'Melts any colors into smooth gradients.' },
  { id: 'blender', kind: B, name: 'Soft blender', tool: 'brush', engine: 'paint', tip: 'round', size: 60, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 0.8, load: 0, pickup: 0.5, soften: 0.45, hard: 0.1, spacing: 0.05, smooth: 0.35, desc: 'Clean soft brush for smooth blends.' },
  { id: 'paint-blend', kind: B, name: 'Bristle blender', tool: 'brush', engine: 'paint', tip: 'bristle', size: 50, min: 0.6, opacity: 1, pOpacity: 0.4, flow: 1, bristles: 40, load: 0, pickup: 0.6, dry: 0, hard: 0.5, spacing: 0.04, follow: true, smooth: 0.3, desc: 'Blends paint and leaves brush marks.' },
  { id: 'water-brush', kind: B, name: 'Water brush', tool: 'waterbrush', engine: 'paint', tip: 'round', size: 50, min: 0.5, opacity: 1, pOpacity: 0.4, flow: 0.8, load: 0, pickup: 0.45, wet: 0.45, lift: 0.1, soften: 0.6, hard: 0.2, spacing: 0.05, grain: 0.3, smooth: 0.35, desc: 'Clean water. Melts watercolor pencil and softens edges.' },
  { id: 'stump', kind: B, name: 'Blending stump', tool: 'stump', engine: 'paint', tip: 'chalk', size: 22, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 1, load: 0, pickup: 0.7, soften: 0.2, hard: 0.4, spacing: 0.05, grain: 0.55, smooth: 0.3, desc: 'Blends pencil and charcoal but keeps paper texture.' },
  { id: 'knife-blend', kind: B, name: 'Knife blend', tool: 'knife', engine: 'paint', tip: 'flat', size: 70, min: 0.8, opacity: 1, pOpacity: 0.2, flow: 1, load: 0, pickup: 0.8, impasto: 0.4, hard: 0.95, spacing: 0.03, round: 0.22, follow: true, smooth: 0.4, desc: 'Drags a knife through wet paint.' },
  { id: 'square-blend', kind: B, name: 'Square blender', tool: 'flat', engine: 'paint', tip: 'square', size: 50, min: 0.7, opacity: 1, pOpacity: 0.4, flow: 1, load: 0, pickup: 0.6, drag: 0.55, soften: 0.3, hard: 0.7, spacing: 0.04, smooth: 0.35, desc: 'Blends with straight clean edges.' },
  { id: 'long-drag', kind: B, name: 'Long drag smudge', tool: 'finger', engine: 'paint', tip: 'round', size: 40, min: 0.6, opacity: 1, pOpacity: 0.5, flow: 1, load: 0, pickup: 0.7, drag: 0.92, soften: 0.25, hard: 0.35, spacing: 0.04, smooth: 0.35, desc: 'Pulls colors far along your stroke.' },
  { id: 'fan-blend', kind: B, name: 'Fan blender', tool: 'flat', engine: 'paint', tip: 'fan', size: 60, min: 0.7, opacity: 1, pOpacity: 0.4, flow: 1, bristles: 36, load: 0, pickup: 0.55, hard: 0.5, spacing: 0.04, follow: true, smooth: 0.35, desc: 'Feathery blends. Best for skies and fur.' },
  { id: 'sponge-blend', kind: B, name: 'Sponge blender', tool: 'brush', engine: 'paint', tip: 'sponge', size: 60, min: 0.7, opacity: 1, pOpacity: 0.4, flow: 1, load: 0, pickup: 0.5, hard: 0.5, spacing: 0.12, grain: 0.2, smooth: 0.25, desc: 'Dabs colors together with a dotty texture.' },
  { id: 'tortillon', kind: B, name: 'Tortillon (small stump)', tool: 'stump', engine: 'paint', tip: 'round', size: 10, min: 0.5, opacity: 1, pOpacity: 0.5, flow: 1, load: 0, pickup: 0.65, soften: 0.2, hard: 0.5, spacing: 0.05, grain: 0.5, smooth: 0.4, desc: 'Tiny stump. Best for small details.' },
  { id: 'wet-blend', kind: B, name: 'Wet blender', tool: 'waterbrush', engine: 'paint', tip: 'round', size: 60, min: 0.6, opacity: 1, pOpacity: 0.4, flow: 0.9, load: 0, pickup: 0.55, drag: 0.7, wet: 0.3, soften: 0.75, hard: 0.15, spacing: 0.04, smooth: 0.4, desc: 'Damp brush. Colors melt and run together.' },
  // ---- erasers
  { id: 'eraser', kind: 'erase', name: 'Eraser', tool: 'eraser', engine: 'erase', size: 30, min: 0.6, opacity: 1, flow: 1, hard: 0.85, spacing: 0.1, smooth: 0.3, desc: 'Removes what is on this layer.' },
  { id: 'kneaded', kind: 'erase', name: 'Soft eraser', tool: 'eraser', engine: 'erase', size: 60, min: 0.5, opacity: 0.5, flow: 0.25, hard: 0.1, spacing: 0.08, grain: 0.6, smooth: 0.3, desc: 'Lifts a little at a time. Best for highlights.' },
  { id: 'block-eraser', kind: 'erase', name: 'Block eraser', tool: 'eraser', engine: 'erase', tip: 'square', size: 34, min: 0.8, opacity: 1, flow: 1, hard: 0.9, spacing: 0.08, smooth: 0.3, desc: 'Square eraser for clean edges and corners.' },
  { id: 'pencil-eraser', kind: 'erase', name: 'Pencil eraser', tool: 'eraser', engine: 'erase', size: 8, min: 0.7, opacity: 1, flow: 1, hard: 0.85, spacing: 0.08, smooth: 0.45, desc: 'Small eraser for details.' },
  { id: 'texture-eraser', kind: 'erase', name: 'Texture eraser', tool: 'eraser', engine: 'erase', tip: 'sponge', size: 50, min: 0.7, opacity: 0.8, flow: 0.6, hard: 0.6, spacing: 0.15, grain: 0.6, smooth: 0.25, desc: 'Lifts color in a broken, textured way.' },
];
// defaults any brush falls back on
export const DEFAULTS = { kind: D, tool: 'brush', engine: 'stamp', tip: 'round', size: 20, min: 0.5, opacity: 1, pOpacity: 0.5, flow: 0.8, hard: 0.6, spacing: 0.08, round: 1, angle: 0, follow: false, bristles: 24, dry: 0, jitter: 0, scatter: 0, grain: 0, wax: 0, dust: 0, load: 0.6, pickup: 0.2, drag: 0.5, wet: 0, lift: 0, soften: 0, mixMode: 'paint', sampleAll: true, impasto: 0, wetEdge: 0.7, blend: 'source-over', smooth: 0.3, stabilize: 0 };
export const fullBrush = p => ({ ...DEFAULTS, ...p });

const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), h = n => { let v = Math.imul(n | 0, 374761393) ^ 0x5bd1e995; v = Math.imul(v ^ (v >>> 13), 1274126177); return ((v ^ (v >>> 16)) >>> 0) / 4294967296; }; return h(i) + (h(i + 1) - h(i)) * u; };
const mk = (w, h, read) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); if (read) c.getContext('2d', { willReadFrequently: true }); return c; };
const rgb = h => { const n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const shade = (hex, k) => { const [r, g, b] = rgb(hex); return k > 0 ? toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k) : toHex(r * (1 + k), g * (1 + k), b * (1 + k)); };

// ---------- paint mixing ----------
// RYB model (Sugita & Takahashi): mixing in red-yellow-blue gives painter's results (blue + yellow = green).
export function rgb2ryb(r, g, b) {
  const w = Math.min(r, g, b); r -= w; g -= w; b -= w;
  const mg = Math.max(r, g, b);
  let y = Math.min(r, g); r -= y; g -= y;
  if (b > 0 && g > 0) { b /= 2; g /= 2; }
  y += g; b += g;
  const my = Math.max(r, y, b);
  if (my > 0) { const n = mg / my; r *= n; y *= n; b *= n; }
  return [r + w, y + w, b + w];
}
export function ryb2rgb(r, y, b) {
  const w = Math.min(r, y, b); r -= w; y -= w; b -= w;
  const my = Math.max(r, y, b);
  let g = Math.min(y, b); y -= g; b -= g;
  if (b > 0 && g > 0) { b *= 2; g *= 2; }
  r += y; g += y;
  const mg = Math.max(r, g, b);
  if (mg > 0) { const n = my / mg; r *= n; g *= n; b *= n; }
  return [r + w, g + w, b + w];
}
// mix two hex colors like paint (t = amount of b)
export function mixPaint(a, b, t) {
  const A = rgb2ryb(...rgb(a).map(v => v / 255)), Bc = rgb2ryb(...rgb(b).map(v => v / 255));
  const m = ryb2rgb(A[0] + (Bc[0] - A[0]) * t, A[1] + (Bc[1] - A[1]) * t, A[2] + (Bc[2] - A[2]) * t);
  return toHex(m[0] * 255, m[1] * 255, m[2] * 255);
}
export function mixHex(a, b, t) { const A = rgb(a), B = rgb(b); return toHex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }

// cached tip: round / oval by default, or any shape from TIP_SHAPES
const tipCache = new Map();
function tip(d, hard, color, round = 1, angle = 0, shape = 'round', variant = 0) {
  d = Math.max(1, Math.round(d * 2) / 2);
  const sh = PATH_SHAPES.has(shape) || shape === 'sponge' || shape === 'rake' || shape === 'flat' ? shape : 'round';
  const key = d + '|' + hard.toFixed(2) + '|' + color + '|' + round.toFixed(2) + '|' + Math.round(angle) + '|' + sh + '|' + variant;
  let c = tipCache.get(key);
  if (c) return c;
  const pad = sh === 'round' ? 2 : Math.ceil(d * 0.45) + 2;
  c = mk(d + pad, d + pad); const g = c.getContext('2d'), r = d / 2, cx = c.width / 2;
  const [R, G, B] = rgb(color);
  g.translate(cx, cx); g.rotate(angle * Math.PI / 180);
  if (sh === 'round' || sh === 'sponge') {
    g.save(); g.scale(1, Math.max(0.05, round));
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    gr.addColorStop(0, `rgba(${R},${G},${B},1)`);
    gr.addColorStop(Math.min(0.99, Math.max(0.01, hard)), `rgba(${R},${G},${B},1)`);
    gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.restore();
    if (sh === 'sponge') spongeHoles(g, r, seeded(1 + variant * 7919));
  } else if (sh === 'rake') {
    g.save(); g.scale(1, Math.max(0.05, round)); g.fillStyle = `rgb(${R},${G},${B})`;
    const n = Math.max(3, Math.min(9, Math.round(d / 5)));
    for (let i = 0; i < n; i++) { const x = -r + (i + 0.5) * (2 * r / n); g.beginPath(); g.arc(x, 0, Math.max(0.5, r / n * 0.55), 0, 7); g.fill(); }
    g.restore();
  } else {
    g.save(); g.scale(sh === 'flat' ? 1 : 1, Math.max(0.05, sh === 'flat' ? Math.min(round, 0.3) : round));
    g.fillStyle = `rgb(${R},${G},${B})`;
    fillShape(g, sh === 'flat' ? 'square' : sh, r, hard); g.restore();
  }
  tipCache.set(key, c);
  if (tipCache.size > 400) tipCache.delete(tipCache.keys().next().value);
  return c;
}

const MIXN = 48; // the paint on the brush is simulated on a 48 x 48 grid, then drawn at full size

export class Stroke {
  /**
   * @param preset brush settings (merged with user overrides)
   * @param target ctx to paint into (stroke canvas for build-up engines, the layer itself for paint/erase)
   * @param opts { color, paper, layerCtx (the layer), below (canvas of everything under the layer),
   *               heightCtx (for thick paint), alphaLock, grainScale }
   */
  constructor(preset, target, opts) {
    this.b = fullBrush(preset); this.g = target; this.o = opts;
    this.color = opts.color || preset.color || '#222222';
    this.dist = 0; this.last = null; this.residual = 0;
    this.seed = Math.random() * 1e6 | 0;
    this.bbox = [1e9, 1e9, -1e9, -1e9];
    if (this.b.grain) this.grain = grainTile(opts.paper || 'sketch');
    this.tmp = mk(8, 8);
    if (this.b.engine === 'paint') this.initPaint();
  }
  rnd() { this.seed = (this.seed * 16807) % 2147483647; return this.seed / 2147483647; }
  grow(x, y, r) { const b = this.bbox; b[0] = Math.min(b[0], x - r); b[1] = Math.min(b[1], y - r); b[2] = Math.max(b[2], x + r); b[3] = Math.max(b[3], y + r); }
  sizeAt(p) { const b = this.b; return b.size * (b.min + (1 - b.min) * Math.pow(p, 1.2)); }
  strengthAt(p) { return 1 - this.b.pOpacity * (1 - Math.min(1, p * 1.25)); }

  add(pt) {
    const b = this.b;
    if (!this.last) { this.last = { ...pt }; if (b.engine !== 'splat' && b.engine !== 'paint') this.dab(pt); return; }
    const L = this.last, dx = pt.x - L.x, dy = pt.y - L.y, d = Math.hypot(dx, dy);
    if (d < 0.01) return;
    const a = Math.atan2(dy, dx);
    const prevDir = this.dir;
    if (this.dir == null) this.dir = a;
    else { let da = a - this.dir; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; this.dir += da * Math.min(1, d / Math.max(4, b.size * 0.25)); }
    if (b.engine === 'splat') { this.splat(pt, d); this.last = { ...pt }; return; }
    const sp = Math.max(0.6, this.sizeAt((L.p + pt.p) / 2) * (b.spacing || 0.1));
    let t = this.residual;
    while (t <= d) {
      const k = t / d;
      // turn the tip smoothly between input points, so flat tips leave clean edges instead of little steps
      this.dabDir = prevDir == null ? this.dir : prevDir + (this.dir - prevDir) * k;
      this.dab({ x: L.x + dx * k, y: L.y + dy * k, p: L.p + (pt.p - L.p) * k });
      t += sp;
    }
    this.residual = t - d;
    this.dist += d;
    this.last = { ...pt };
  }

  tipAngle() { const b = this.b, dir = this.dabDir ?? this.dir; return (b.follow && dir != null ? dir * 180 / Math.PI + 90 : 0) + (b.angle || 0); }

  dab(pt) {
    const b = this.b, g = this.g;
    let s = this.sizeAt(pt.p);
    if (b.jitter) s *= 1 - b.jitter * 0.5 + this.rnd() * b.jitter;
    let x = pt.x, y = pt.y;
    if (b.scatter) { const a = this.rnd() * 6.283, r = this.rnd() * s * 0.25 * b.scatter; x += Math.cos(a) * r; y += Math.sin(a) * r; }
    if (b.engine === 'paint') return this.paintDab(x, y, s, pt.p);
    const flow = b.flow * (b.tool === 'airbrush' ? pt.p : this.strengthAt(pt.p));
    const color = b.engine === 'erase' ? '#000000' : this.color;
    const sponge = b.tip === 'sponge', t = tip(s, b.hard ?? 0.5, color, b.round ?? 1, this.tipAngle() + (sponge ? Math.floor(this.rnd() * 12) * 30 : 0), b.tip, sponge ? Math.floor(this.rnd() * 4) : 0);
    g.save();
    if (b.engine === 'erase') g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = Math.min(1, b.engine === 'marker' ? 1 : flow);
    if (this.grain && b.grain) {
      // pigment catches the paper tooth: mask the tip with the grain at this spot on the page
      const tc = this.tmp; if (tc.width < t.width || tc.height < t.height) { tc.width = t.width + 4; tc.height = t.height + 4; }
      const tg = tc.getContext('2d');
      tg.globalCompositeOperation = 'copy'; tg.drawImage(t, 0, 0);
      tg.globalCompositeOperation = 'destination-in';
      const pat = tg.createPattern(this.grain, 'repeat'), scl = this.o.grainScale || 1;
      pat.setTransform(new DOMMatrix().scale(scl).translate(-(x - t.width / 2) / scl, -(y - t.height / 2) / scl));
      tg.globalAlpha = 1; tg.fillStyle = pat;
      const passes = b.wax ? 1 + Math.round(pt.p * b.wax) : 1; // harder press fills more of the valleys
      tg.fillRect(0, 0, t.width, t.height);
      tg.globalCompositeOperation = 'source-over';
      for (let i = 0; i < passes; i++) g.drawImage(tc, 0, 0, t.width, t.height, x - t.width / 2, y - t.height / 2, t.width, t.height);
      if (b.grain < 1) { g.globalAlpha = flow * (1 - b.grain) * 0.6; g.drawImage(t, x - t.width / 2, y - t.height / 2); }
    } else {
      g.drawImage(t, x - t.width / 2, y - t.height / 2);
    }
    if (b.dust && this.rnd() < 0.5) { // charcoal dust
      g.globalAlpha = 0.25 * b.dust; g.fillStyle = color;
      for (let i = 0; i < 3; i++) { const a = this.rnd() * 6.283, r = s * (0.6 + this.rnd()); g.fillRect(x + Math.cos(a) * r, y + Math.sin(a) * r, 1 + this.rnd() * 1.5, 1 + this.rnd() * 1.5); }
    }
    g.restore();
    this.grow(x, y, s);
  }

  // ---------- wet paint ----------
  initPaint() {
    const b = this.b, N = MIXN;
    this.mixRYB = b.mixMode !== 'light';
    this.buf = new Float32Array(N * N * 4); // color (ryb or rgb) + amount, per cell
    const K = this.toSpace(this.color);
    const a0 = b.load > 0 ? 1 : 0;
    for (let i = 0; i < N * N; i++) { this.buf[i * 4] = K[0]; this.buf[i * 4 + 1] = K[1]; this.buf[i * 4 + 2] = K[2]; this.buf[i * 4 + 3] = a0; }
    this.K = K;
    this.bufC = mk(N, N); this.bufG = this.bufC.getContext('2d'); this.bufImg = this.bufG.createImageData(N, N);
    this.samp = mk(N, N, true); this.sampG = this.samp.getContext('2d', { willReadFrequently: true });
    this.dabC = mk(8, 8); this.maskC = mk(8, 8); this.tipC = mk(8, 8); this.grC = mk(8, 8);
    if (HAIR_SHAPES.has(b.tip)) {
      const n = Math.round(b.tip === 'rake' ? Math.max(4, Math.min(14, (b.bristles || 24) / 3)) : (b.bristles || 24)); this.hairs = [];
      for (let i = 0; i < n; i++) this.hairs.push({ off: (i + this.rnd() * 0.8) / n * 2 - 1, load: 0.8 + this.rnd() * 0.4, w: 0.5 + this.rnd(), ph: this.rnd() * 100, f: 0.6 + this.rnd() * 0.8, sh: this.rnd() });
    }
    this.tipKey = '';
    if (b.impasto > 0 && !this.o.heightCtx && this.g.canvas) { const c = mk(this.g.canvas.width, this.g.canvas.height); this.ownHeight = c; this.o.heightCtx = c.getContext('2d'); }
  }
  toSpace(hex) { const c = rgb(hex).map(v => v / 255); return this.mixRYB ? rgb2ryb(...c) : c; }

  // the tip shape as an alpha mask, before rotation (hairs run along x, the stroke direction)
  buildTip(D) {
    const b = this.b, c = this.tipC; if (c.width < D || c.height < D) { c.width = D; c.height = D; }
    const g = c.getContext('2d'), r = D / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.translate(r, r);
    const env = (soft) => { // the outline of the tip
      g.save(); g.scale(b.tip === 'flat' ? Math.max(0.08, b.round ?? 0.25) : 1, b.tip === 'flat' ? 1 : Math.max(0.08, b.round ?? 1));
      if (PATH_SHAPES.has(b.tip)) { g.fillStyle = '#000'; fillShape(g, b.tip, r, soft); g.restore(); return; }
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
      gr.addColorStop(0, '#000'); gr.addColorStop(Math.min(0.98, Math.max(0.02, soft)), '#000'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      if (b.tip === 'flat') { g.beginPath(); g.roundRect(-r, -r, D, D, r * 0.25); g.fill(); } else { g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); }
      g.restore();
    };
    if (this.hairs) {
      // each hair is a streak running along the stroke; drying hairs fade and skip
      g.fillStyle = '#000';
      const avg = this.hairs.reduce((s, h) => s + Math.max(0, h.load), 0) / this.hairs.length;
      if (avg > 0.45 && b.tip !== 'rake') { g.globalAlpha = Math.min(0.42, (avg - 0.45) * 1.2); g.fillRect(-r, -r * 0.92, D, r * 1.84); } // a loaded brush has a solid core
      for (const h of this.hairs) {
        let a = Math.min(1, Math.max(0, h.load * 1.3));
        if (h.load < 0.4 && noise1(h.ph + this.dist * 0.01 * h.f) > h.load * 2.4) a *= 0.08;
        if (a < 0.02) continue;
        const w = Math.max(0.7, D / this.hairs.length * (b.tip === 'rake' ? 0.45 : h.w * 0.95));
        g.globalAlpha = a * (0.4 + h.sh * 0.6);
        g.fillRect(-r, h.off * r * 0.96 - w / 2, D, w);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'destination-in'; env(b.hard ?? 0.6); g.globalCompositeOperation = 'source-over';
    } else if (b.tip === 'chalk') {
      env(b.hard ?? 0.7);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000';
      for (let i = 0; i < D * 0.6; i++) { const a = this.rnd() * 6.283, rr = Math.sqrt(this.rnd()) * r; g.globalAlpha = 0.3 + this.rnd() * 0.5; g.fillRect(Math.cos(a) * rr, Math.sin(a) * rr, 1 + this.rnd() * D * 0.03, 1 + this.rnd() * D * 0.03); }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    } else { env(b.hard ?? 0.6); if (b.tip === 'sponge') spongeHoles(g, r, () => this.rnd()); }
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  paintDab(x, y, s, p) {
    const b = this.b, N = MIXN, D = Math.max(3, Math.ceil(s) + 2), r = D / 2;
    // 1. what is under the brush, on the mixing grid
    const S = this.sampleUnder(x - r, y - r, D), buf = this.buf;
    // 2. mix it into the paint on the brush, then load fresh paint
    // rates are per distance travelled, so spacing does not change how a brush mixes
    const kStep = Math.max(0.01, Math.min(1, (b.spacing || 0.05) / 0.8));
    const pick = 1 - Math.pow(1 - Math.min(0.99, b.pickup * (0.4 + 0.6 * p)), kStep);
    const L = 1 - Math.pow(1 - Math.min(0.99, b.load * (0.3 + 0.7 * p)), kStep), K = this.K;
    const depl = b.dry ? Math.min(0.2, b.dry * 0.004 * (b.spacing / 0.05)) : 0;
    const ryb = this.mixRYB, blurAmt = b.soften || 0;
    const dr = b.drag ?? 0.5, dragK = Math.pow(2, (dr - 0.5) * 6), fadeK = Math.min(1.6, Math.pow(1 / dragK, 0.8));
    for (let i = 0; i < N * N; i++) {
      const j = i * 4, ua = S[j + 3] / 255;
      let A = buf[j + 3], c0 = buf[j], c1 = buf[j + 1], c2 = buf[j + 2];
      if (pick > 0) {
        // drag: how strongly the paint already on the brush wins over the color under it, and how slowly it runs out
        const keep = 1 - pick * (0.35 + 0.65 * ua);
        const wb = A * keep * dragK, wu = ua * pick;
        const tot = wb + wu;
        if (wu > 0.0005 && tot > 0) {
          let u0 = S[j] / 255, u1 = S[j + 1] / 255, u2 = S[j + 2] / 255;
          if (ryb) [u0, u1, u2] = rgb2ryb(u0, u1, u2);
          c0 = (c0 * wb + u0 * wu) / tot; c1 = (c1 * wb + u1 * wu) / tot; c2 = (c2 * wb + u2 * wu) / tot;
        }
        A = Math.min(1, A * Math.max(0, 1 - (1 - keep) * fadeK) + wu);
      }
      if (L > 0) {
        const keep = A * (1 - L), tot = keep + L;
        c0 = (c0 * keep + K[0] * L) / tot; c1 = (c1 * keep + K[1] * L) / tot; c2 = (c2 * keep + K[2] * L) / tot;
        A = Math.min(1, tot);
      }
      if (depl) A *= 1 - depl;
      buf[j] = c0; buf[j + 1] = c1; buf[j + 2] = c2; buf[j + 3] = A;
    }
    if (blurAmt > 0) { this.blurBuf(blurAmt); if (blurAmt > 0.5) this.blurBuf(blurAmt - 0.4); }
    const img = this.bufImg.data;
    for (let i = 0; i < N * N; i++) {
      const j = i * 4; let o0 = buf[j], o1 = buf[j + 1], o2 = buf[j + 2];
      if (ryb) [o0, o1, o2] = ryb2rgb(o0, o1, o2);
      img[j] = o0 * 255; img[j + 1] = o1 * 255; img[j + 2] = o2 * 255; img[j + 3] = buf[j + 3] * 255;
    }
    this.bufG.putImageData(this.bufImg, 0, 0);
    // 3. the tip mask: shape, hairs, paper grain
    if (this.hairs) for (const h of this.hairs) h.load -= (b.spacing * s) * 0.0009 * (b.dry || 0) * (1.4 - h.w * 0.4) * (40 / Math.max(10, b.size)) * 1.5;
    // the tip is only redrawn when its size changes or the hairs have dried a little more
    const key = Math.round(D / 2) + '|' + (this.hairs ? Math.floor(this.dist / Math.max(3, s * 0.35)) : 0) + (b.tip === 'chalk' || b.tip === 'sponge' ? '|' + (Math.floor(this.dist / Math.max(3, s * 0.2)) % 4) : '');
    if (key !== this.tipKey) { this.buildTip(D); this.tipKey = key; }
    const m = this.maskC; if (m.width < D || m.height < D) { m.width = D; m.height = D; }
    const mg = m.getContext('2d');
    mg.setTransform(1, 0, 0, 1, 0, 0); mg.globalCompositeOperation = 'copy'; mg.globalAlpha = 1;
    mg.translate(r, r); mg.rotate(this.tipAngle() * Math.PI / 180 - (b.follow ? Math.PI / 2 : 0)); mg.drawImage(this.tipC, 0, 0, D, D, -r, -r, D, D);
    mg.setTransform(1, 0, 0, 1, 0, 0);
    if (this.grain && b.grain > 0) {
      const gc = this.grC; if (gc.width < D || gc.height < D) { gc.width = D; gc.height = D; }
      const gg = gc.getContext('2d'); gg.globalCompositeOperation = 'copy'; gg.drawImage(m, 0, 0);
      gg.globalCompositeOperation = 'destination-in';
      const pat = gg.createPattern(this.grain, 'repeat'), scl = this.o.grainScale || 1;
      pat.setTransform(new DOMMatrix().scale(scl).translate(-(x - r) / scl, -(y - r) / scl));
      gg.fillStyle = pat; gg.fillRect(0, 0, D, D);
      const gAmt = Math.max(0, b.grain * (1 - Math.min(0.85, p * (b.wax || 0) * 0.6)));
      mg.globalCompositeOperation = 'destination-out'; mg.globalAlpha = gAmt; mg.fillRect(0, 0, D, D);
      mg.globalCompositeOperation = 'source-over'; mg.globalAlpha = 1; mg.drawImage(gc, 0, 0);
    }
    // 4. the dab: brush paint cut to the tip
    const dc = this.dabC; if (dc.width < D || dc.height < D) { dc.width = D; dc.height = D; }
    const dg = dc.getContext('2d');
    dg.globalCompositeOperation = 'copy'; dg.imageSmoothingEnabled = true; dg.imageSmoothingQuality = 'high';
    dg.drawImage(this.bufC, 0, 0, N, N, 0, 0, D, D);
    dg.globalCompositeOperation = 'destination-in'; dg.drawImage(m, 0, 0, D, D, 0, 0, D, D);
    // 5. put it on the layer
    const st0 = Math.min(0.999, b.opacity * b.flow * this.strengthAt(p) * (1 - (b.wet || 0) * 0.75));
    const g = this.g, strength = st0 >= 0.995 ? 1 : 1 - Math.pow(1 - st0, Math.max(0.12, kStep * 4));
    g.save();
    if (b.lift > 0) { g.globalCompositeOperation = 'destination-out'; g.globalAlpha = Math.min(1, b.lift * 0.35 * (0.4 + 0.6 * p)); g.drawImage(m, 0, 0, D, D, x - r, y - r, D, D); }
    g.globalCompositeOperation = this.o.alphaLock ? 'source-atop' : (b.blend || 'source-over');
    g.globalAlpha = strength;
    g.drawImage(dc, 0, 0, D, D, x - r, y - r, D, D);
    g.restore();
    if (b.impasto > 0 && this.o.heightCtx) { const h = this.o.heightCtx; h.save(); h.globalAlpha = Math.min(1, 0.09 * b.impasto * (0.5 + 0.5 * p)); h.drawImage(m, 0, 0, D, D, x - r, y - r, D, D); h.restore(); }
    this.grow(x, y, r);
  }

  // The page under the brush. A fixed source (the page before this stroke) is read once in 256 px tiles
  // and kept, so painting never waits on the graphics card. A live source (makers, previews) is read directly.
  sampleUnder(x0, y0, D) {
    const N = MIXN, b = this.b, S = this.S || (this.S = new Uint8ClampedArray(N * N * 4));
    const src = this.o.sampleSrc;
    if (!src) {
      const sg = this.sampG; sg.clearRect(0, 0, N, N);
      if (b.sampleAll !== false && this.o.below) sg.drawImage(this.o.below, x0, y0, D, D, 0, 0, N, N);
      if (this.o.layerCtx) sg.drawImage(this.o.layerCtx.canvas, x0, y0, D, D, 0, 0, N, N);
      S.set(sg.getImageData(0, 0, N, N).data); return S;
    }
    const W = src.width, H = src.height, T = 256, tiles = this.tiles || (this.tiles = new Map());
    const sctx = this.srcCtx || (this.srcCtx = src.getContext('2d'));
    const tile = (tx, ty) => { const k = tx + ',' + ty; let t = tiles.get(k); if (!t) { const w = Math.min(T, W - tx * T), h = Math.min(T, H - ty * T); t = { w, d: sctx.getImageData(tx * T, ty * T, w, h).data }; tiles.set(k, t); } return t; };
    const step = D / N, off = step * 0.5;
    // two samples per cell (center and a quarter step away) for smoother color
    for (let j = 0; j < N; j++) {
      const py = Math.floor(y0 + off + j * step);
      for (let i = 0; i < N; i++) {
        const o = (j * N + i) * 4, px = Math.floor(x0 + off + i * step);
        if (px < 0 || py < 0 || px >= W || py >= H) { S[o] = S[o + 1] = S[o + 2] = S[o + 3] = 0; continue; }
        const t = tile(px >> 8, py >> 8), q = (((py & 255) * t.w) + (px & 255)) * 4, d = t.d;
        S[o] = d[q]; S[o + 1] = d[q + 1]; S[o + 2] = d[q + 2]; S[o + 3] = d[q + 3];
      }
    }
    return S;
  }

  blurBuf(k) {
    // a light box blur on the paint grid, weighted by paint amount
    const N = MIXN, buf = this.buf, out = (this.buf2 && this.buf2.length === buf.length) ? this.buf2 : new Float32Array(buf.length), w = Math.min(0.9, k);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let s0 = 0, s1 = 0, s2 = 0, sa = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = Math.min(N - 1, Math.max(0, x + dx)), yy = Math.min(N - 1, Math.max(0, y + dy)), j = (yy * N + xx) * 4, a = buf[j + 3] + 1e-4;
        s0 += buf[j] * a; s1 += buf[j + 1] * a; s2 += buf[j + 2] * a; sa += a; n++;
      }
      const j = (y * N + x) * 4;
      out[j] = buf[j] * (1 - w) + (s0 / sa) * w; out[j + 1] = buf[j + 1] * (1 - w) + (s1 / sa) * w; out[j + 2] = buf[j + 2] * (1 - w) + (s2 / sa) * w;
      out[j + 3] = buf[j + 3] * (1 - w) + (sa / n) * w;
    }
    this.buf2 = this.buf; this.buf = out;
  }

  // Call when the stroke ends: thick paint gets its light and shadow.
  finish(layerCtx = this.g) {
    const b = this.b;
    if (b.engine === 'paint' && b.impasto > 0 && this.o.heightCtx) {
      reliefLight(layerCtx, this.o.heightCtx.canvas, this.bbox, b.impasto, b.size);
      const [x0, y0, x1, y1] = this.bbox; this.o.heightCtx.clearRect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    }
  }

  splat(pt, d) {
    const g = this.g, s = this.sizeAt(pt.p), n = Math.ceil(d / 6);
    g.save(); g.fillStyle = this.color;
    for (let i = 0; i < n; i++) {
      const a = this.rnd() * 6.283, r = Math.pow(this.rnd(), 1.8) * s * 1.5, dr = Math.max(0.6, (1 - r / (s * 1.5)) * s * 0.12 * (0.3 + this.rnd()));
      g.globalAlpha = 0.85 + this.rnd() * 0.15;
      g.beginPath(); g.arc(pt.x + Math.cos(a) * r, pt.y + Math.sin(a) * r, dr, 0, 7); g.fill();
    }
    g.restore();
    this.grow(pt.x, pt.y, s * 1.6);
  }
}

// Thick paint: the brush marks in the height canvas become soft rounded ridges lit from the top left.
// The height is blurred first so the paint looks like a smooth body of paint with bristle grooves,
// not thin stamped outlines.
export function reliefLight(ctx, heightCanvas, bbox, amount = 1, size = 30) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const x0 = Math.max(0, Math.floor(bbox[0]) - 2), y0 = Math.max(0, Math.floor(bbox[1]) - 2), x1 = Math.min(W, Math.ceil(bbox[2]) + 2), y1 = Math.min(H, Math.ceil(bbox[3]) + 2);
  const w = x1 - x0, h = y1 - y0; if (w < 5 || h < 5) return;
  const hd = heightCanvas.getContext('2d').getImageData(x0, y0, w, h).data, id = ctx.getImageData(x0, y0, w, h), d = id.data;
  let Hm = new Float32Array(w * h), T = new Float32Array(w * h); let hmax = 0;
  for (let i = 0; i < w * h; i++) { Hm[i] = hd[i * 4 + 3] / 255; if (Hm[i] > hmax) hmax = Hm[i]; }
  if (hmax <= 0) return;
  for (let i = 0; i < w * h; i++) Hm[i] /= hmax;
  // two box blurs = a soft round profile; wider brushes get a wider, rounder body
  const rad = Math.max(2, Math.min(10, Math.round(size * 0.09)));
  const blur = (src, dst, horiz) => {
    const n = horiz ? w : h, m = horiz ? h : w, st = horiz ? 1 : w, ln = horiz ? w : 1, k = 1 / (rad * 2 + 1);
    for (let j = 0; j < m; j++) {
      const base = j * ln; let acc = 0;
      for (let i = -rad; i <= rad; i++) acc += src[base + Math.max(0, Math.min(n - 1, i)) * st];
      for (let i = 0; i < n; i++) { dst[base + i * st] = acc * k; acc += src[base + Math.min(n - 1, i + rad + 1) * st] - src[base + Math.max(0, i - rad) * st]; }
    }
  };
  const raw = Hm.slice();
  for (let p = 0; p < 2; p++) { blur(Hm, T, true); blur(T, Hm, false); }
  // keep a little of the sharp bristle grooves on top of the soft body
  for (let i = 0; i < w * h; i++) Hm[i] = Hm[i] * 0.86 + raw[i] * 0.14 * Math.min(1, Hm[i] * 3);
  const k = 30 * amount / Math.max(1, rad * 0.45);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, a = d[i * 4 + 3]; if (a < 8) continue;
    const hv = Hm[i]; if (hv < 0.02) continue;
    // fade the effect in smoothly from the thin edge of the paint
    const wgt = Math.min(1, hv / 0.35) * (a / 255);
    const dx = Hm[i + 1] - Hm[i - 1], dy = Hm[i + w] - Hm[i - w];
    const slope = (-dx - dy) * k;
    const l = Math.tanh(slope) * 42 * wgt, spec = Math.max(0, Math.tanh(slope * 1.4) - 0.5) * 46 * wgt;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.max(0, Math.min(255, d[i * 4 + c] + l + spec));
  }
  ctx.putImageData(id, x0, y0);
}

// Older helper kept for the makers: relief from brightness.
export function impastoFinish(canvas, bbox, amount = 1) {
  const [x0, y0, x1, y1] = bbox.map(Math.round); const w = x1 - x0, h = y1 - y0; if (w < 3 || h < 3) return;
  const g = canvas.getContext('2d'), id = g.getImageData(x0, y0, w, h), d = id.data, H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) { const a = d[i * 4 + 3] / 255; H[i] = a * (0.55 + 0.45 * (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255); }
  const k = 260 * amount;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x; if (d[i * 4 + 3] < 8) continue;
    const dx = H[i + 1] - H[i - 1], dy = H[i + w] - H[i - w];
    const l = (-dx - dy) * k, spec = Math.max(0, l - 40) * 0.6;
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.max(0, Math.min(255, d[i * 4 + c] + l + spec));
  }
  g.putImageData(id, x0, y0);
}

// Watercolor finish: darker pooled edges, applied when the stroke ends.
export function watercolorFinish(strokeCanvas, bbox, wet = 0.7) {
  const [x0, y0, x1, y1] = bbox.map(Math.round);
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return;
  const c = mk(w, h), g = c.getContext('2d');
  g.drawImage(strokeCanvas, x0, y0, w, h, 0, 0, w, h);
  const blur = mk(w, h), bg = blur.getContext('2d');
  bg.filter = `blur(${Math.max(2, Math.min(w, h) * 0.01 + 3)}px)`; bg.drawImage(c, 0, 0);
  const edge = mk(w, h), eg = edge.getContext('2d');
  eg.drawImage(c, 0, 0); eg.globalCompositeOperation = 'destination-out'; eg.globalAlpha = 0.9; eg.drawImage(blur, 0, 0);
  const sg = strokeCanvas.getContext('2d');
  sg.save(); sg.globalCompositeOperation = 'source-over'; sg.globalAlpha = wet;
  sg.drawImage(edge, x0, y0); sg.restore();
}

// Fill bucket on a layer, using what is visible on that layer.
export function floodFill(ctx, x, y, color, tol = 32) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= W || y >= H) return null;
  const img = ctx.getImageData(0, 0, W, H), d = img.data, i0 = (y * W + x) * 4;
  const t = [d[i0], d[i0 + 1], d[i0 + 2], d[i0 + 3]], [R, G, B] = rgb(color);
  const seen = new Uint8Array(W * H), stack = [y * W + x];
  const near = i => Math.abs(d[i] - t[0]) + Math.abs(d[i + 1] - t[1]) + Math.abs(d[i + 2] - t[2]) + Math.abs(d[i + 3] - t[3]) <= tol * 2;
  let minx = x, miny = y, maxx = x, maxy = y;
  while (stack.length) {
    const p = stack.pop(); if (seen[p]) continue; seen[p] = 1;
    const i = p * 4; if (!near(i)) continue;
    d[i] = R; d[i + 1] = G; d[i + 2] = B; d[i + 3] = 255;
    const px = p % W, py = (p / W) | 0;
    if (px < minx) minx = px; if (px > maxx) maxx = px; if (py < miny) miny = py; if (py > maxy) maxy = py;
    if (px > 0) stack.push(p - 1); if (px < W - 1) stack.push(p + 1); if (py > 0) stack.push(p - W); if (py < H - 1) stack.push(p + W);
  }
  ctx.putImageData(img, 0, 0, minx, miny, maxx - minx + 1, maxy - miny + 1);
  return [minx, miny, maxx + 1, maxy + 1];
}

// ---------- the drawing tool you see on the page ----------
// Drawn in screen space, tip at (0,0), body going down-right like it is held in the right hand.
export function drawTool(g, tool, color, size, lean = 0) {
  g.save();
  g.rotate(-0.62 + lean);
  const L = 150;
  const body = (w, col1, col2, from, to) => { const gr = g.createLinearGradient(-w / 2, 0, w / 2, 0); gr.addColorStop(0, col2); gr.addColorStop(0.35, col1); gr.addColorStop(0.6, shade(col1, 0.25)); gr.addColorStop(1, col2); g.fillStyle = gr; g.fillRect(-w / 2, from, w, to - from); };
  g.shadowColor = 'rgba(0,0,0,0.35)'; g.shadowBlur = 14; g.shadowOffsetX = 10; g.shadowOffsetY = 12;
  if (tool === 'pencil' || tool === 'charcoal') {
    const w = tool === 'charcoal' ? 14 : 11;
    if (tool === 'charcoal') { body(w, '#262424', '#0c0b0b', 6, L); }
    else {
      // sharpened wood cone + graphite tip + painted body + eraser end
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w / 2, 26); g.lineTo(-w / 2, 26); g.closePath();
      const wood = g.createLinearGradient(-w / 2, 0, w / 2, 0); wood.addColorStop(0, '#b98a5a'); wood.addColorStop(0.5, '#e7c294'); wood.addColorStop(1, '#a8794b');
      g.fillStyle = wood; g.fill(); g.shadowColor = 'transparent';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(w * 0.16, 7); g.lineTo(-w * 0.16, 7); g.closePath(); g.fillStyle = color; g.fill();
      body(w, color === '#3a3a3c' || color === '#1e1e20' ? '#c7372f' : color, shade(color === '#3a3a3c' || color === '#1e1e20' ? '#c7372f' : color, -0.45), 26, L - 16);
      body(w, '#c9c7c2', '#7e7c78', L - 16, L - 6); body(w, '#e59a9a', '#a35d5d', L - 6, L + 4);
    }
  } else if (tool === 'pastel') {
    const w = 16;
    g.beginPath(); g.moveTo(-w / 2 + 3, 0); g.lineTo(w / 2, 4); g.lineTo(w / 2, 40); g.lineTo(-w / 2, 40); g.lineTo(-w / 2, 6); g.closePath();
    g.fillStyle = color; g.fill(); g.shadowColor = 'transparent';
    body(w + 1, '#efe7d6', '#b7ad99', 40, L - 30);
    g.fillStyle = 'rgba(40,30,20,0.55)'; g.font = '8px sans-serif'; g.save(); g.translate(2, 70); g.rotate(Math.PI / 2); g.fillText('OIL PASTEL', 0, 0); g.restore();
  } else if (tool === 'pen' || tool === 'fineliner') {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(3, 10); g.lineTo(-3, 10); g.closePath(); g.fillStyle = '#c9c9cc'; g.fill(); g.shadowColor = 'transparent';
    g.beginPath(); g.moveTo(-3, 10); g.lineTo(3, 10); g.lineTo(6, 30); g.lineTo(-6, 30); g.closePath(); g.fillStyle = '#2a2a2c'; g.fill();
    body(12, tool === 'fineliner' ? '#e9e6df' : '#1d1d1f', tool === 'fineliner' ? '#a9a59c' : '#050505', 30, L);
    g.fillStyle = color; g.fillRect(-6, L - 18, 12, 10);
  } else if (tool === 'marker') {
    g.beginPath(); g.moveTo(-4, 0); g.lineTo(5, 3); g.lineTo(6, 16); g.lineTo(-6, 16); g.closePath(); g.fillStyle = color; g.fill(); g.shadowColor = 'transparent';
    body(20, '#f1efe9', '#a9a69e', 16, L); g.fillStyle = color; g.fillRect(-10, L - 30, 20, 16);
  } else if (tool === 'airbrush') {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 18); g.lineTo(-5, 18); g.closePath(); g.fillStyle = '#d7d7da'; g.fill(); g.shadowColor = 'transparent';
    body(14, '#d9d9dc', '#6f6f74', 18, L); g.fillStyle = '#38383b'; g.fillRect(-4, 50, 8, 10);
    g.fillStyle = color; g.beginPath(); g.arc(14, 40, 9, 0, 7); g.fill();
  } else if (tool === 'eraser') {
    g.rotate(0.3); g.fillStyle = '#f2ede6'; g.fillRect(-14, -2, 28, 44); g.shadowColor = 'transparent';
    g.fillStyle = '#2f5d8a'; g.fillRect(-14, 18, 28, 24); g.fillStyle = '#fff'; g.font = 'bold 7px sans-serif'; g.fillText('ERASER', -12, 33);
  } else if (tool === 'finger') {
    g.fillStyle = '#d9a689'; g.beginPath(); g.ellipse(0, 18, 11, 22, 0, 0, 7); g.fill(); g.shadowColor = 'transparent';
    g.fillStyle = '#e8bfa6'; g.beginPath(); g.ellipse(0, 10, 7, 9, 0, 0, 7); g.fill();
    g.fillRect(-11, 18, 22, 70);
  } else if (tool === 'knife') {
    g.beginPath(); g.moveTo(-10, 0); g.quadraticCurveTo(0, -4, 10, 0); g.lineTo(4, 42); g.lineTo(-4, 42); g.closePath();
    const st = g.createLinearGradient(-10, 0, 10, 0); st.addColorStop(0, '#8d8f94'); st.addColorStop(0.5, '#e8e9ec'); st.addColorStop(1, '#7a7c80'); g.fillStyle = st; g.fill();
    g.shadowColor = 'transparent'; g.fillStyle = color; g.beginPath(); g.moveTo(-9, 1); g.quadraticCurveTo(0, -2, 9, 1); g.lineTo(6, 14); g.lineTo(-6, 14); g.closePath(); g.fill();
    g.strokeStyle = '#6d6f73'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 42); g.lineTo(0, 64); g.stroke();
    body(13, '#5a3a24', '#2b1a0f', 64, L);
  } else if (tool === 'nib') {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(5, 14); g.lineTo(5, 26); g.lineTo(-5, 26); g.lineTo(-5, 14); g.closePath();
    const st = g.createLinearGradient(-5, 0, 5, 0); st.addColorStop(0, '#9a7a3a'); st.addColorStop(0.5, '#f0d68a'); st.addColorStop(1, '#8a6a2a'); g.fillStyle = st; g.fill();
    g.shadowColor = 'transparent'; g.fillStyle = color; g.beginPath(); g.moveTo(0, 0); g.lineTo(2.5, 7); g.lineTo(-2.5, 7); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(0, 1); g.lineTo(0, 16); g.stroke();
    body(9, '#2a1f18', '#0e0a07', 26, L + 10);
  } else if (tool === 'stump') {
    g.beginPath(); g.moveTo(0, 0); g.lineTo(7, 26); g.lineTo(-7, 26); g.closePath();
    g.fillStyle = shade(color, 0.55); g.fill(); g.shadowColor = 'transparent';
    body(14, '#e9e4d8', '#b5ad9c', 26, L - 20);
    g.strokeStyle = 'rgba(120,110,95,0.35)'; g.lineWidth = 0.8; for (let y = 34; y < L - 20; y += 9) { g.beginPath(); g.moveTo(-7, y); g.lineTo(7, y + 6); g.stroke(); }
  } else if (tool === 'waterbrush') {
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(6, 10, 4, 22); g.lineTo(-4, 22); g.quadraticCurveTo(-6, 10, 0, 0); g.fillStyle = '#e8e2d4'; g.fill(); g.shadowColor = 'transparent';
    body(9, '#d4d6da', '#8b8e94', 22, 40);
    g.fillStyle = 'rgba(190,215,235,0.55)'; g.fillRect(-9, 40, 18, L - 40); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.strokeRect(-9, 40, 18, L - 40);
    g.fillStyle = 'rgba(120,170,220,0.45)'; g.fillRect(-8, 70, 16, L - 72);
  } else if (tool === 'spray') {
    g.rotate(0.62); g.translate(-10, 6);
    body(26, '#c9c9cc', '#6f6f74', 10, 90); g.shadowColor = 'transparent';
    g.fillStyle = '#333'; g.fillRect(-6, 0, 12, 10); g.fillStyle = color; g.fillRect(-13, 40, 26, 30);
  } else if (tool === 'flat') {
    const bw = Math.min(30, 10 + size * 0.1);
    g.fillStyle = '#d8c7a5'; g.fillRect(-bw / 2, 0, bw, 26); g.shadowColor = 'transparent';
    g.fillStyle = color; g.fillRect(-bw / 2, 0, bw, 12);
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.7; for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * bw / 8, 2); g.lineTo(i * bw / 8, 25); g.stroke(); }
    body(bw * 0.9, '#cfd0d3', '#77787c', 26, 50); body(10, '#7a2a1c', '#3a110a', 50, L);
  } else { // brush, inkbrush
    const ink = tool === 'inkbrush';
    const bw = Math.min(26, 8 + size * 0.08);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(bw * 0.7, 12, bw / 2, 30); g.lineTo(-bw / 2, 30); g.quadraticCurveTo(-bw * 0.7, 12, 0, 0);
    g.fillStyle = ink ? '#151515' : '#d8c7a5'; g.fill(); g.shadowColor = 'transparent';
    // paint loaded on the tip
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(bw * 0.6, 9, bw * 0.45, 17); g.lineTo(-bw * 0.45, 17); g.quadraticCurveTo(-bw * 0.6, 9, 0, 0);
    g.fillStyle = color; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 0.7;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * bw * 0.08, 4); g.lineTo(i * bw * 0.14, 28); g.stroke(); }
    if (ink) body(12, '#b39a5c', '#6e5a2c', 30, L); // bamboo
    else { body(bw * 0.7, '#cfd0d3', '#77787c', 30, 52); body(10, '#2c2c2e', '#0b0b0c', 52, L); }
    if (ink) { g.fillStyle = 'rgba(60,45,15,0.5)'; g.fillRect(-6, 70, 12, 2); g.fillRect(-6, 110, 12, 2); }
  }
  g.restore();
}
