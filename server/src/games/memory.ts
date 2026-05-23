import {
  MemoryCard,
  MemoryPlayer,
  MemoryRoomState,
  Rank,
  Suit,
} from "@games/shared";
import { nanoid } from "nanoid";

const SUITS: Suit[] = ["spades", "hearts", "diamonds", "clubs"];
const RANKS: Rank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

export interface InternalRoom extends MemoryRoomState {
  // socketId → playerId for resilience to refresh later
  socketToPlayer: Map<string, string>;
  pendingFlip: string | null; // id of first flipped card awaiting match
  lockUntil: number; // ms timestamp; flips ignored while locked (for the mismatch reveal pause)
}

function shuffle<T>(xs: T[]): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(pairs: number): MemoryCard[] {
  const maxPairs = SUITS.length * RANKS.length; // 52
  const n = Math.max(2, Math.min(pairs, maxPairs));
  const allCards: { suit: Suit; rank: Rank }[] = [];
  for (const s of SUITS) for (const r of RANKS) allCards.push({ suit: s, rank: r });
  const chosen = shuffle(allCards).slice(0, n);
  const deck: MemoryCard[] = [];
  for (const c of chosen) {
    const pairKey = `${c.rank}-${c.suit}`;
    for (let k = 0; k < 2; k++) {
      deck.push({
        id: nanoid(6),
        pairKey,
        suit: c.suit,
        rank: c.rank,
        flipped: false,
        matched: false,
      });
    }
  }
  return shuffle(deck);
}

export function publicState(room: InternalRoom): MemoryRoomState {
  // Hide rank/suit on un-flipped, un-matched cards so the client can't peek.
  return {
    roomId: room.roomId,
    status: room.status,
    currentTurn: room.currentTurn,
    winnerId: room.winnerId,
    players: room.players.map((p) => ({ ...p })),
    cards: room.cards.map((c) => {
      if (c.flipped || c.matched) return { ...c };
      return {
        id: c.id,
        pairKey: "?",
        suit: "spades",
        rank: "A",
        flipped: false,
        matched: false,
      };
    }),
  };
}

export class MemoryRooms {
  rooms = new Map<string, InternalRoom>();

  create(name: string, pairs: number, socketId: string): InternalRoom {
    const roomId = nanoid(5).toUpperCase();
    const playerId = nanoid(8);
    const player: MemoryPlayer = { id: playerId, name: name || "Player 1", score: 0 };
    const room: InternalRoom = {
      roomId,
      cards: buildDeck(pairs),
      players: [player],
      currentTurn: null,
      status: "waiting",
      socketToPlayer: new Map([[socketId, playerId]]),
      pendingFlip: null,
      lockUntil: 0,
    };
    this.rooms.set(roomId, room);
    return room;
  }

  join(
    roomId: string,
    name: string,
    socketId: string
  ): { ok: boolean; room?: InternalRoom; error?: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, error: "Room not found" };
    if (room.players.length >= 4) return { ok: false, error: "Room is full" };
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

  start(roomId: string): InternalRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    if (room.status !== "waiting") return room;
    if (room.players.length < 1) return room;
    room.status = "playing";
    room.currentTurn = room.players[0].id;
    return room;
  }

  flip(
    roomId: string,
    socketId: string,
    cardId: string
  ): { room: InternalRoom; resolved?: "match" | "miss" } | { error: string } {
    const room = this.rooms.get(roomId);
    if (!room) return { error: "Room not found" };
    if (room.status !== "playing") return { error: "Game not in progress" };
    if (Date.now() < room.lockUntil) return { error: "Wait for reveal" };
    const playerId = room.socketToPlayer.get(socketId);
    if (!playerId) return { error: "Not in room" };
    if (room.currentTurn !== playerId) return { error: "Not your turn" };
    const card = room.cards.find((c) => c.id === cardId);
    if (!card) return { error: "Unknown card" };
    if (card.matched || card.flipped) return { error: "Already revealed" };

    card.flipped = true;

    if (room.pendingFlip == null) {
      room.pendingFlip = card.id;
      return { room };
    }

    const first = room.cards.find((c) => c.id === room.pendingFlip)!;
    room.pendingFlip = null;
    if (first.pairKey === card.pairKey) {
      first.matched = true;
      card.matched = true;
      first.matchedBy = playerId;
      card.matchedBy = playerId;
      const player = room.players.find((p) => p.id === playerId)!;
      player.score += 1;
      // Same player goes again
      if (room.cards.every((c) => c.matched)) {
        room.status = "finished";
        const top = [...room.players].sort((a, b) => b.score - a.score)[0];
        room.winnerId = top.id;
        room.currentTurn = null;
      }
      return { room, resolved: "match" };
    } else {
      // Miss: keep cards face up briefly, then flip back. Pass turn.
      room.lockUntil = Date.now() + 1200;
      return { room, resolved: "miss" };
    }
  }

  // Called by the server after the lockUntil delay to clear the failed pair and advance turn.
  resolveMiss(roomId: string): InternalRoom | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    const open = room.cards.filter((c) => c.flipped && !c.matched);
    for (const c of open) c.flipped = false;
    const idx = room.players.findIndex((p) => p.id === room.currentTurn);
    if (idx >= 0 && room.players.length > 0) {
      room.currentTurn = room.players[(idx + 1) % room.players.length].id;
    }
    return room;
  }

  leave(socketId: string): { roomId: string; room: InternalRoom } | null {
    for (const [roomId, room] of this.rooms) {
      const pid = room.socketToPlayer.get(socketId);
      if (!pid) continue;
      room.socketToPlayer.delete(socketId);
      room.players = room.players.filter((p) => p.id !== pid);
      if (room.players.length === 0) {
        this.rooms.delete(roomId);
        return null;
      }
      if (room.currentTurn === pid) {
        room.currentTurn = room.players[0].id;
      }
      return { roomId, room };
    }
    return null;
  }
}
