/**
 * Elastic Grid — a mesh of nodes, each spring-anchored to its rest position
 * on the grid, displaced by a live field (mouse repel/attract + turbulence).
 * The same spring behavior that holds String Field's strands together,
 * applied to a completely different geometry (a connected mesh, not strands
 * fanning from a point) — another concrete composability instance.
 */

import { EffectDefinition, ParamField, fieldDefaults } from "../engine/types";
import { FieldEngine, ForceSource } from "../engine/field";
import { behaviorSpring } from "../engine/behavior";
import { ensureContrast, mixOklch, oklchToCss } from "../engine/color";

export const elasticGridParams: ParamField[] = [
  { key: "columns", label: "Columns", section: "Grid", type: "slider", min: 4, max: 60, step: 1, default: 24, noMutate: true },
  { key: "rows", label: "Rows", section: "Grid", type: "slider", min: 4, max: 40, step: 1, default: 14, noMutate: true },
  { key: "margin", label: "Margin", section: "Grid", type: "slider", min: 0, max: 0.3, step: 0.01, default: 0.06 },
  { key: "springStrength", label: "Spring Strength", section: "Grid", type: "slider", min: 0.02, max: 1, step: 0.01, default: 0.12 },
  { key: "damping", label: "Damping", section: "Grid", type: "slider", min: 0.8, max: 0.99, step: 0.005, default: 0.88 },
  { key: "turbulence", label: "Ambient Turbulence", section: "Grid", type: "slider", min: 0, max: 1, step: 0.01, default: 0.08 },

  { key: "drawLines", label: "Draw Grid Lines", section: "Appearance", type: "toggle", default: true },
  { key: "drawNodes", label: "Draw Nodes", section: "Appearance", type: "toggle", default: true },
  { key: "lineThickness", label: "Line Thickness", section: "Appearance", type: "slider", min: 0.2, max: 2, step: 0.05, default: 0.6 },
  { key: "nodeSize", label: "Node Size", section: "Appearance", type: "slider", min: 0.5, max: 6, step: 0.1, default: 1.8 },
  { key: "opacity", label: "Opacity", section: "Appearance", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },

  { key: "mouseMode", label: "Mouse Mode", section: "Interaction", type: "select", options: ["repel", "attract"], default: "repel" },
  { key: "mouseStrength", label: "Mouse Strength", section: "Interaction", type: "slider", min: 0, max: 3, step: 0.02, default: 1.4 },
  { key: "mouseRadius", label: "Influence Radius", section: "Interaction", type: "slider", min: 40, max: 700, step: 5, default: 220 },
];

export interface ElasticGridParams {
  columns: number; rows: number; margin: number; springStrength: number; damping: number; turbulence: number;
  drawLines: boolean; drawNodes: boolean; lineThickness: number; nodeSize: number; opacity: number;
  mouseMode: "repel" | "attract"; mouseStrength: number; mouseRadius: number;
}

interface Node { rx: number; ry: number; x: number; y: number; vx: number; vy: number }
interface ElasticGridState { nodes: Node[]; cols: number; rows: number; field: FieldEngine; key: string }

function keyOf(p: ElasticGridParams, w: number, h: number) { return `${Math.round(p.columns)}:${Math.round(p.rows)}:${p.margin.toFixed(2)}:${w}:${h}`; }

function buildNodes(cols: number, rows: number, w: number, h: number, margin: number): Node[] {
  const nodes: Node[] = [];
  const mx = w * margin, my = h * margin;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const rx = mx + (i / (cols - 1)) * (w - mx * 2);
      const ry = my + (j / (rows - 1)) * (h - my * 2);
      nodes.push({ rx, ry, x: rx, y: ry, vx: 0, vy: 0 });
    }
  }
  return nodes;
}

export const elasticGridEffect: EffectDefinition<ElasticGridParams, ElasticGridState> = {
  id: "elastic-grid",
  name: "Elastic Grid",
  category: "GEOMETRY",
  description: "A spring mesh distorted by a live field — the mouse warps the grid like a magnet under a sheet.",
  fields: elasticGridParams,
  defaultParams: fieldDefaults<ElasticGridParams>(elasticGridParams),
  focalPoint: () => ({ x: 0.5, y: 0.5 }),

  createState(params, ctx) {
    const cols = Math.round(params.columns), rows = Math.round(params.rows);
    return { nodes: buildNodes(cols, rows, ctx.width, ctx.height, params.margin), cols, rows, field: new FieldEngine(ctx.rng.seed), key: keyOf(params, ctx.width, ctx.height) };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.width, ctx.height);
    if (k !== state.key) {
      const cols = Math.round(params.columns), rows = Math.round(params.rows);
      state.nodes = buildNodes(cols, rows, ctx.width, ctx.height, params.margin);
      state.cols = cols; state.rows = rows;
      state.key = k;
    }

    // NOTE: this is a DISPLACEMENT spring, not an accelerate-behavior
    // particle — its equilibrium offset is force/springStrength, so the
    // force scale here has to stay small (a "strength" tuned for particle
    // acceleration would push nodes thousands of pixels off their rest
    // position). Calibrated so default params settle into a legible dimple
    // roughly one grid cell wide, not an explosion.
    const mouseActive = ctx.interactionEnabled && ctx.mouse.active;
    const mouseSource: ForceSource = {
      kind: params.mouseMode, x: ctx.mouse.sx, y: ctx.mouse.sy,
      strength: mouseActive ? params.mouseStrength * 6 : 0, radius: params.mouseRadius, falloff: 2,
    };
    const turbulence: ForceSource = { kind: "turbulence", x: 0, y: 0, strength: params.turbulence * 15, radius: 0, scale: 0.003, speed: 0.06 };
    state.field.sources = [mouseSource, turbulence];

    for (const node of state.nodes) {
      const f = state.field.sample(node.x, node.y, ctx.time);
      behaviorSpring(node, { x: node.rx, y: node.ry }, f, ctx.dt * 60, params.springStrength, params.damping);
    }
  },

  render(state, params, ctx) {
    const { ctx: c } = ctx;
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.3;
    const color = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.3), ctx.palette.background, 0.28);
    const css = oklchToCss(color);
    const { cols, rows, nodes } = state;

    if (params.drawLines) {
      c.strokeStyle = css;
      c.globalAlpha = params.opacity;
      c.lineWidth = Math.max(0.15, params.lineThickness * depthScale);
      c.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const n = nodes[j * cols + i];
          if (i === 0) c.moveTo(n.x, n.y); else c.lineTo(n.x, n.y);
        }
      }
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const n = nodes[j * cols + i];
          if (j === 0) c.moveTo(n.x, n.y); else c.lineTo(n.x, n.y);
        }
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    if (params.drawNodes) {
      c.fillStyle = oklchToCss(mixOklch(color, ctx.palette.accent, 0.4));
      const r = (params.nodeSize / 2) * depthScale;
      c.globalAlpha = Math.min(1, params.opacity * 1.6);
      for (const n of nodes) {
        c.beginPath();
        c.arc(n.x, n.y, r, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
  },
};
