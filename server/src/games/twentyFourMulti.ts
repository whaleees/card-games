import { Card, TwentyFourPlayer, TwentyFourRoomState } from "@games/shared";
import { nanoid } from "nanoid";
import {
  cardsToChoices,
  newTwentyFourPuzzle,
  validateExpression,
} from "./twentyFour";

export interface InternalTfRoom extends TwentyFourRoomState {
  socketToPlayer: Map<string, string>;
  choices: number[][]; // current puzzle's per-card value options
  roundSeconds: number;
}

export class TwentyFourRooms {
  rooms = new Map<string, InternalTfRoom>();

  create(
    name: string,
    rounds: number,
    roundSeconds: number,
    socketId: string
  ): InternalTfRoom {
    const roomId = nanoid(5).toUpperCase();
    const playerId = nanoid(8);
    const player: TwentyFourPlayer = {
      id: playerId,
      name: name || "Player 1",
      score: 0,
    };
    const room: InternalTfRoom = {
      roomId,
      status: "waiting",
      players: [player],
      round: 0,
      totalRounds: Math.max(1, Math.min(20, rounds || 5)),
      roundEndsAt: null,
      cards: null,
      lastWinner: null,
      socketToPlayer: new Map([[socketId, playerId]]),
      choices: [],
      roundSeconds: Math.max(15, Math.min(300, roundSeconds || 90)),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  join(
    roomId: string,
    name: string,
    socketId: string
  ): { ok: boolean; room?: InternalTfRoom; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: "Room not found" };
    if (room.players.length >= 6) return { ok: false, error: "Room is full" };
    if (room.status === "finished") return { ok: false, error: "Game over" };
    const playerId = nanoid(8);
    room.players.push({
      id: playerId,
      name: name || `Player ${room.players.length + 1}`,
      score: 0,
    });
    room.socketToPlayer.set(socketId, playerId);
    return { ok: true, room };
  }

  start(roomId: string): InternalTfRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== "waiting") return room;
    if (room.players.length < 1) return room;
    this.beginRound(room);
    return room;
  }

  private beginRound(room: InternalTfRoom) {
    room.round += 1;
    const puzzle = newTwentyFourPuzzle();
    room.cards = puzzle.cards;
    room.choices = cardsToChoices(puzzle.cards);
    room.lastWinner = null;
    room.status = "playing";
    room.roundEndsAt = Date.now() + room.roundSeconds * 1000;
  }

  // Called after the post-win pause, OR when round timer expires with no winner.
  advance(roomId: string): InternalTfRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.round >= room.totalRounds) {
      room.status = "finished";
      room.cards = null;
      room.choices = [];
      room.roundEndsAt = null;
      return room;
    }
    this.beginRound(room);
    return room;
  }

  submit(
    roomId: string,
    socketId: string,
    expression: string
  ):
    | { error: string }
    | { ok: true; room: InternalTfRoom; correct: boolean; reason?: string; result?: number; firstSolve: boolean } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: "Room not found" };
    if (room.status !== "playing") return { error: "Round not in progress" };
    const playerId = room.socketToPlayer.get(socketId);
    if (!playerId) return { error: "Not in room" };
    const result = validateExpression(room.choices, expression);
    if (!result.valid) {
      return { ok: true, room, correct: false, reason: result.reason, firstSolve: false };
    }
    // First valid submission for this round wins.
    const player = room.players.find((p) => p.id === playerId)!;
    player.score += 1;
    room.lastWinner = {
      playerId,
      name: player.name,
      expression,
    };
    room.status = "round_pause";
    room.roundEndsAt = null;
    return { ok: true, room, correct: true, result: result.result, firstSolve: true };
  }

  rematch(roomId: string): InternalTfRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== "finished") return room;
    for (const p of room.players) p.score = 0;
    room.round = 0;
    room.lastWinner = null;
    this.beginRound(room);
    return room;
  }

  leave(socketId: string): { roomId: string; room: InternalTfRoom } | null {
    for (const [roomId, room] of this.rooms) {
      const pid = room.socketToPlayer.get(socketId);
      if (!pid) continue;
      room.socketToPlayer.delete(socketId);
      room.players = room.players.filter((p) => p.id !== pid);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return null;
      }
      return { roomId, room };
    }
    return null;
  }
}

// Build the public state — clients never see room.choices (which equals card values; safe)
// or any pre-computed solution.
export function tfPublicState(room: InternalTfRoom): TwentyFourRoomState {
  return {
    roomId: room.roomId,
    status: room.status,
    players: room.players.map((p) => ({ ...p })),
    round: room.round,
    totalRounds: room.totalRounds,
    roundEndsAt: room.roundEndsAt,
    cards: room.cards ? room.cards.map((c: Card) => ({ ...c })) : null,
    lastWinner: room.lastWinner ?? null,
  };
}
