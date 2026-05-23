import { Card, cardValues, Suit, Rank, TwentyFourPuzzle } from "@games/shared";
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

type Frac = { n: number; d: number };

function f(n: number, d = 1): Frac {
  if (d === 0) return { n: 0, d: 0 };
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(Math.abs(n), d);
  return { n: n / g, d: d / g };
}

function gcd(a: number, b: number): number {
  if (a === 0) return b || 1;
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

function isInvalid(x: Frac) {
  return x.d === 0;
}

function add(a: Frac, b: Frac) {
  return f(a.n * b.d + b.n * a.d, a.d * b.d);
}
function sub(a: Frac, b: Frac) {
  return f(a.n * b.d - b.n * a.d, a.d * b.d);
}
function mul(a: Frac, b: Frac) {
  return f(a.n * b.n, a.d * b.d);
}
function div(a: Frac, b: Frac) {
  if (b.n === 0) return { n: 0, d: 0 };
  return f(a.n * b.d, a.d * b.n);
}

const OPS: Array<{ sym: string; fn: (a: Frac, b: Frac) => Frac }> = [
  { sym: "+", fn: add },
  { sym: "-", fn: sub },
  { sym: "*", fn: mul },
  { sym: "/", fn: div },
];

const TARGET: Frac = { n: 24, d: 1 };

function fracEq(a: Frac, b: Frac) {
  return !isInvalid(a) && !isInvalid(b) && a.n === b.n && a.d === b.d;
}

function permute<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs.slice()];
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i++) {
    const rest = xs.slice(0, i).concat(xs.slice(i + 1));
    for (const p of permute(rest)) out.push([xs[i], ...p]);
  }
  return out;
}

// Returns first found expression that equals 24, or null.
export function solveTwentyFour(nums: number[]): string | null {
  const seen = new Set<string>();
  for (const perm of permute(nums)) {
    const key = perm.join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    const [a, b, c, d] = perm.map((n) => f(n));
    const [as, bs, cs, ds] = perm.map(String);
    for (const o1 of OPS)
      for (const o2 of OPS)
        for (const o3 of OPS) {
          // Five parenthesizations for 4 operands
          const candidates: Array<{ v: Frac; expr: string }> = [];
          // ((a o1 b) o2 c) o3 d
          {
            const ab = o1.fn(a, b);
            const abc = o2.fn(ab, c);
            const v = o3.fn(abc, d);
            candidates.push({
              v,
              expr: `((${as}${o1.sym}${bs})${o2.sym}${cs})${o3.sym}${ds}`,
            });
          }
          // (a o1 (b o2 c)) o3 d
          {
            const bc = o2.fn(b, c);
            const abc = o1.fn(a, bc);
            const v = o3.fn(abc, d);
            candidates.push({
              v,
              expr: `(${as}${o1.sym}(${bs}${o2.sym}${cs}))${o3.sym}${ds}`,
            });
          }
          // (a o1 b) o2 (c o3 d)
          {
            const ab = o1.fn(a, b);
            const cd = o3.fn(c, d);
            const v = o2.fn(ab, cd);
            candidates.push({
              v,
              expr: `(${as}${o1.sym}${bs})${o2.sym}(${cs}${o3.sym}${ds})`,
            });
          }
          // a o1 ((b o2 c) o3 d)
          {
            const bc = o2.fn(b, c);
            const bcd = o3.fn(bc, d);
            const v = o1.fn(a, bcd);
            candidates.push({
              v,
              expr: `${as}${o1.sym}((${bs}${o2.sym}${cs})${o3.sym}${ds})`,
            });
          }
          // a o1 (b o2 (c o3 d))
          {
            const cd = o3.fn(c, d);
            const bcd = o2.fn(b, cd);
            const v = o1.fn(a, bcd);
            candidates.push({
              v,
              expr: `${as}${o1.sym}(${bs}${o2.sym}(${cs}${o3.sym}${ds}))`,
            });
          }
          for (const cnd of candidates) {
            if (fracEq(cnd.v, TARGET)) return cnd.expr;
          }
        }
  }
  return null;
}

function dealFourCards(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push({ id: `${r}${s[0]}`, suit: s, rank: r });
  // Fisher–Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 4);
}

// Given per-card value choices (Aces have two), try every combination until one solves to 24.
export function solveFromChoices(choices: number[][]): string | null {
  function go(idx: number, current: number[]): string | null {
    if (idx === choices.length) return solveTwentyFour(current);
    for (const v of choices[idx]) {
      const r = go(idx + 1, [...current, v]);
      if (r) return r;
    }
    return null;
  }
  return go(0, []);
}

export function cardsToChoices(cards: Card[]): number[][] {
  return cards.map((c) => cardValues(c.rank));
}

// Generates a 4-card deal that has at least one solution to 24.
// Tries up to maxAttempts; in practice most random deals are solvable so this terminates quickly.
export function newTwentyFourPuzzle(maxAttempts = 400): TwentyFourPuzzle {
  for (let i = 0; i < maxAttempts; i++) {
    const cards = dealFourCards();
    const sol = solveFromChoices(cardsToChoices(cards));
    if (sol) {
      return { id: nanoid(8), cards, exampleSolution: sol };
    }
  }
  // Extremely unlikely fallback: 1,2,3,4 → (1+2+3)*4 = 24
  const cards: Card[] = [
    { id: "Ah", suit: "hearts", rank: "A" },
    { id: "2h", suit: "hearts", rank: "2" },
    { id: "3h", suit: "hearts", rank: "3" },
    { id: "4h", suit: "hearts", rank: "4" },
  ];
  return { id: nanoid(8), cards, exampleSolution: "(1+2+3)*4" };
}

// Safe expression evaluator: only digits, +-*/(), spaces. Returns result or null.
export function evalExpression(expr: string): number | null {
  if (!/^[\d+\-*/().\s]+$/.test(expr)) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const fn = new Function(`"use strict"; return (${expr});`);
    const v = fn();
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}

// One-stop validation: operand multiset + safe eval + equals-24 check.
export function validateExpression(
  choices: number[][],
  expr: string
): { valid: boolean; result?: number; reason?: string } {
  if (!operandsMatchChoices(expr, choices)) {
    return { valid: false, reason: "Must use each card exactly once (A=1 or 11, J/Q/K=10)" };
  }
  const v = evalExpression(expr);
  if (v == null) {
    return { valid: false, reason: "Could not evaluate (use only digits + - * / ( ))" };
  }
  const ok = Math.abs(v - 24) < 1e-9;
  return ok
    ? { valid: true, result: v }
    : { valid: false, result: v, reason: `Got ${v}, not 24` };
}

// Checks the expression's integer operands can be matched 1:1 to cards,
// where each card may take any value from its choices list (e.g. Aces = 1 or 11).
export function operandsMatchChoices(expr: string, choices: number[][]): boolean {
  const nums = (expr.match(/\d+/g) || []).map((s) => parseInt(s, 10));
  if (nums.length !== choices.length) return false;
  const used = new Array<boolean>(choices.length).fill(false);
  function assign(i: number): boolean {
    if (i === nums.length) return true;
    for (let c = 0; c < choices.length; c++) {
      if (used[c]) continue;
      if (!choices[c].includes(nums[i])) continue;
      used[c] = true;
      if (assign(i + 1)) return true;
      used[c] = false;
    }
    return false;
  }
  return assign(0);
}
