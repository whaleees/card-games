export type Suit = "spades" | "hearts" | "diamonds" | "clubs";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
}

// Primary numeric value for a rank. For Aces, default to 1 — clients can also use 11.
export const RANK_VALUE: Record<Rank, number> = {
  A: 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
};

// All values a card may take. Aces are 1 or 11; J/Q/K are 10; numbered cards are themselves.
export function cardValues(rank: Rank): number[] {
  if (rank === "A") return [1, 11];
  return [RANK_VALUE[rank]];
}

export interface TwentyFourPuzzle {
  id: string;
  cards: Card[];
  exampleSolution?: string;
}

export interface TwentyFourValidateRequest {
  puzzleId: string;
  expression: string;
}

export interface TwentyFourValidateResponse {
  valid: boolean;
  result?: number;
  reason?: string;
}

export interface MemoryCard {
  id: string;
  pairKey: string;
  suit: Suit;
  rank: Rank;
  flipped: boolean;
  matched: boolean;
  matchedBy?: string;
}

export interface MemoryPlayer {
  id: string;
  name: string;
  score: number;
}

export interface MemoryRoomState {
  roomId: string;
  cards: MemoryCard[];
  players: MemoryPlayer[];
  currentTurn: string | null;
  status: "waiting" | "playing" | "finished";
  winnerId?: string;
}

export type ClientToServerEvents = {
  "memory:create": (
    payload: { name: string; pairs: number },
    cb: (res: { roomId: string; state: MemoryRoomState }) => void
  ) => void;
  "memory:join": (
    payload: { roomId: string; name: string },
    cb: (res: { ok: boolean; state?: MemoryRoomState; error?: string }) => void
  ) => void;
  "memory:start": (payload: { roomId: string }) => void;
  "memory:flip": (payload: { roomId: string; cardId: string }) => void;
  "memory:leave": (payload: { roomId: string }) => void;
};

export type ServerToClientEvents = {
  "memory:state": (state: MemoryRoomState) => void;
  "memory:error": (msg: string) => void;
};
