// One-off preprocessing: TopoJSON (Natural Earth 110m, via world-atlas) ->
// a compact bundled TS module of plain [lon, lat] polygon rings. Runs at
// dev-time only — nothing in the shipped app depends on topojson-client.
import { feature } from "topojson-client";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(dir, "../src/lib/data");

function round(n, d = 2) {
  const m = 10 ** d;
  return Math.round(n * m) / m;
}

function downsampleRing(ring, maxPoints = 140) {
  if (ring.length <= maxPoints) return ring;
  const step = ring.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(ring[Math.floor(i * step)]);
  out.push(ring[ring.length - 1]);
  return out;
}

function ringsFromGeometry(geom, maxPoints, decimals) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const rings = [];
  for (const poly of polys) {
    // poly[0] = outer ring, poly[1..] = holes (land has essentially none, but keep structure)
    for (const ring of poly) {
      const simplified = downsampleRing(ring, maxPoints).map(([lon, lat]) => [round(lon, decimals), round(lat, decimals)]);
      rings.push(simplified);
    }
  }
  return rings;
}

const landTopo = JSON.parse(readFileSync(path.join(dataDir, "land-110m.json"), "utf8"));
const landFeature = feature(landTopo, landTopo.objects.land);
const landRings = landFeature.type === "FeatureCollection"
  ? landFeature.features.flatMap((f) => ringsFromGeometry(f.geometry, 160, 2))
  : ringsFromGeometry(landFeature.geometry, 160, 2);

const countriesTopo = JSON.parse(readFileSync(path.join(dataDir, "countries-110m.json"), "utf8"));
const countriesFeature = feature(countriesTopo, countriesTopo.objects.countries);
const borderRings = countriesFeature.features.flatMap((f) => ringsFromGeometry(f.geometry, 40, 1));

const totalLandPts = landRings.reduce((a, r) => a + r.length, 0);
const totalBorderPts = borderRings.reduce((a, r) => a + r.length, 0);
console.log(`land rings: ${landRings.length}, points: ${totalLandPts}`);
console.log(`border rings: ${borderRings.length}, points: ${totalBorderPts}`);

const out = `/**
 * Bundled Natural Earth 110m land + country-border geometry, preprocessed
 * from TopoJSON (world-atlas) into plain [lon, lat] polygon rings at
 * dev-time by scripts/build-geo.mjs. No topojson dependency at runtime.
 */
export const LAND_RINGS: [number, number][][] = ${JSON.stringify(landRings)};
export const BORDER_RINGS: [number, number][][] = ${JSON.stringify(borderRings)};
`;

writeFileSync(path.join(dataDir, "geo.ts"), out);
console.log(`wrote ${path.join(dataDir, "geo.ts")} (${(out.length / 1024).toFixed(0)} KB)`);
