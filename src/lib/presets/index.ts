import { EffectParams } from "../engine/types";

export interface Preset {
  id: string;
  name: string;
  effectId: string;
  baseColor: string;
  modeId: string; // TimeMode id, or "auto"
  seed: number;
  params: EffectParams;
}

export const BUILTIN_PRESETS: Preset[] = [
  {
    id: "morning-field", name: "Morning Field", effectId: "string-field",
    baseColor: "#FDFCF9", modeId: "morning", seed: 18372,
    params: { originMode: "single", originY: 1.08, angularSpread: 168, curvature: 0.4, count: 280 },
  },
  {
    id: "violet-magnetic", name: "Violet Magnetic", effectId: "magnetic-field",
    baseColor: "#100C18", modeId: "night", seed: 5521,
    params: { fieldType: "dipole", fieldStrength: 1.3, count: 2400, trailLength: 18, colorBy: "speed" },
  },
  {
    id: "soft-dusk", name: "Soft Dusk", effectId: "string-field",
    baseColor: "#F4EFE7", modeId: "dusk", seed: 8814,
    params: { originMode: "dual", angularSpread: 120, curvature: 0.6, count: 220, baseAngle: 0 },
  },
  {
    id: "blue-hour", name: "Blue Hour", effectId: "magnetic-field",
    baseColor: "#0B0D12", modeId: "blue-hour", seed: 2291,
    params: { fieldType: "vortex", turbulence: 0.3, count: 3000, speed: 1.6, trailLength: 22 },
  },
  {
    id: "solar-bloom", name: "Solar Bloom", effectId: "string-field",
    baseColor: "#FFFFFF", modeId: "golden-hour", seed: 4471,
    params: { originMode: "single", originY: 1.02, curvature: 0.3, count: 320, particleDensity: 0.8 },
  },
  {
    id: "quiet-signal", name: "Quiet Signal", effectId: "aurora-field",
    baseColor: "#F7F5F0", modeId: "day", seed: 9012,
    params: { bandCount: 4, bandAmplitude: 60, accentLines: 2, softness: 0.4 },
  },
  {
    id: "electric-atmosphere", name: "Electric Atmosphere", effectId: "magnetic-field",
    baseColor: "#05060A", modeId: "night", seed: 6630,
    params: { fieldType: "quadrupole", fieldStrength: 1.6, count: 3600, colorBy: "speed", brightnessVariance: 0.8 },
  },
  {
    id: "warm-neutral", name: "Warm Neutral", effectId: "aurora-field",
    baseColor: "#EFE7DA", modeId: "sunrise", seed: 3345,
    params: { bandCount: 6, bandAmplitude: 130, warp: 0.55, accentLines: 3 },
  },
  {
    id: "deep-space", name: "Deep Space", effectId: "magnetic-field",
    baseColor: "#07070C", modeId: "night", seed: 7781,
    params: { fieldType: "multi-attractor", poleCount: 4, count: 4200, trailLength: 26, turbulence: 0.25 },
  },
  {
    id: "editorial-data", name: "Editorial Data", effectId: "aurora-field",
    baseColor: "#FFFFFF", modeId: "day", seed: 1120,
    params: { bandCount: 3, bandAmplitude: 40, accentLines: 5, accentOpacity: 0.5, softness: 0.2 },
  },
  {
    id: "organic-system", name: "Organic System", effectId: "string-field",
    baseColor: "#E8E3DA", modeId: "day", seed: 2020,
    params: { originMode: "center", angularSpread: 340, curvature: 0.5, count: 400, turbulence: 0.3 },
  },
  {
    id: "sunset-fan", name: "Sunset Fan", effectId: "string-field",
    baseColor: "#FBF1E7", modeId: "sunset", seed: 5588,
    params: { originMode: "dual", angularSpread: 150, curvature: 0.75, count: 260, baseAngle: -10 },
  },
];

export function findPreset(id: string): Preset | undefined {
  return BUILTIN_PRESETS.find((p) => p.id === id);
}
