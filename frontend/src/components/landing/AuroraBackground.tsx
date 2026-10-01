"use client";

import dynamic from "next/dynamic";

// The engine is a client-only WebGL renderer; skip it during prerender.
const NorthernLights = dynamic(() => import("./NorthernLights.jsx"), { ssr: false });

/** Full-bleed animated aurora, with a vignette that keeps the text legible. */
export function AuroraBackground() {
  return (
    <div className="aurora" aria-hidden>
      <NorthernLights
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", aspectRatio: "auto" }}
      />
      <div className="aurora-vignette" />
    </div>
  );
}
