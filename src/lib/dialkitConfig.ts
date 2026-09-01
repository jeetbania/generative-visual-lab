import type { DialConfig } from "dialkit";
import { EffectParams, ParamField } from "./engine/types";

/** Groups a flat field list into DialKit folders keyed by `section`. */
export function fieldsToDialConfig(fields: ParamField[], current: EffectParams): DialConfig {
  const config: DialConfig = {};
  for (const f of fields) {
    const value = current[f.key] ?? f.default;
    let folder = config[f.section] as DialConfig | undefined;
    if (!folder) {
      folder = {};
      config[f.section] = folder;
    }
    if (f.type === "slider") {
      folder[f.key] = [Number(value), f.min ?? 0, f.max ?? 1, f.step ?? 0.01];
    } else if (f.type === "toggle") {
      folder[f.key] = Boolean(value);
    } else if (f.type === "select") {
      folder[f.key] = { type: "select", options: f.options ?? [], default: String(value) };
    } else if (f.type === "color") {
      folder[f.key] = { type: "color", default: String(value) };
    } else {
      folder[f.key] = { type: "text", default: String(value) };
    }
  }
  return config;
}

/** Flattens DialKit's per-folder resolved values back into the effect's flat
 *  params shape (folders exist only for inspector organization). */
export function dialValuesToParams(values: Record<string, unknown>): EffectParams {
  const out: EffectParams = {};
  for (const section of Object.values(values)) {
    if (section && typeof section === "object") {
      Object.assign(out, section as Record<string, unknown>);
    }
  }
  return out;
}
