"use client";
import { useEffect, useMemo, useState } from "react";
import type { MemoryRoomState } from "@games/shared";
import { getSocket } from "@/lib/socket";
import { MemoryTile } from "@/components/PlayingCard";
import { LoveRain } from "@/components/LoveRain";

type Mode = "menu" | "lobby" | "playing" | "finished";

export default function MemoryPage() {
  const [mode, setMode] = useState<Mode>("menu");
  const [name, setName] = useState("");
  const [pairs, setPairs] = useState(8);
  const [joinCode, setJoinCode] = useState("");
  const [state, setState] = useState<MemoryRoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("player_name") : null;
    if (saved) setName(saved);
  }, []);

  useEffect(() => {
    const sock = getSocket();
    const onState = (s: MemoryRoomState) => {
      setState(s);
      if (s.status === "playing") setMode("playing");
      else if (s.status === "finished") setMode("finished");
      else if (s.status === "waiting") setMode("lobby");
    };
    const onErr = (msg: string) => setError(msg);
    sock.on("memory:state", onState);
    sock.on("memory:error", onErr);
    return () => {
      sock.off("memory:state", onState);
      sock.off("memory:error", onErr);
    };
  }, []);

  function persistName(v: string) {
    setName(v);
    if (typeof window !== "undefined") localStorage.setItem("player_name", v);
  }

  function createRoom() {
    setError(null);
    const sock = getSocket();
    sock.emit(
      "memory:create",
      { name: name.trim() || "Player 1", pairs },
      (res) => {
        if (res?.state) {
          setState(res.state);
          setMyPlayerId(res.state.players[0]?.id || null);
          setMode("lobby");
        }
      }
    );
  }

  function joinRoom() {
    setError(null);
    const sock = getSocket();
    sock.emit(
      "memory:join",
      { roomId: joinCode.trim().toUpperCase(), name: name.trim() || "Player" },
      (res) => {
        if (!res.ok) {
          setError(res.error || "Could not join");
          return;
        }
        if (res.state) {
          setState(res.state);
          setMyPlayerId(res.state.players[res.state.players.length - 1]?.id || null);
          setMode("lobby");
        }
      }
    );
  }

  function startGame() {
    if (!state) return;
    getSocket().emit("memory:start", { roomId: state.roomId });
  }

  function flip(cardId: string) {
    if (!state) return;
    setError(null);
    getSocket().emit("memory:flip", { roomId: state.roomId, cardId });
  }

  function leave() {
    if (state) getSocket().emit("memory:leave", { roomId: state.roomId });
    setState(null);
    setMyPlayerId(null);
    setMode("menu");
  }

  function rematch() {
    if (!state) return;
    setError(null);
    getSocket().emit("memory:rematch", { roomId: state.roomId });
  }

  const gridCols = useMemo(() => {
    const total = state?.cards.length ?? 0;
    return Math.min(8, Math.ceil(Math.sqrt(total)));
  }, [state?.cards.length]);

  const myTurn = state && state.currentTurn === myPlayerId;

  if (mode === "menu") {
    return (
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Memory</h1>
            <p className="lede">
              Match every pair. Play solo or share a room code — up to four at the table.
            </p>
          </div>
        </div>

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
              <label style={{ color: "var(--text-muted)", fontSize: "0.92rem" }}>Pairs</label>
              <select value={pairs} onChange={(e) => setPairs(parseInt(e.target.value, 10))}>
                {[4, 6, 8, 10, 12, 15, 18].map((n) => (
                  <option key={n} value={n}>
                    {n} pairs · {n * 2} cards
                  </option>
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
      </main>
    );
  }

  if (!state) return <main className="container">Loading…</main>;

  if (mode === "lobby") {
    return (
      <main className="container">
        <div className="page-head">
          <div>
            <h1>Lobby</h1>
            <p className="lede">
              Room code <b style={{ color: "var(--text)", letterSpacing: "0.18em" }}>{state.roomId}</b>{" "}
              — share it with friends. {state.players.length} player{state.players.length === 1 ? "" : "s"} so far.
            </p>
          </div>
        </div>

        <div className="panel col">
          <div className="row" style={{ gap: "0.6rem" }}>
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
      </main>
    );
  }

  return (
    <main className="container">
      {state.status === "finished" && <LoveRain />}
      <div className="page-head">
        <div>
          <h1>Memory</h1>
          <p className="lede">
            Room <b style={{ color: "var(--text)", letterSpacing: "0.18em" }}>{state.roomId}</b>
          </p>
        </div>
        <button className="ghost" onClick={leave}>Leave</button>
      </div>

      <div className="panel">
        <div className="row" style={{ gap: "0.6rem" }}>
          {state.players.map((p) => (
            <div
              key={p.id}
              className={`player-chip ${state.currentTurn === p.id && state.status === "playing" ? "active" : ""}`}
            >
              <span className="name">
                {p.name}
                {p.id === myPlayerId && <span className="you">(you)</span>}
              </span>
              <span className="score">
                {p.score} {p.score === 1 ? "pair" : "pairs"}
              </span>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "0.9rem" }}>
          {state.status === "finished" ? (
            <div className="winner-banner">
              <span className="winner-label">Winner</span>
              <span className="winner-name">
                {state.players.find((p) => p.id === state.winnerId)?.name || "—"}
              </span>
              <div className="rematch-row">
                <button className="rematch" onClick={rematch}>
                  Rematch
                </button>
                <button className="ghost" onClick={leave}>
                  Leave
                </button>
              </div>
            </div>
          ) : myTurn ? (
            <div className="chip turn">Your turn</div>
          ) : (
            <div className="chip">
              <span className="label">Waiting on</span>
              <span className="value">
                {state.players.find((p) => p.id === state.currentTurn)?.name || "…"}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="board-wrap" style={{ marginTop: "1.5rem" }}>
        <div
          className="memory-grid"
          style={{ gridTemplateColumns: `repeat(${gridCols}, 104px)` }}
        >
          {state.cards.map((c) => {
            const revealed = c.flipped || c.matched;
            return (
              <MemoryTile
                key={c.id}
                card={c}
                revealed={revealed}
                matched={c.matched}
                onClick={() => (myTurn && !revealed ? flip(c.id) : undefined)}
              />
            );
          })}
        </div>
        {state.status === "finished" && <div className="board-ripple" aria-hidden />}
      </div>

      {error && <div className="toast bad" style={{ marginTop: "1rem" }}>{error}</div>}
    </main>
  );
}
