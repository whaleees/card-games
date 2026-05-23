import Link from "next/link";

export default function HomePage() {
  return (
    <main className="container">
      <section className="hero">
        <span className="eyebrow">Soft Brain Table</span>
        <h1>A calm table for tiny puzzles.</h1>
        <p>
          Two games on a single deck. Train your number sense in 24, or rest your eyes
          in Memory. Cards feel quiet — until you flip them.
        </p>
      </section>

      <div className="game-grid">
        <Link href="/twenty-four" className="game-card">
          <h3>24</h3>
          <p>
            Hit exactly 24 using all four dealt cards with <span className="kbd">+ − × ÷</span> and parentheses.
          </p>
          <span className="play">Play →</span>
        </Link>
        <Link href="/memory" className="game-card">
          <h3>Memory</h3>
          <p>Match every pair. Play solo or invite friends with a quick room code.</p>
          <span className="play">Play →</span>
        </Link>
      </div>
    </main>
  );
}
