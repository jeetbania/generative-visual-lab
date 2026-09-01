"use client";

import { CATEGORIES, EFFECTS, PLANNED_EFFECTS } from "@/lib/effects/registry";
import { useStudio } from "@/lib/store/StudioProvider";

export default function EffectLibrary() {
  const { state, dispatch } = useStudio();

  return (
    <div className="library">
      <div className="library-header">
        <span className="library-title">Library</span>
      </div>
      <div className="library-scroll">
        {CATEGORIES.map((cat) => {
          const built = EFFECTS.filter((e) => e.category === cat);
          const planned = PLANNED_EFFECTS.filter((e) => e.category === cat);
          if (built.length === 0 && planned.length === 0) return null;
          return (
            <div key={cat} className="library-section">
              <div className="library-category">{cat}</div>
              {built.map((e) => (
                <button
                  key={e.id}
                  className={"library-item" + (state.effectId === e.id ? " library-item--active" : "")}
                  onClick={() => dispatch({ type: "SET_EFFECT", id: e.id })}
                >
                  <span className="library-item-name">{e.name}</span>
                  <span className="library-item-desc">{e.description}</span>
                </button>
              ))}
              {planned.map((e) => (
                <div key={e.name} className="library-item library-item--planned" aria-disabled>
                  <span className="library-item-name">{e.name}</span>
                  <span className="library-item-soon">soon</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
