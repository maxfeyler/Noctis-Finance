import Link from "next/link";
import { AuroraBackground } from "@/components/landing/AuroraBackground";

export default function Landing() {
  return (
    <main className="landing">
      <AuroraBackground />

      <header className="landing-header">
        <Link href="/" className="landing-mark" aria-label="Noctis Finance">
          <span className="mark" aria-hidden />
        </Link>
        <Link href="/app" className="ghost-btn">
          Enter App
        </Link>
      </header>

      <section className="landing-hero">
        <h1 className="landing-title">
          Noctis <em>Finance</em>
        </h1>
        <p className="landing-tagline">The place where your money moves privately.</p>
      </section>
    </main>
  );
}
