"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ProjectState, defaultProject, newSeed } from "./project";
import { EffectParams, GeoRoute, Quality } from "../engine/types";
import { SeededRandom, mutateNumericParams } from "../engine/random";
import { numericRanges } from "../engine/types";
import { findEffect } from "../effects/registry";
import { Preset } from "../presets";
import { surpriseMe } from "../engine/surprise";

type Action =
  | { type: "SET_EFFECT"; id: string }
  | { type: "SET_PARAM"; key: string; value: unknown }
  | { type: "SET_PARAMS"; params: EffectParams }
  | { type: "SET_SEED"; seed: number }
  | { type: "RANDOMIZE_SEED" }
  | { type: "MUTATE"; amount: number }
  | { type: "SET_BASE_COLOR"; color: string }
  | { type: "SET_MODE"; modeId: string }
  | { type: "TOGGLE_AUTOCYCLE" }
  | { type: "SET_AUTOCYCLE_SPEED"; value: number }
  | { type: "SET_COMPOSITION"; width: number; height: number; aspect: ProjectState["composition"]["aspect"] }
  | { type: "SET_DEPTH"; value: ProjectState["depth"] }
  | { type: "SET_QUALITY"; value: Quality }
  | { type: "TOGGLE_INTERACTION" }
  | { type: "SET_SPEED"; value: number }
  | { type: "TOGGLE_PLAY" }
  | { type: "SET_PLAYING"; value: boolean }
  | { type: "SET_TRANSPARENT"; value: boolean }
  | { type: "SET_ATMOSPHERE"; key: "haze" | "contrast" | "glowIntensity" | "grain"; value: number }
  | { type: "LOAD_PRESET"; preset: Preset }
  | { type: "LOAD_PROJECT"; project: ProjectState }
  | { type: "RESET_EFFECT" }
  | { type: "SET_MISC"; patch: Partial<ProjectState> }
  | { type: "GEO_ADD_ANCHOR"; lon: number; lat: number }
  | { type: "GEO_SELECT_ANCHOR"; anchorId: string; defaultRoute: Omit<GeoRoute, "id" | "fromId" | "toId"> }
  | { type: "GEO_UPDATE_ANCHOR"; id: string; patch: Partial<ProjectState["geoAnchors"][number]> }
  | { type: "GEO_REMOVE_ANCHOR"; id: string }
  | { type: "GEO_UPDATE_ROUTE"; id: string; patch: Partial<GeoRoute> }
  | { type: "GEO_REMOVE_ROUTE"; id: string }
  | { type: "GEO_CLEAR" }
  | { type: "SURPRISE_ME" };

function reducer(state: ProjectState, action: Action): ProjectState {
  switch (action.type) {
    case "SET_EFFECT":
      return { ...state, effectId: action.id };
    case "SET_PARAM":
      return { ...state, paramsByEffect: { ...state.paramsByEffect, [state.effectId]: { ...state.paramsByEffect[state.effectId], [action.key]: action.value } } };
    case "SET_PARAMS":
      return { ...state, paramsByEffect: { ...state.paramsByEffect, [state.effectId]: { ...state.paramsByEffect[state.effectId], ...action.params } } };
    case "SET_SEED":
      return { ...state, seed: action.seed };
    case "RANDOMIZE_SEED":
      return { ...state, seed: newSeed() };
    case "MUTATE": {
      const effect = findEffect(state.effectId);
      const ranges = numericRanges(effect.fields);
      const rng = new SeededRandom(newSeed());
      const current = state.paramsByEffect[state.effectId];
      const mutated = mutateNumericParams(current, ranges, action.amount, rng);
      return { ...state, seed: newSeed(), paramsByEffect: { ...state.paramsByEffect, [state.effectId]: mutated } };
    }
    case "SET_BASE_COLOR":
      return { ...state, baseColor: action.color };
    case "SET_MODE":
      return { ...state, modeId: action.modeId };
    case "TOGGLE_AUTOCYCLE":
      return { ...state, autoCycle: !state.autoCycle };
    case "SET_AUTOCYCLE_SPEED":
      return { ...state, autoCycleSpeed: action.value };
    case "SET_COMPOSITION":
      return { ...state, composition: { width: action.width, height: action.height, aspect: action.aspect } };
    case "SET_DEPTH":
      return { ...state, depth: action.value };
    case "SET_QUALITY":
      return { ...state, quality: action.value };
    case "TOGGLE_INTERACTION":
      return { ...state, interactionEnabled: !state.interactionEnabled };
    case "SET_SPEED":
      return { ...state, speed: action.value };
    case "TOGGLE_PLAY":
      return { ...state, playing: !state.playing };
    case "SET_PLAYING":
      return { ...state, playing: action.value };
    case "SET_TRANSPARENT":
      return { ...state, transparentBackground: action.value };
    case "SET_ATMOSPHERE":
      return { ...state, [action.key]: action.value };
    case "LOAD_PRESET":
      return {
        ...state,
        revision: state.revision + 1,
        effectId: action.preset.effectId,
        seed: action.preset.seed,
        baseColor: action.preset.baseColor,
        modeId: action.preset.modeId,
        paramsByEffect: {
          ...state.paramsByEffect,
          [action.preset.effectId]: { ...findEffect(action.preset.effectId).defaultParams, ...action.preset.params },
        },
      };
    case "LOAD_PROJECT":
      return { ...action.project, revision: state.revision + 1 };
    case "RESET_EFFECT":
      return { ...state, paramsByEffect: { ...state.paramsByEffect, [state.effectId]: { ...findEffect(state.effectId).defaultParams } } };
    case "SET_MISC":
      return { ...state, ...action.patch };
    case "GEO_ADD_ANCHOR": {
      const anchor = {
        id: `anchor-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        lon: action.lon, lat: action.lat,
        label: `Point ${state.geoAnchors.length + 1}`,
        size: 1, visible: true,
      };
      return { ...state, geoAnchors: [...state.geoAnchors, anchor] };
    }
    case "GEO_SELECT_ANCHOR": {
      if (!state.geoPendingAnchorId) return { ...state, geoPendingAnchorId: action.anchorId };
      if (state.geoPendingAnchorId === action.anchorId) return { ...state, geoPendingAnchorId: null };
      const route: GeoRoute = {
        ...action.defaultRoute,
        id: `route-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        fromId: state.geoPendingAnchorId, toId: action.anchorId,
      };
      return { ...state, geoRoutes: [...state.geoRoutes, route], geoPendingAnchorId: null };
    }
    case "GEO_UPDATE_ANCHOR":
      return { ...state, geoAnchors: state.geoAnchors.map((a) => (a.id === action.id ? { ...a, ...action.patch } : a)) };
    case "GEO_REMOVE_ANCHOR":
      return {
        ...state,
        geoAnchors: state.geoAnchors.filter((a) => a.id !== action.id),
        geoRoutes: state.geoRoutes.filter((r) => r.fromId !== action.id && r.toId !== action.id),
        geoPendingAnchorId: state.geoPendingAnchorId === action.id ? null : state.geoPendingAnchorId,
      };
    case "GEO_UPDATE_ROUTE":
      return { ...state, geoRoutes: state.geoRoutes.map((r) => (r.id === action.id ? { ...r, ...action.patch } : r)) };
    case "GEO_REMOVE_ROUTE":
      return { ...state, geoRoutes: state.geoRoutes.filter((r) => r.id !== action.id) };
    case "GEO_CLEAR":
      return { ...state, geoAnchors: [], geoRoutes: [], geoPendingAnchorId: null };
    case "SURPRISE_ME":
      return surpriseMe(state);
    default:
      return state;
  }
}

interface StudioContextValue {
  state: ProjectState;
  dispatch: React.Dispatch<Action>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const HISTORY_LIMIT = 60;

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, defaultProject);
  const past = useRef<ProjectState[]>([]);
  const future = useRef<ProjectState[]>([]);
  const historyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSnapshot = useRef<ProjectState>(state);
  const suppressHistory = useRef(false);
  // Mirrors past/future.length as real state (not read from refs during
  // render) purely so the Undo/Redo buttons can enable/disable correctly.
  const [historyCounts, setHistoryCounts] = useState({ past: 0, future: 0 });

  // Debounced history snapshots so continuous slider drags collapse into one
  // undo step instead of one per tick.
  useEffect(() => {
    if (suppressHistory.current) { suppressHistory.current = false; lastSnapshot.current = state; return; }
    if (historyTimer.current) clearTimeout(historyTimer.current);
    historyTimer.current = setTimeout(() => {
      past.current.push(lastSnapshot.current);
      if (past.current.length > HISTORY_LIMIT) past.current.shift();
      future.current = [];
      lastSnapshot.current = state;
      setHistoryCounts({ past: past.current.length, future: future.current.length });
    }, 500);
    return () => { if (historyTimer.current) clearTimeout(historyTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(lastSnapshot.current);
    suppressHistory.current = true;
    setHistoryCounts({ past: past.current.length, future: future.current.length });
    dispatch({ type: "LOAD_PROJECT", project: prev });
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(lastSnapshot.current);
    suppressHistory.current = true;
    setHistoryCounts({ past: past.current.length, future: future.current.length });
    dispatch({ type: "LOAD_PROJECT", project: next });
  }, []);

  const value = useMemo<StudioContextValue>(() => ({
    state, dispatch, undo, redo,
    canUndo: historyCounts.past > 0, canRedo: historyCounts.future > 0,
  }), [state, undo, redo, historyCounts]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const ctx = useContext(StudioContext);
  if (!ctx) throw new Error("useStudio must be used within StudioProvider");
  return ctx;
}
