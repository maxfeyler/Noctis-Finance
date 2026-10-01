/**
 * Noctis "Lunaison" mark: the lunar phases superimposed in one disc.
 * Real terminators are semi-ellipses of horizontal radius R·cos θ; three are
 * drawn (θ = 90°, 70°, 45°), evenly spaced towards the limb, and the 45°
 * terminator carries the accent.
 * Strokes do not scale with the mark, so the hairlines stay crisp from 24 px up.
 * Pass title="" when the mark sits inside an already-labelled link.
 */
export function LunaisonMark({ size = 32, title = "Noctis Finance", className }: { size?: number; title?: string; className?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} fill="none" className={className}
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}>
      <circle cx="60" cy="60" r="44" stroke="var(--mark-limb, currentColor)" strokeOpacity=".92" strokeWidth="1.15" vectorEffect="non-scaling-stroke" />
      <path d="M60 16 V104" stroke="var(--mark-limb, currentColor)" strokeOpacity=".24" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d="M60 16 A15.0 44 0 0 1 60 104" stroke="var(--mark-limb, currentColor)" strokeOpacity=".34" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d="M60 16 A31.1 44 0 0 1 60 104" stroke="var(--mark-accent, #9fe0ec)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
