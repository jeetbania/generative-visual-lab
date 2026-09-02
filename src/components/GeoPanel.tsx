"use client";

import { useStudio } from "@/lib/store/StudioProvider";
import { GeoRoute } from "@/lib/store/project";

const ROUTE_CURVES: GeoRoute["curveType"][] = ["straight", "arc", "great-circle"];
const ROUTE_STYLES: GeoRoute["style"][] = ["solid", "dotted", "particle", "arrow"];
const LINE_ANIMATIONS: GeoRoute["lineAnimation"][] = ["none", "flow", "draw", "march"];

export default function GeoPanel() {
  const { state, dispatch } = useStudio();

  return (
    <div className="geo-panel">
      <div className="export-header">ANCHORS &amp; ROUTES</div>
      <p className="export-note">Click the map to drop an anchor. Click two anchors in turn to connect them.</p>

      {state.geoAnchors.length === 0 && <p className="export-note">No anchors yet.</p>}

      {state.geoAnchors.map((a) => (
        <div className="geo-row" key={a.id}>
          <input
            className="geo-input"
            value={a.label}
            onChange={(e) => dispatch({ type: "GEO_UPDATE_ANCHOR", id: a.id, patch: { label: e.target.value } })}
          />
          <span className="geo-coord">{a.lat.toFixed(1)}, {a.lon.toFixed(1)}</span>
          <button className="geo-icon-btn" onClick={() => dispatch({ type: "GEO_REMOVE_ANCHOR", id: a.id })} title="Remove anchor">×</button>
        </div>
      ))}

      {state.geoRoutes.length > 0 && (
        <>
          <div className="export-header" style={{ marginTop: 12 }}>ROUTES</div>
          {state.geoRoutes.map((r) => {
            const from = state.geoAnchors.find((a) => a.id === r.fromId);
            const to = state.geoAnchors.find((a) => a.id === r.toId);
            return (
              <div className="geo-route-row" key={r.id}>
                <span className="geo-route-label">{from?.label ?? "?"} → {to?.label ?? "?"}</span>
                <select
                  className="geo-select"
                  value={r.curveType}
                  onChange={(e) => dispatch({ type: "GEO_UPDATE_ROUTE", id: r.id, patch: { curveType: e.target.value as GeoRoute["curveType"] } })}
                >
                  {ROUTE_CURVES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  className="geo-select"
                  value={r.style}
                  onChange={(e) => dispatch({ type: "GEO_UPDATE_ROUTE", id: r.id, patch: { style: e.target.value as GeoRoute["style"] } })}
                >
                  {ROUTE_STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <select
                  className="geo-select"
                  value={r.lineAnimation ?? "none"}
                  title="Line animation"
                  onChange={(e) => dispatch({ type: "GEO_UPDATE_ROUTE", id: r.id, patch: { lineAnimation: e.target.value as GeoRoute["lineAnimation"] } })}
                >
                  {LINE_ANIMATIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <button className="geo-icon-btn" onClick={() => dispatch({ type: "GEO_REMOVE_ROUTE", id: r.id })} title="Remove route">×</button>
              </div>
            );
          })}
        </>
      )}

      {(state.geoAnchors.length > 0 || state.geoRoutes.length > 0) && (
        <button className="geo-clear" onClick={() => dispatch({ type: "GEO_CLEAR" })}>Clear All</button>
      )}
    </div>
  );
}
