"use client";
import { useEffect, useState } from "react";
import { Card, TwentyFourRoomState } from "@games/shared";
import { getSocket } from "@/lib/socket";
import { CardBoard } from "@/components/CardBoard";
import { PlayingCard } from "@/components/PlayingCard";
import { LoveRain } from "@/components/LoveRain";

function useCountdown(endsAt: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [endsAt]);
  if (!endsAt) return null;
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export default function MultiView() {
  const [name, setName] = useState("");
  const [rounds, setRounds] = useState(5);
  const [roundSeconds, setRoundSeconds] = useState(90);
  const [joinCode, setJoinCode] = useState("");
  const [state, setState] = useState<TwentyFourRoomState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ kind: "good" | "bad"; msg: string } | null>(null);
  const [resetSignal, setResetSignal] = useState(0);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("player_name") : null;
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    const sock = getSocket();
    const onState = (s: TwentyFourRoomState) => setState(s);
    const onErr = (msg: string) => setError(msg);
    sock.on("tf:state", onState);
    sock.on("tf:error", onErr);
    return () => {
      sock.off("tf:state", onState);
      sock.off("tf:error", onErr);
    };
  }, []);

  // Clear feedback whenever the round/status changes.
  useEffect(() => {
    setFeedback(null);
  }, [state?.round, state?.status]);

  function persistName(v: string) {
    setName(v);
    if (typeof window !== "undefined") localStorage.setItem("player_name", v);
  }

  function createRoom() {
    setError(null);
    getSocket().emit(
      "tf:create",
      { name: name.trim() || "Player 1", rounds, roundSeconds },
      (res) => {
        if (res?.state) {
          setState(res.state);
          setMyPlayerId(res.state.players[0]?.id || null);
        }
      }
    );
  }

  function joinRoom() {
    setError(null);
    getSocket().emit(
      "tf:join",
      { roomId: joinCode.trim().toUpperCase(), name: name.trim() || "Player" },
      (res) => {
        if (!res.ok) {
          setError(res.error || "Could not join");
          return;
        }
        if (res.state) {
          setState(res.state);
          setMyPlayerId(res.state.players[res.state.players.length - 1]?.id || null);
        }
      }
    );
  }

  function startGame() {
    if (!state) return;
    getSocket().emit("tf:start", { roomId: state.roomId });
  }

  function leave() {
    if (state) getSocket().emit("tf:leave", { roomId: state.roomId });
    setState(null);
    setMyPlayerId(null);
    setFeedback(null);
  }

  function rematch() {
    if (!state) return;
    setError(null);
    setFeedback(null);
    getSocket().emit("tf:rematch", { roomId: state.roomId });
  }

  // CardBoard fires this when the player collapses 4 cards into one.
  function onComplete(expr: string, value: number) {
    if (!state || state.status !== "playing") return;
    // Optimistic local check (avoid pinging the server with obvious misses)
    if (Math.abs(value - 24) > 1e-9) {
      const display =
        Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
      setFeedback({ kind: "bad", msg: `That's ${display}, not 24 — undo and try again.` });
      return;
    }
    getSocket().emit("tf:submit", { roomId: state.roomId, expression: expr }, (res) => {
      if (res.valid) {
        setFeedback({ kind: "good", msg: `Got it — ${expr} = 24` });
      } else {
        setFeedback({ kind: "bad", msg: res.reason || "Server rejected your answer" });
      }
    });
  }

  const secondsLeft = useCountdown(state?.roundEndsAt ?? null);

  // ----- menu -----
  if (!state) {
    return (
      <div className="panel col">
        <div className="col" style={{ gap: "0.4rem" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.12em" }}>
            Your name
          </label>
          <input value={name} onChange={(e) => persistName(e.target.value)} placeholder="Player" />
        </div>

        <hr className="divider" />

        <div className="col" style={{ gap: "0.6rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Create a room</h3>
          <div className="row">
            <label style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>Rounds</label>
            <select value={rounds} onChange={(e) => setRounds(parseInt(e.target.value, 10))}>
              {[3, 5, 7, 10].map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
            <label style={{ color: "var(--text-muted)", fontSize: "0.92rem", marginLeft: "0.75rem" }}>Seconds / round</label>
            <select value={roundSeconds} onChange={(e) => setRoundSeconds(parseInt(e.target.value, 10))}>
              {[30, 60, 90, 120, 180].map((n) => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </select>
            <button onClick={createRoom} style={{ marginLeft: "auto" }}>Create</button>
          </div>
        </div>

        <hr className="divider" />

        <div className="col" style={{ gap: "0.6rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, letterSpacing: "-0.02em" }}>Or join a room</h3>
          <div className="row">
            <input
              placeholder="ROOM"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              style={{ textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700, width: 140, textAlign: "center" }}
              maxLength={6}
            />
            <button onClick={joinRoom} disabled={!joinCode.trim()}>Join</button>
          </div>
        </div>

        {error && <div className="toast bad">{error}</div>}
      </div>
    );
  }

  // ----- lobby -----
  if (state.status === "waiting") {
    return (
      <div className="panel col">
        <div>
          <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "0.12em" }}>Room code</div>
          <div style={{ fontSize: "2rem", fontWeight: 700, letterSpacing: "0.18em" }}>{state.roomId}</div>
          <div style={{ color: "var(--text-muted)", marginTop: 4 }}>
            {state.totalRounds} rounds — share the code with friends
          </div>
        </div>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {state.players.map((p) => (
            <div key={p.id} className="player-chip">
              <span className="name">
                {p.name}
                {p.id === myPlayerId && <span className="you">(you)</span>}
              </span>
              <span className="score">Ready</span>
            </div>
          ))}
        </div>
        <hr className="divider" />
        <div className="row">
          <button onClick={startGame}>Start game</button>
          <button className="ghost" onClick={leave}>Leave</button>
        </div>
        {error && <div className="toast bad">{error}</div>}
      </div>
    );
  }

  // ----- finished -----
  if (state.status === "finished") {
    const ranked = [...state.players].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    return (
      <>
        <LoveRain />
        <div className="winner-banner" style={{ alignItems: "stretch", textAlign: "left" }}>
          <span className="winner-label" style={{ alignSelf: "center" }}>Final</span>
          <span className="winner-name" style={{ alignSelf: "center" }}>
            {top ? `${top.name} wins` : "Game over"}
          </span>
          <div className="col" style={{ gap: "0.4rem", width: "100%" }}>
            {ranked.map((p, i) => (
              <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
                <span>
                  {i + 1}. {p.name}{p.id === myPlayerId ? " (you)" : ""}
                </span>
                <b>{p.score}</b>
              </div>
            ))}
          </div>
          <div className="rematch-row" style={{ alignSelf: "center" }}>
            <button className="rematch" onClick={rematch}>Rematch</button>
            <button className="ghost" onClick={leave}>Leave</button>
          </div>
        </div>
      </>
    );
  }

  // ----- playing or round_pause -----
  const isPause = state.status === "round_pause";
  const cards: Card[] = state.cards ?? [];

  return (
    <>
      <div className="hud" style={{ marginBottom: "1rem" }}>
        <div className="chip">
          <span className="label">Room</span>
          <span className="value" style={{ letterSpacing: "0.18em" }}>{state.roomId}</span>
        </div>
        <div className="chip">
          <span className="label">Round</span>
          <span className="value">{state.round}/{state.totalRounds}</span>
        </div>
        <div className="chip">
          <span className="label">Time</span>
          <span className="value">{secondsLeft != null ? `${secondsLeft}s` : "—"}</span>
        </div>
        <button className="ghost" onClick={leave} style={{ marginLeft: "auto" }}>Leave</button>
      </div>

      <div className="panel" style={{ marginBottom: "1rem" }}>
        <div className="row" style={{ gap: "0.5rem", flexWrap: "wrap" }}>
          {state.players.map((p) => (
            <div
              key={p.id}
              className={`player-chip ${state.lastWinner?.playerId === p.id ? "active" : ""}`}
            >
              <span className="name">
                {p.name}{p.id === myPlayerId && <span className="you">(you)</span>}
              </span>
              <span className="score">{p.score}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        {isPause ? (
          <RoundCompletePanel
            cards={cards}
            winner={state.lastWinner ?? null}
            round={state.round}
            total={state.totalRounds}
            iWon={state.lastWinner?.playerId === myPlayerId}
          />
        ) : (
          <>
            {cards.length > 0 && (
              <CardBoard
                key={`${state.roomId}-r${state.round}`}
                cards={cards}
                onComplete={onComplete}
                disabled={false}
                resetSignal={resetSignal}
              />
            )}
            <div className="row" style={{ marginTop: "1rem", justifyContent: "center" }}>
              <button className="secondary" onClick={() => setResetSignal((s) => s + 1)}>
                Reset board
              </button>
            </div>
            {feedback && (
              <div className={`toast ${feedback.kind}`} style={{ marginTop: "1rem" }}>
                {feedback.msg}
              </div>
            )}
          </>
        )}
        {error && <div className="toast bad" style={{ marginTop: "1rem" }}>{error}</div>}
      </div>
    </>
  );
}

function RoundCompletePanel({
  cards,
  winner,
  round,
  total,
  iWon,
}: {
  cards: Card[];
  winner: TwentyFourRoomState["lastWinner"];
  round: number;
  total: number;
  iWon: boolean;
}) {
  const isLast = round >= total;
  return (
    <div className="round-complete">
      <div className="round-complete-eyebrow">
        Round {round} of {total} {winner ? "complete" : "ended"}
      </div>
      {winner ? (
        <>
          <div className="round-complete-headline">
            {iWon ? <>You got it!</> : <><b>{winner.name}</b> got it</>}
          </div>
          <div className="round-complete-expr">{winner.expression} = 24</div>
        </>
      ) : (
        <div className="round-complete-headline">Time! Nobody solved it.</div>
      )}
      <div
        className="row"
        style={{ justifyContent: "center", gap: "0.75rem", margin: "1.25rem 0 0.5rem", flexWrap: "wrap" }}
      >
        {cards.map((c) => (
          <PlayingCard key={c.id} card={c} />
        ))}
      </div>
      <div className="round-complete-footer">
        {isLast ? "Final results coming up…" : "Next round starting…"}
      </div>
    </div>
  );
}
