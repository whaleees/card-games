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
  newTwentyFourPuzzle,
  solveTwentyFour,
  validateExpression,
} from "./games/twentyFour";
import { MemoryRooms, publicState } from "./games/memory";
import { TwentyFourRooms, tfPublicState } from "./games/twentyFourMulti";

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
  const result = validateExpression(puzzle.choices, body.expression);
  res.json(result as TwentyFourValidateResponse);
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

const tfRooms = new TwentyFourRooms();
const tfRoundTimers = new Map<string, NodeJS.Timeout>();
const tfPauseTimers = new Map<string, NodeJS.Timeout>();

function clearTfTimers(roomId: string) {
  const r = tfRoundTimers.get(roomId);
  if (r) clearTimeout(r);
  tfRoundTimers.delete(roomId);
  const p = tfPauseTimers.get(roomId);
  if (p) clearTimeout(p);
  tfPauseTimers.delete(roomId);
}

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

  socket.on("memory:rematch", ({ roomId }) => {
    const prev = pendingMissTimers.get(roomId);
    if (prev) {
      clearTimeout(prev);
      pendingMissTimers.delete(roomId);
    }
    const room = rooms.rematch(roomId);
    if (!room) return;
    io.to(roomId).emit("memory:state", publicState(room));
  });

  socket.on("memory:leave", ({ roomId }) => {
    const out = rooms.leave(socket.id);
    socket.leave(roomId);
    if (out) io.to(out.roomId).emit("memory:state", publicState(out.room));
  });

  // --- 24 multiplayer ---

  function scheduleTfRoundTimeout(roomId: string, endsAt: number | null) {
    const prev = tfRoundTimers.get(roomId);
    if (prev) clearTimeout(prev);
    tfRoundTimers.delete(roomId);
    if (!endsAt) return;
    const ms = endsAt - Date.now();
    if (ms <= 0) return;
    tfRoundTimers.set(
      roomId,
      setTimeout(() => {
        tfRoundTimers.delete(roomId);
        const room = tfRooms.rooms.get(roomId);
        if (!room || room.status !== "playing") return;
        room.status = "round_pause";
        room.roundEndsAt = null;
        io.to(roomId).emit("tf:state", tfPublicState(room));
        scheduleTfPause(roomId);
      }, ms)
    );
  }

  function scheduleTfPause(roomId: string) {
    const prev = tfPauseTimers.get(roomId);
    if (prev) clearTimeout(prev);
    const roundT = tfRoundTimers.get(roomId);
    if (roundT) clearTimeout(roundT);
    tfRoundTimers.delete(roomId);
    tfPauseTimers.set(
      roomId,
      setTimeout(() => {
        tfPauseTimers.delete(roomId);
        const updated = tfRooms.advance(roomId);
        if (!updated) return;
        io.to(roomId).emit("tf:state", tfPublicState(updated));
        if (updated.status === "playing") {
          scheduleTfRoundTimeout(roomId, updated.roundEndsAt);
        }
      }, 3500)
    );
  }

  socket.on("tf:create", ({ name, rounds, roundSeconds }, cb) => {
    const room = tfRooms.create(name, rounds, roundSeconds, socket.id);
    socket.join(room.roomId);
    cb({ roomId: room.roomId, state: tfPublicState(room) });
    io.to(room.roomId).emit("tf:state", tfPublicState(room));
  });

  socket.on("tf:join", ({ roomId, name }, cb) => {
    const result = tfRooms.join(roomId.toUpperCase(), name, socket.id);
    if (!result.ok || !result.room) {
      cb({ ok: false, error: result.error });
      return;
    }
    socket.join(result.room.roomId);
    cb({ ok: true, state: tfPublicState(result.room) });
    io.to(result.room.roomId).emit("tf:state", tfPublicState(result.room));
  });

  socket.on("tf:start", ({ roomId }) => {
    const room = tfRooms.start(roomId);
    if (!room) return;
    io.to(roomId).emit("tf:state", tfPublicState(room));
    if (room.status === "playing") scheduleTfRoundTimeout(roomId, room.roundEndsAt);
  });

  socket.on("tf:submit", ({ roomId, expression }, cb) => {
    const out = tfRooms.submit(roomId, socket.id, expression);
    if ("error" in out) {
      cb({ valid: false, reason: out.error });
      return;
    }
    cb({ valid: out.correct, reason: out.reason, result: out.result });
    if (out.firstSolve) {
      io.to(roomId).emit("tf:state", tfPublicState(out.room));
      scheduleTfPause(roomId);
    }
  });

  socket.on("tf:rematch", ({ roomId }) => {
    clearTfTimers(roomId);
    const room = tfRooms.rematch(roomId);
    if (!room) return;
    io.to(roomId).emit("tf:state", tfPublicState(room));
    if (room.status === "playing") scheduleTfRoundTimeout(roomId, room.roundEndsAt);
  });

  socket.on("tf:leave", ({ roomId }) => {
    const out = tfRooms.leave(socket.id);
    socket.leave(roomId);
    if (!out) {
      clearTfTimers(roomId);
      return;
    }
    io.to(out.roomId).emit("tf:state", tfPublicState(out.room));
  });

  socket.on("disconnect", () => {
    const memOut = rooms.leave(socket.id);
    if (memOut) io.to(memOut.roomId).emit("memory:state", publicState(memOut.room));
    const tfOut = tfRooms.leave(socket.id);
    if (tfOut) {
      io.to(tfOut.roomId).emit("tf:state", tfPublicState(tfOut.room));
    }
  });
});

server.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`);
  console.log(`[server] CORS origins: ${ORIGINS.join(", ") || "(none)"}`);
  console.log(`[server] Expose with: ngrok http ${PORT}`);
});
