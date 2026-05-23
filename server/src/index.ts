import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import { Server } from "socket.io";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  TwentyFourValidateRequest,
  TwentyFourValidateResponse,
} from "@games/shared";
import {
  cardsToChoices,
  evalExpression,
  newTwentyFourPuzzle,
  operandsMatchChoices,
  solveFromChoices,
  solveTwentyFour,
} from "./games/twentyFour";
import { MemoryRooms, publicState } from "./games/memory";

const PORT = parseInt(process.env.PORT || "4000", 10);
const ORIGINS = (process.env.CORS_ORIGINS || "*")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: ORIGINS.includes("*") ? true : ORIGINS,
  credentials: true,
};

const app = express();
app.use(cors(corsOptions));
app.use(express.json({ limit: "64kb" }));

app.get("/health", (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

// keep active puzzles in-memory so /validate can recover the per-card value choices
const activePuzzles = new Map<
  string,
  { id: string; choices: number[][]; solution: string | null }
>();

app.post("/api/twenty-four/new", (_req, res) => {
  const p = newTwentyFourPuzzle();
  activePuzzles.set(p.id, {
    id: p.id,
    choices: cardsToChoices(p.cards),
    solution: p.exampleSolution ?? null,
  });
  // Don't leak the solution to the client unless asked for a hint.
  res.json({ id: p.id, cards: p.cards });
});

app.post("/api/twenty-four/validate", (req, res) => {
  const body = req.body as Partial<TwentyFourValidateRequest>;
  if (!body.puzzleId || typeof body.expression !== "string") {
    return res.status(400).json({ valid: false, reason: "Missing fields" });
  }
  const puzzle = activePuzzles.get(body.puzzleId);
  if (!puzzle) {
    return res
      .status(404)
      .json({ valid: false, reason: "Puzzle expired — deal a new one" });
  }
  if (!operandsMatchChoices(body.expression, puzzle.choices)) {
    return res.json({
      valid: false,
      reason: "Must use each card exactly once (A=1 or 11, J/Q/K=10)",
    } as TwentyFourValidateResponse);
  }
  const v = evalExpression(body.expression);
  if (v == null) {
    return res.json({
      valid: false,
      reason: "Could not evaluate (use only digits + - * / ( ))",
    });
  }
  const ok = Math.abs(v - 24) < 1e-9;
  res.json({
    valid: ok,
    result: v,
    reason: ok ? undefined : `Got ${v}, not 24`,
  });
});

app.get("/api/twenty-four/hint/:id", (req, res) => {
  const puzzle = activePuzzles.get(req.params.id);
  if (!puzzle) return res.status(404).json({ error: "Puzzle expired" });
  res.json({ solution: puzzle.solution });
});

app.post("/api/twenty-four/solve", (req, res) => {
  const nums = (req.body?.nums || []) as number[];
  if (!Array.isArray(nums) || nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    return res.status(400).json({ error: "Provide 4 numeric values in nums[]" });
  }
  const sol = solveTwentyFour(nums.map((n) => Math.trunc(n)));
  res.json({ solution: sol });
});

const server = http.createServer(app);
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: { origin: corsOptions.origin, credentials: true },
});

const rooms = new MemoryRooms();
const pendingMissTimers = new Map<string, NodeJS.Timeout>();

io.on("connection", (socket) => {
  socket.on("memory:create", ({ name, pairs }, cb) => {
    const room = rooms.create(name, Math.max(2, Math.min(26, pairs || 8)), socket.id);
    socket.join(room.roomId);
    cb({ roomId: room.roomId, state: publicState(room) });
    io.to(room.roomId).emit("memory:state", publicState(room));
  });

  socket.on("memory:join", ({ roomId, name }, cb) => {
    const result = rooms.join(roomId.toUpperCase(), name, socket.id);
    if (!result.ok || !result.room) {
      cb({ ok: false, error: result.error });
      return;
    }
    socket.join(result.room.roomId);
    cb({ ok: true, state: publicState(result.room) });
    io.to(result.room.roomId).emit("memory:state", publicState(result.room));
  });

  socket.on("memory:start", ({ roomId }) => {
    const room = rooms.start(roomId);
    if (!room) return;
    io.to(roomId).emit("memory:state", publicState(room));
  });

  socket.on("memory:flip", ({ roomId, cardId }) => {
    const out = rooms.flip(roomId, socket.id, cardId);
    if ("error" in out) {
      socket.emit("memory:error", out.error);
      return;
    }
    io.to(roomId).emit("memory:state", publicState(out.room));
    if (out.resolved === "miss") {
      // Clear previous timer if any (shouldn't happen, but defensive)
      const prev = pendingMissTimers.get(roomId);
      if (prev) clearTimeout(prev);
      pendingMissTimers.set(
        roomId,
        setTimeout(() => {
          pendingMissTimers.delete(roomId);
          const updated = rooms.resolveMiss(roomId);
          if (updated) io.to(roomId).emit("memory:state", publicState(updated));
        }, 1200)
      );
    }
  });

  socket.on("memory:leave", ({ roomId }) => {
    const out = rooms.leave(socket.id);
    socket.leave(roomId);
    if (out) io.to(out.roomId).emit("memory:state", publicState(out.room));
  });

  socket.on("disconnect", () => {
    const out = rooms.leave(socket.id);
    if (out) io.to(out.roomId).emit("memory:state", publicState(out.room));
  });
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] CORS origins: ${ORIGINS.join(", ") || "(none)"}`);
  console.log(`[server] Expose with: ngrok http ${PORT}`);
});
