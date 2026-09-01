/**
 * Particle Globe — a geographic surface built entirely from stippled
 * particles sampled against real (bundled) land geometry, with a click-to-
 * place anchor + route system layered on top. One generator, three
 * projections (flat / orthographic globe / slight-perspective globe).
 */

import { EffectDefinition, GeoAnchor, GeoClickResult, ParamField, fieldDefaults } from "../engine/types";
import { LandPoint, ProjectionMode, greatCirclePoint, project, sampleLandPoints, unproject } from "../engine/geo";
import { BORDER_RINGS } from "../data/geo";
import { ensureContrast, mixOklch, oklchToCss, paletteSweep } from "../engine/color";
import { drawParticle, ParticleShape } from "../engine/particle";

export const particleGlobeParams: ParamField[] = [
  { key: "projection", label: "Projection", section: "Geography", type: "select", options: ["flat", "globe", "perspective"], default: "globe" },
  { key: "rotationY", label: "Rotation Y (Spin)", section: "Geography", type: "slider", min: -180, max: 180, step: 1, default: -20 },
  { key: "rotationX", label: "Rotation X (Tilt)", section: "Geography", type: "slider", min: -60, max: 60, step: 1, default: 18 },
  { key: "rotationZ", label: "Rotation Z (Roll)", section: "Geography", type: "slider", min: -45, max: 45, step: 1, default: 0 },
  { key: "zoom", label: "Zoom", section: "Geography", type: "slider", min: 0.6, max: 2.5, step: 0.01, default: 1 },
  { key: "autoRotate", label: "Auto Rotate", section: "Geography", type: "toggle", default: true },
  { key: "autoRotateSpeed", label: "Auto Rotate Speed", section: "Geography", type: "slider", min: -20, max: 20, step: 0.5, default: 3 },

  { key: "density", label: "Density", section: "Particles", type: "slider", min: 400, max: 16000, step: 100, default: 6000, noMutate: true },
  { key: "coastEmphasis", label: "Coast Emphasis", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.25 },
  { key: "borderEmphasis", label: "Border Emphasis", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0 },
  { key: "shape", label: "Shape", section: "Particles", type: "select", options: ["dot", "circle", "square", "line", "char"], default: "dot" },
  { key: "char", label: "Character", section: "Particles", type: "text", default: "•" },
  { key: "size", label: "Size", section: "Particles", type: "slider", min: 0.4, max: 6, step: 0.1, default: 1.5 },
  { key: "sizeRandomness", label: "Size Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.5 },
  { key: "opacity", label: "Opacity", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.85 },
  { key: "opacityRandomness", label: "Opacity Randomness", section: "Particles", type: "slider", min: 0, max: 1, step: 0.01, default: 0.3 },
  { key: "jitter", label: "Jitter", section: "Particles", type: "slider", min: 0, max: 2, step: 0.05, default: 0.3 },

  { key: "colorMode", label: "Color Mode", section: "Color", type: "select", options: ["single", "longitude", "latitude", "screen", "animated"], default: "screen" },
  { key: "colorSpeed", label: "Animation Speed", section: "Color", type: "slider", min: 0, max: 1, step: 0.01, default: 0.15 },

  { key: "anchorSize", label: "Anchor Size", section: "Anchors", type: "slider", min: 0.5, max: 3, step: 0.05, default: 1.4 },
  { key: "labelsVisible", label: "Labels Visible", section: "Anchors", type: "toggle", default: true },
];

export interface ParticleGlobeParams {
  projection: ProjectionMode; rotationY: number; rotationX: number; rotationZ: number; zoom: number;
  autoRotate: boolean; autoRotateSpeed: number;
  density: number; coastEmphasis: number; borderEmphasis: number;
  shape: string; char: string; size: number; sizeRandomness: number;
  opacity: number; opacityRandomness: number; jitter: number;
  colorMode: string; colorSpeed: number;
  anchorSize: number; labelsVisible: boolean;
}

interface GlobeState {
  points: LandPoint[];
  key: string;
  effRotY: number; effRotX: number; effRotZ: number; effZoom: number;
}

function keyOf(p: ParticleGlobeParams, seed: number) {
  return `${Math.round(p.density)}:${seed}:${p.coastEmphasis.toFixed(2)}`;
}

const HIT_RADIUS_PX = 14;

export const particleGlobeEffect: EffectDefinition<ParticleGlobeParams, GlobeState> = {
  id: "particle-globe",
  name: "Particle Globe",
  category: "MAPS",
  description: "A geographic surface built from stippled particles, with click-to-place anchors and routes.",
  fields: particleGlobeParams,
  defaultParams: fieldDefaults<ParticleGlobeParams>(particleGlobeParams),
  focalPoint: () => ({ x: 0.5, y: 0.48 }),

  createState(params, ctx) {
    return {
      points: sampleLandPoints(Math.round(params.density), ctx.rng.seed, params.coastEmphasis),
      key: keyOf(params, ctx.rng.seed),
      effRotY: params.rotationY, effRotX: params.rotationX, effRotZ: params.rotationZ, effZoom: params.zoom,
    };
  },

  update(state, params, ctx) {
    const k = keyOf(params, ctx.rng.seed);
    if (k !== state.key) {
      state.points = sampleLandPoints(Math.round(params.density), ctx.rng.seed, params.coastEmphasis);
      state.key = k;
    }
    state.effRotY = params.rotationY + (params.autoRotate ? (ctx.time * params.autoRotateSpeed) % 360 : 0);
    state.effRotX = params.rotationX;
    state.effRotZ = params.rotationZ;
    state.effZoom = params.zoom;
  },

  render(state, params, ctx) {
    const { ctx: c, width: w, height: h } = ctx;
    const pp = { mode: params.projection, rotationX: state.effRotX, rotationY: state.effRotY, rotationZ: state.effRotZ, zoom: state.effZoom, width: w, height: h };
    const depthScale = ctx.depth === "off" ? 1 : ctx.depth === "subtle" ? 1.1 : 1.25;
    // Effect-space is CSS pixels (Canvas.tsx scales the context by dpr), so
    // sizes below are plain CSS-pixel values — no manual dpr math needed.
    const px = 1;

    const colorFor = (lon: number, lat: number, screenX: number, screenY: number): string => {
      let t: number;
      if (params.colorMode === "longitude") t = (lon + 180) / 360;
      else if (params.colorMode === "latitude") t = (90 - lat) / 180;
      else if (params.colorMode === "screen") t = Math.max(0, Math.min(1, screenY / h));
      else if (params.colorMode === "animated") {
        const angle = ctx.time * params.colorSpeed;
        t = (Math.sin(angle + (screenX / w) * Math.PI * 2) + 1) / 2;
      } else t = 0.5;
      return oklchToCss(ensureContrast(paletteSweep(ctx.palette, t), ctx.palette.background, 0.3));
    };

    // land + coast particles
    for (const pt of state.points) {
      const lon = pt.lon + (pt.rand - 0.5) * params.jitter * 2;
      const lat = Math.max(-89.9, Math.min(89.9, pt.lat + (pt.rand - 0.5) * params.jitter));
      const proj = project(lon, lat, pp);
      if (!proj.visible) continue;
      const limb = params.projection === "flat" ? 1 : Math.max(0.15, proj.depth);
      const size = params.size * px * (1 + (pt.rand - 0.5) * params.sizeRandomness) * depthScale * (pt.coast ? 1.15 : 1);
      const opacity = params.opacity * (1 - params.opacityRandomness * 0.5 + params.opacityRandomness * pt.rand) * limb;
      drawParticle(c, { x: proj.x, y: proj.y, size, opacity, color: colorFor(lon, lat, proj.x, proj.y) }, { shape: params.shape as ParticleShape, char: params.char });
    }

    // borders
    if (params.borderEmphasis > 0.01) {
      c.save();
      c.strokeStyle = oklchToCss(ensureContrast(ctx.palette.accent, ctx.palette.background, 0.22));
      c.globalAlpha = params.borderEmphasis * 0.35;
      c.lineWidth = 0.6 * depthScale * px;
      for (const ring of BORDER_RINGS) {
        if (ring.length < 2) continue;
        const first = project(ring[0][0], ring[0][1], pp);
        if (!first.visible) continue;
        c.beginPath();
        c.moveTo(first.x, first.y);
        for (let i = 1; i < ring.length; i++) {
          const pr = project(ring[i][0], ring[i][1], pp);
          if (!pr.visible) { c.stroke(); c.beginPath(); c.moveTo(pr.x, pr.y); continue; }
          c.lineTo(pr.x, pr.y);
        }
        c.stroke();
      }
      c.restore();
    }

    const geo = ctx.geo;
    if (!geo) return;
    const byId = new Map(geo.anchors.map((a) => [a.id, a] as const));

    // routes
    for (const route of geo.routes) {
      const from = byId.get(route.fromId), to = byId.get(route.toId);
      if (!from || !to || !from.visible || !to.visible) continue;
      const pathPts: { x: number; y: number; visible: boolean }[] = [];
      if (route.curveType === "great-circle") {
        const steps = 48;
        for (let i = 0; i <= steps; i++) {
          const gp = greatCirclePoint(from.lon, from.lat, to.lon, to.lat, i / steps);
          pathPts.push(project(gp.lon, gp.lat, pp));
        }
      } else {
        const pa = project(from.lon, from.lat, pp), pb = project(to.lon, to.lat, pp);
        if (route.curveType === "straight") {
          pathPts.push(pa, pb);
        } else {
          const mx = (pa.x + pb.x) / 2, my = (pa.y + pb.y) / 2;
          const dx = pb.x - pa.x, dy = pb.y - pa.y;
          const dist = Math.hypot(dx, dy) || 1;
          const nx = -dy / dist, ny = dx / dist;
          const bow = route.curvature * dist * 0.5;
          const cx = mx + nx * bow, cy = my + ny * bow;
          const steps = 32;
          for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = (1 - t) * (1 - t) * pa.x + 2 * (1 - t) * t * cx + t * t * pb.x;
            const y = (1 - t) * (1 - t) * pa.y + 2 * (1 - t) * t * cy + t * t * pb.y;
            pathPts.push({ x, y, visible: true });
          }
        }
      }
      if (pathPts.length < 2) continue;

      const routeColor = ensureContrast(mixOklch(ctx.palette.accent, ctx.palette.focal, 0.4), ctx.palette.background, 0.3);
      c.save();
      if (route.glow > 0.01) { c.shadowColor = oklchToCss(routeColor); c.shadowBlur = route.glow * 10; }
      c.strokeStyle = oklchToCss(routeColor);
      c.globalAlpha = route.opacity;
      c.lineWidth = route.thickness * depthScale * px;
      c.lineCap = "round";
      if (route.style === "dotted") c.setLineDash([route.thickness * 2.5 * px, route.thickness * 3.5 * px]);
      c.beginPath();
      let started = false;
      for (const pt of pathPts) {
        if (!pt.visible) { started = false; continue; }
        if (!started) { c.moveTo(pt.x, pt.y); started = true; } else c.lineTo(pt.x, pt.y);
      }
      c.stroke();
      c.restore();

      if (route.style === "particle") {
        const n = Math.max(1, Math.round(route.particleCount));
        for (let i = 0; i < n; i++) {
          const t = (((ctx.time * route.speed * route.direction) / 3 + i / n) % 1 + 1) % 1;
          const idx = t * (pathPts.length - 1);
          const i0 = Math.floor(idx), i1 = Math.min(pathPts.length - 1, i0 + 1);
          const localT = idx - i0;
          const a = pathPts[i0], b = pathPts[i1];
          const x = a.x + (b.x - a.x) * localT, y = a.y + (b.y - a.y) * localT;
          drawParticle(c, { x, y, size: route.thickness * 3 * depthScale * px, opacity: route.opacity, color: oklchToCss(ctx.palette.glow) }, { shape: "circle" });
        }
      }
    }

    // anchors + labels
    for (const anchor of geo.anchors) {
      if (!anchor.visible) continue;
      const proj = project(anchor.lon, anchor.lat, pp);
      if (!proj.visible) continue;
      const pending = geo.pendingAnchorId === anchor.id;
      const anchorColor = ensureContrast(ctx.palette.accent, ctx.palette.background, 0.4);
      const r = params.anchorSize * 2.4 * depthScale * px;

      c.save();
      c.fillStyle = oklchToCss(ctx.palette.background);
      c.strokeStyle = oklchToCss(anchorColor);
      c.lineWidth = 1.4 * px;
      c.beginPath(); c.arc(proj.x, proj.y, r, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = oklchToCss(anchorColor);
      c.beginPath(); c.arc(proj.x, proj.y, r * 0.4, 0, Math.PI * 2); c.fill();
      if (pending) {
        c.globalAlpha = 0.5 + 0.5 * Math.sin(ctx.time * 6);
        c.beginPath(); c.arc(proj.x, proj.y, r * 1.9, 0, Math.PI * 2); c.stroke();
      }
      c.restore();

      if (params.labelsVisible && anchor.label) {
        c.save();
        c.font = `500 ${11 * px}px Inter, "Helvetica Neue", sans-serif`;
        c.textBaseline = "alphabetic";
        c.textAlign = "left";
        const lx = proj.x + r + 8 * px, ly = proj.y - r * 0.2;
        c.fillStyle = oklchToCss(ensureContrast(ctx.palette.accent, ctx.palette.background, 0.5));
        c.fillText(anchor.label.toUpperCase(), lx, ly);
        if (anchor.sublabel) {
          c.font = `400 ${10 * px}px "IBM Plex Mono", monospace`;
          c.fillStyle = oklchToCss(ensureContrast(ctx.palette.ambient, ctx.palette.background, 0.35));
          c.fillText(anchor.sublabel, lx, ly + 13 * px);
        }
        c.restore();
      }
    }
  },

  handleClick(params, xDevice, yDevice, ctx, state): GeoClickResult | void {
    const pp = { mode: params.projection, rotationX: state.effRotX, rotationY: state.effRotY, rotationZ: state.effRotZ, zoom: state.effZoom, width: ctx.width, height: ctx.height };
    const anchors: GeoAnchor[] = ctx.geo?.anchors ?? [];
    for (const a of anchors) {
      const proj = project(a.lon, a.lat, pp);
      if (!proj.visible) continue;
      const dist = Math.hypot(proj.x - xDevice, proj.y - yDevice);
      if (dist <= HIT_RADIUS_PX * ctx.dpr) return { kind: "select", anchorId: a.id };
    }
    const geo = unproject(xDevice, yDevice, pp);
    if (!geo) return;
    return { kind: "anchor", lon: geo.lon, lat: geo.lat };
  },
};
