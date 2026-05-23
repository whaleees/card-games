"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Card, RANK_VALUE, TwentyFourValidateResponse } from "@games/shared";
import { api } from "@/lib/api";
import { PlayingCard } from "@/components/PlayingCard";

type Puzzle = { id: string; cards: Card[] };

type Token =
  | { kind: "num"; cardIdx: number; value: number }
  | { kind: "op"; value: "+" | "-" | "*" | "/" }
  | { kind: "paren"; value: "(" | ")" };

const OP_GLYPH: Record<"+" | "-" | "*" | "/", string> = {
  "+": "+",
  "-": "−",
  "*": "×",
  "/": "÷",
};

function tokensToExpr(toks: Token[]): string {
  return toks
    .map((t) => (t.kind === "num" ? String(t.value) : t.value))
    .join(" ");
}

function tokensToDisplay(toks: Token[]): string {
  return toks
    .map((t) =>
      t.kind === "num"
        ? String(t.value)
        : t.kind === "op"
        ? OP_GLYPH[t.value]
        : t.value
    )
    .join(" ");
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
}

export default function TwentyFourPage() {
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [feedback, setFeedback] = useState<{ kind: "good" | "bad"; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [solvedCount, setSolvedCount] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
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
    setTokens([]);
    try {
      const p = await api<Puzzle>("/api/twenty-four/new", { method: "POST", json: {} });
      setPuzzle(p);
      if (!running) {
        setSeconds(0);
        setRunning(true);
      }
    } catch (e) {
      setFeedback({ kind: "bad", msg: `Could not reach server: ${(e as Error).message}` });
    } finally {
      setLoading(false);
    }
  }, [running]);

  useEffect(() => {
    dealNew();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addCard(idx: number) {
    if (!puzzle) return;
    setFeedback(null);
    const card = puzzle.cards[idx];
    const isAce = card.rank === "A";
    setTokens((t) => {
      const existing = t.findIndex(
        (tok) => tok.kind === "num" && (tok as { cardIdx: number }).cardIdx === idx
      );
      if (existing >= 0) {
        if (!isAce) return t;
        const next = t.slice();
        const tok = next[existing] as { kind: "num"; cardIdx: number; value: number };
        next[existing] = { ...tok, value: tok.value === 1 ? 11 : 1 };
        return next;
      }
      return [...t, { kind: "num", cardIdx: idx, value: RANK_VALUE[card.rank] }];
    });
  }

  function addOp(op: "+" | "-" | "*" | "/") {
    setFeedback(null);
    setTokens((t) => [...t, { kind: "op", value: op }]);
  }

  function addParen(p: "(" | ")") {
    setFeedback(null);
    setTokens((t) => [...t, { kind: "paren", value: p }]);
  }

  function undo() {
    setFeedback(null);
    setTokens((t) => t.slice(0, -1));
  }

  function clear() {
    setFeedback(null);
    setTokens([]);
  }

  async function submit() {
    if (!puzzle) return;
    const expr = tokensToExpr(tokens);
    if (!expr.trim()) {
      setFeedback({ kind: "bad", msg: "Build an expression first." });
      return;
    }
    try {
      const res = await api<TwentyFourValidateResponse>("/api/twenty-four/validate", {
        method: "POST",
        json: { puzzleId: puzzle.id, expression: expr },
      });
      if (res.valid) {
        setFeedback({ kind: "good", msg: `Solved — ${tokensToDisplay(tokens)} = 24` });
        setSolvedCount((n) => n + 1);
        setRunning(false);
      } else {
        setFeedback({ kind: "bad", msg: res.reason || "Not 24" });
      }
    } catch (e) {
      setFeedback({ kind: "bad", msg: (e as Error).message });
    }
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

  const display = tokensToDisplay(tokens);

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>24</h1>
          <p className="lede">
            Use all four cards exactly once with <span className="kbd">+</span>{" "}
            <span className="kbd">−</span> <span className="kbd">×</span>{" "}
            <span className="kbd">÷</span> and parentheses to make 24. J/Q/K = 10. Ace = 1
            or 11 (tap the Ace again to flip).
          </p>
        </div>
        <div className="hud">
          <div className="chip">
            <span className="label">Solved</span>
            <span className="value">{solvedCount}</span>
          </div>
          <div className="chip">
            <span className="label">Time</span>
            <span className="value">{formatTime(seconds)}</span>
          </div>
        </div>
      </div>

      {puzzle && (
        <div className="row" style={{ justifyContent: "center", gap: "1.25rem", margin: "2rem 0 2.5rem" }}>
          {puzzle.cards.map((c, idx) => {
            const tok = tokens.find(
              (t) => t.kind === "num" && (t as { cardIdx: number }).cardIdx === idx
            ) as { value: number } | undefined;
            const isAce = c.rank === "A";
            const inExpr = !!tok;
            return (
              <div
                key={c.id}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}
              >
                <PlayingCard
                  card={c}
                  selectable
                  selected={isAce && inExpr}
                  used={inExpr && !isAce}
                  onClick={() => addCard(idx)}
                />
                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", minHeight: "1em", letterSpacing: "0.04em", textTransform: "uppercase" }}>
                  {isAce ? (inExpr ? `Ace = ${tok!.value}` : "1 or 11") : ""}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel">
        <div className={`expr ${tokens.length === 0 ? "empty" : ""}`}>
          {display || "Tap cards and operators to build an expression…"}
        </div>

        <div className="row" style={{ marginTop: "1rem" }}>
          {(["+", "-", "*", "/"] as const).map((op) => (
            <button key={op} className="op" onClick={() => addOp(op)}>
              {OP_GLYPH[op]}
            </button>
          ))}
          <button className="op" onClick={() => addParen("(")}>(</button>
          <button className="op" onClick={() => addParen(")")}>)</button>
          <div style={{ marginLeft: "auto", display: "flex", gap: "0.5rem" }}>
            <button className="ghost" onClick={undo}>↶ Undo</button>
            <button className="ghost" onClick={clear}>Clear</button>
          </div>
        </div>

        <div className="row" style={{ marginTop: "1.25rem" }}>
          <button onClick={submit}>Check = 24</button>
          <button className="secondary" onClick={dealNew} disabled={loading}>
            New deal
          </button>
          <button className="ghost" onClick={getHint}>Hint</button>
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
    </main>
  );
}
