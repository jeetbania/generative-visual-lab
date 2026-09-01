/**
 * GeoEngine — projections, land-mask sampling and great-circle math for the
 * Particle Globe / Map generator. Built on bundled Natural Earth 110m
 * geometry (see src/lib/data/geo.ts) so the effect never depends on a
 * runtime API.
 */

import { LAND_RINGS } from "../data/geo";
import { SeededRandom } from "./random";

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

// ------------------------------------------------------------- land mask

const MASK_W = 360; // 1-degree resolution — plenty for a stippled dot map
const MASK_H = 180;
let landMask: Uint8Array | null = null;
let ringBoxes: { minX: number; maxX: number; minY: number; maxY: number }[] | null = null;

function bboxOf(ring: [number, number][]) {
  let minX = 180, maxX = -180, minY = 90, maxY = -90;
  for (const [x, y] of ring) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

function pointInRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    const intersect = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function buildLandMask(): Uint8Array {
  if (landMask) return landMask;
  ringBoxes = LAND_RINGS.map(bboxOf);
  const mask = new Uint8Array(MASK_W * MASK_H);
  for (let gy = 0; gy < MASK_H; gy++) {
    const lat = 90 - (gy + 0.5) * (180 / MASK_H);
    for (let gx = 0; gx < MASK_W; gx++) {
      const lon = -180 + (gx + 0.5) * (360 / MASK_W);
      let inside = false;
      for (let i = 0; i < LAND_RINGS.length; i++) {
        const b = ringBoxes[i];
        if (lon < b.minX || lon > b.maxX || lat < b.minY || lat > b.maxY) continue;
        if (pointInRing(lon, lat, LAND_RINGS[i])) { inside = true; break; }
      }
      mask[gy * MASK_W + gx] = inside ? 1 : 0;
    }
  }
  landMask = mask;
  return mask;
}

export function isLand(lon: number, lat: number): boolean {
  const mask = buildLandMask();
  const gx = Math.max(0, Math.min(MASK_W - 1, Math.floor(((lon + 180) / 360) * MASK_W)));
  const gy = Math.max(0, Math.min(MASK_H - 1, Math.floor(((90 - lat) / 180) * MASK_H)));
  return mask[gy * MASK_W + gx] === 1;
}

export interface LandPoint { lon: number; lat: number; rand: number; coast: boolean }

/** Spherical-uniform rejection sampling against the land mask, memoized by
 *  (count, seed, coastEmphasis) so density changes stay instant on repeat. */
const sampleCache = new Map<string, LandPoint[]>();
export function sampleLandPoints(count: number, seed: number, coastEmphasis: number): LandPoint[] {
  const key = `${count}:${seed}:${coastEmphasis.toFixed(2)}`;
  const cached = sampleCache.get(key);
  if (cached) return cached;
  buildLandMask();
  const rng = new SeededRandom(seed);
  const base = Math.round(count * (1 - Math.min(0.6, coastEmphasis * 0.5)));
  const coastCount = count - base;
  const pts: LandPoint[] = [];
  let tries = 0;
  const maxTries = base * 60 + 200;
  while (pts.length < base && tries < maxTries) {
    tries++;
    const u = rng.next();
    const lat = Math.asin(2 * u - 1) * RAD2DEG;
    const lon = rng.range(-180, 180);
    if (isLand(lon, lat)) pts.push({ lon, lat, rand: rng.next(), coast: false });
  }
  // coast-hugging extra points: walk random rings, jitter slightly inland
  for (let i = 0; i < coastCount && LAND_RINGS.length > 0; i++) {
    const ring = LAND_RINGS[Math.floor(rng.next() * LAND_RINGS.length)];
    if (ring.length < 2) continue;
    const idx = Math.floor(rng.next() * ring.length);
    const [lon0, lat0] = ring[idx];
    const jitterLon = lon0 + rng.gaussian() * 1.2;
    const jitterLat = lat0 + rng.gaussian() * 1.2;
    pts.push({ lon: jitterLon, lat: Math.max(-89, Math.min(89, jitterLat)), rand: rng.next(), coast: true });
  }
  sampleCache.set(key, pts);
  if (sampleCache.size > 40) sampleCache.delete(sampleCache.keys().next().value!);
  return pts;
}

// ------------------------------------------------------------- projections

export type ProjectionMode = "flat" | "globe" | "perspective";

export interface ProjectionParams {
  mode: ProjectionMode;
  rotationX: number; // tilt, degrees
  rotationY: number; // spin (longitude offset), degrees
  rotationZ: number; // roll, degrees
  zoom: number;
  width: number;
  height: number;
}

export interface Projected { x: number; y: number; visible: boolean; depth: number }

function rollPoint(x: number, y: number, cx: number, cy: number, rollDeg: number): { x: number; y: number } {
  if (!rollDeg) return { x, y };
  const r = rollDeg * DEG2RAD;
  const dx = x - cx, dy = y - cy;
  return { x: cx + dx * Math.cos(r) - dy * Math.sin(r), y: cy + dx * Math.sin(r) + dy * Math.cos(r) };
}

export function project(lon: number, lat: number, p: ProjectionParams): Projected {
  const cx = p.width / 2, cy = p.height / 2;
  if (p.mode === "flat") {
    const lonN = ((((lon + p.rotationY + 180) % 360) + 360) % 360) - 180;
    const scale = (p.width / 360) * p.zoom;
    const x = cx + lonN * scale;
    const y = cy - lat * scale;
    const rolled = rollPoint(x, y, cx, cy, p.rotationZ);
    return { x: rolled.x, y: rolled.y, visible: true, depth: 1 };
  }

  const radius = Math.min(p.width, p.height) * 0.42 * p.zoom;
  const lambda = (lon - p.rotationY) * DEG2RAD;
  const phi = lat * DEG2RAD;
  const phi0 = p.rotationX * DEG2RAD;
  const cosc = Math.sin(phi0) * Math.sin(phi) + Math.cos(phi0) * Math.cos(phi) * Math.cos(lambda);
  let x = radius * Math.cos(phi) * Math.sin(lambda);
  let y = radius * (Math.cos(phi0) * Math.sin(phi) - Math.sin(phi0) * Math.cos(phi) * Math.cos(lambda));

  if (p.mode === "perspective") {
    const persp = 1 / (1.55 - 0.55 * Math.max(-1, cosc));
    x *= persp; y *= persp;
  }

  const rolled = rollPoint(cx + x, cy - y, cx, cy, p.rotationZ);
  return { x: rolled.x, y: rolled.y, visible: cosc > -0.02, depth: cosc };
}

/** Inverse orthographic — used to place anchors by click on the globe. Flat
 *  mode inverts trivially. Returns null when the click misses the sphere. */
export function unproject(px: number, py: number, p: ProjectionParams): { lon: number; lat: number } | null {
  const cx = p.width / 2, cy = p.height / 2;
  if (p.mode === "flat") {
    const scale = (p.width / 360) * p.zoom;
    const lon = (px - cx) / scale - p.rotationY;
    const lat = -(py - cy) / scale;
    if (lat < -90 || lat > 90) return null;
    return { lon: ((lon + 540) % 360) - 180, lat };
  }
  const radius = Math.min(p.width, p.height) * 0.42 * p.zoom;
  const x = (px - cx) / radius, y = -(py - cy) / radius;
  const rho = Math.hypot(x, y);
  if (rho > 1.0) return null;
  const c = Math.asin(Math.min(1, rho));
  const phi0 = p.rotationX * DEG2RAD;
  const lat = rho < 1e-6 ? phi0 : Math.asin(Math.cos(c) * Math.sin(phi0) + (y * Math.sin(c) * Math.cos(phi0)) / rho);
  const lon = p.rotationY * DEG2RAD + Math.atan2(x * Math.sin(c), rho * Math.cos(phi0) * Math.cos(c) - y * Math.sin(phi0) * Math.sin(c));
  return { lon: lon * RAD2DEG, lat: lat * RAD2DEG };
}

/** Great-circle interpolation (slerp on the sphere) between two lon/lat points. */
export function greatCirclePoint(lon1: number, lat1: number, lon2: number, lat2: number, t: number): { lon: number; lat: number } {
  const phi1 = lat1 * DEG2RAD, lambda1 = lon1 * DEG2RAD, phi2 = lat2 * DEG2RAD, lambda2 = lon2 * DEG2RAD;
  const d = 2 * Math.asin(Math.sqrt(Math.sin((phi2 - phi1) / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin((lambda2 - lambda1) / 2) ** 2));
  if (d < 1e-9) return { lon: lon1, lat: lat1 };
  const A = Math.sin((1 - t) * d) / Math.sin(d);
  const B = Math.sin(t * d) / Math.sin(d);
  const x = A * Math.cos(phi1) * Math.cos(lambda1) + B * Math.cos(phi2) * Math.cos(lambda2);
  const y = A * Math.cos(phi1) * Math.sin(lambda1) + B * Math.cos(phi2) * Math.sin(lambda2);
  const z = A * Math.sin(phi1) + B * Math.sin(phi2);
  const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
  const lon = Math.atan2(y, x);
  return { lon: lon * RAD2DEG, lat: lat * RAD2DEG };
}
