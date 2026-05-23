"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@games/shared";
import { api } from "@/lib/api";
import { CardBoard } from "@/components/CardBoard";

type Puzzle = { id: string; cards: Card[] };

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export default function SoloView() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "good" | "bad"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000) as unknown as number;
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current);
    };
  }, [running]);

  const dealNew = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    setHint(null);
    try {
      const p = await api<Puzzle>("/api/twenty-four/new", { method: "POST", json: {} });
      setPuzzle(p);
      setSeconds(0);
      setRunning(true);
    } catch (e) {
      setFeedback({ kind: "bad", msg: `Could not reach server: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    dealNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called by CardBoard when the player reduces to 1 card.
  function onComplete(expr: string, value: number) {
    if (Math.abs(value - 24) < 1e-9) {
      setFeedback({ kind: "good", msg: `Solved — ${expr} = 24` });
      setSolvedCount((n) => n + 1);
      setRunning(false);
    } else {
      const display =
        Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
      setFeedback({ kind: "bad", msg: `Got ${display}, not 24 — undo and try again.` });
    }
  }

  function resetBoard() {
    setFeedback(null);
    setHint(null);
    setResetSignal((s) => s + 1);
  }

  async function getHint() {
    if (!puzzle) return;
    try {
      const res = await api<{ solution: string | null }>(`/api/twenty-four/hint/${puzzle.id}`);
      setHint(res.solution || "No solution exists for these cards.");
    } catch (e) {
      setFeedback({ kind: "bad", msg: (e as Error).message });
    }
  }

  return (
    <>
      <div className="hud" style={{ marginBottom: "1rem" }}>
        <div className="chip">
          <span className="label">Solved</span>
          <span className="value">{solvedCount}</span>
        </div>
        <div className="chip">
          <span className="label">Time</span>
          <span className="value">{formatTime(seconds)}</span>
        </div>
      </div>

      <div className="panel">
        {puzzle ? (
          <CardBoard
            key={puzzle.id}
            cards={puzzle.cards}
            onComplete={onComplete}
            resetSignal={resetSignal}
          />
        ) : (
          <p style={{ color: "var(--text-muted)", textAlign: "center" }}>Dealing…</p>
        )}

        <div className="row" style={{ marginTop: "1.25rem", justifyContent: "center" }}>
          <button onClick={dealNew} disabled={loading}>New deal</button>
          <button className="secondary" onClick={resetBoard} disabled={!puzzle}>Reset</button>
          <button className="ghost" onClick={getHint} disabled={!puzzle}>Hint</button>
        </div>

        {hint && (
          <div className="toast info" style={{ marginTop: "1rem" }}>
            One solution: <b>{hint}</b>
          </div>
        )}
        {feedback && (
          <div className={`toast ${feedback.kind}`} style={{ marginTop: "1rem" }}>
            {feedback.msg}
          </div>
        )}
      </div>

      <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", textAlign: "center", marginTop: "1rem" }}>
        Drag a card onto another — or tap one then tap another — then pick an operation.
      </p>
    </>
  );
}
