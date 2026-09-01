"use client";

import dynamic from "next/dynamic";

// The studio is a canvas-driven creative instrument with no SSR-able
// content (it reads the DPR, localStorage presets, pointer state, etc. on
// first render) — rendering it client-only avoids hydration mismatches and
// lets state hydration use plain lazy initializers instead of effects.
const Studio = dynamic(() => import("@/components/Studio"), { ssr: false });

export default function Home() {
  return <Studio />;
}
