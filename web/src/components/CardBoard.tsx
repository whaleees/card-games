"use client";
import { useEffect, useRef, useState } from "react";
import type { Card, Rank } from "@games/shared";
import { PlayingCard } from "./PlayingCard";

type Op = "+" | "-" | "*" | "/";
const OP_GLYPH: Record<Op, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const OP_LABEL: Record<Op, string> = { "+": "Add", "-": "Subtract", "*": "Multiply", "/": "Divide" };

// --- fraction math (exact, avoids 8/3 → 2.666… display ugliness) ---
type Frac = { n: number; d: number };
function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) { [a, b] = [b, a % b]; }
  return a || 1;
}
function f(n: number, d = 1): Frac {
  if (d === 0) return { n: 1, d: 0 };
  if (d < 0) { n = -n; d = -d; }
  const g = gcd(Math.abs(n), d);
  return { n: n / g, d: d / g };
}
const fAdd = (a: Frac, b: Frac) => f(a.n * b.d + b.n * a.d, a.d * b.d);
const fSub = (a: Frac, b: Frac) => f(a.n * b.d - b.n * a.d, a.d * b.d);
const fMul = (a: Frac, b: Frac) => f(a.n * b.n, a.d * b.d);
const fDiv = (a: Frac, b: Frac) =>
  b.n === 0 ? { n: 1, d: 0 } : f(a.n * b.d, a.d * b.n);
const fInvalid = (x: Frac) => x.d === 0;
const fStr = (x: Frac) => (x.d === 1 ? String(x.n) : `${x.n}/${x.d}`);
const fNumber = (x: Frac) => x.n / x.d;

function baseValue(rank: Rank, flipped: boolean): number {
  if (rank === "A") return flipped ? 11 : 1;
  if (rank === "J" || rank === "Q" || rank === "K") return 10;
  return parseInt(rank, 10);
}

interface LiveCard {
  uid: string;
  base: Card | null;     // null for combined cards
  aceFlipped: boolean;   // only meaningful when base?.rank === "A"
  value: Frac;
  expr: string;          // expression string for server validation
}

interface HistoryEntry {
  removed: { card: LiveCard; index: number }[];
  added: { card: LiveCard; index: number };
}

interface Props {
  cards: Card[];
  // Fires whenever the board collapses to one card. Parent decides what to do
  // (local check for solo, server submit for multi).
  onComplete: (expr: string, value: number) => void;
  disabled?: boolean;
  // Trigger a manual reset (e.g. "start over" without a new deal). Increment to reset.
  resetSignal?: number;
}

export function CardBoard({ cards, onComplete, disabled, resetSignal }: Props) {
  const [live, setLive] = useState<LiveCard[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [pending, setPending] = useState<{ src: string; tgt: string } | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [completed, setCompleted] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    src: string;
    el: HTMLElement;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const justDraggedRef = useRef(false);

  // (Re)initialise whenever the upstream card set changes or a reset is requested.
  useEffect(() => {
    setLive(
      cards.map((c, i) => {
        const v = baseValue(c.rank, false);
        return {
          uid: `${c.id}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          base: c,
          aceFlipped: false,
          value: f(v),
          expr: String(v),
        };
      })
    );
    setSelected(null);
    setPending(null);
    setHistory([]);
    setCompleted(false);
  }, [cards, resetSignal]);

  function toggleAce(uid: string) {
    setLive((curr) =>
      curr.map((lc) => {
        if (lc.uid !== uid) return lc;
        if (!lc.base || lc.base.rank !== "A") return lc;
        const flipped = !lc.aceFlipped;
        const v = flipped ? 11 : 1;
        return { ...lc, aceFlipped: flipped, value: f(v), expr: String(v) };
      })
    );
  }

  function pickPair(srcUid: string, tgtUid: string) {
    if (srcUid === tgtUid) return;
    setPending({ src: srcUid, tgt: tgtUid });
  }

  function onCardClick(uid: string) {
    if (disabled || completed) return;
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      return;
    }
    if (selected === null) {
      setSelected(uid);
    } else if (selected === uid) {
      setSelected(null);
    } else {
      pickPair(selected, uid);
      setSelected(null);
    }
  }

  function applyOp(op: Op) {
    if (!pending) return;
    const src = live.find((c) => c.uid === pending.src);
    const tgt = live.find((c) => c.uid === pending.tgt);
    if (!src || !tgt) { setPending(null); return; }
    const fn = op === "+" ? fAdd : op === "-" ? fSub : op === "*" ? fMul : fDiv;
    const value = fn(src.value, tgt.value);
    if (fInvalid(value)) {
      // Division by zero, etc. Bail.
      setPending(null);
      return;
    }
    const srcIdx = live.findIndex((c) => c.uid === src.uid);
    const tgtIdx = live.findIndex((c) => c.uid === tgt.uid);
    const newCard: LiveCard = {
      uid: `c-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      base: null,
      aceFlipped: false,
      value,
      expr: `(${src.expr}${op}${tgt.expr})`,
    };
    const removedSorted = [
      { card: src, index: srcIdx },
      { card: tgt, index: tgtIdx },
    ].sort((a, b) => b.index - a.index);
    const next = live.slice();
    for (const r of removedSorted) next.splice(r.index, 1);
    const insertAt = Math.min(tgtIdx, next.length);
    next.splice(insertAt, 0, newCard);
    setLive(next);
    setHistory((h) => [
      ...h,
      {
        removed: [
          { card: src, index: srcIdx },
          { card: tgt, index: tgtIdx },
        ],
        added: { card: newCard, index: insertAt },
      },
    ]);
    setPending(null);
  }

  function undo() {
    if (history.length === 0) return;
    const last = history[history.length - 1];
    setLive((curr) => {
      const next = curr.filter((c) => c.uid !== last.added.card.uid);
      const ordered = [...last.removed].sort((a, b) => a.index - b.index);
      for (const r of ordered) next.splice(r.index, 0, r.card);
      return next;
    });
    setHistory((h) => h.slice(0, -1));
    setSelected(null);
    setPending(null);
    setCompleted(false);
  }

  // Once a single card remains, fire onComplete (parent handles feedback / submit).
  useEffect(() => {
    if (live.length === 1 && !completed) {
      setCompleted(true);
      const last = live[0];
      onComplete(last.expr, fNumber(last.value));
    }
  }, [live, completed, onComplete]);

  // --- unified pointer drag (works for mouse + touch + pen) ---
  function findSlotUidAt(x: number, y: number, excludeUid: string): string | null {
    const stack = document.elementsFromPoint(x, y);
    for (const el of stack) {
      if (!(el instanceof HTMLElement)) continue;
      const slot = el.closest('[data-board-slot]') as HTMLElement | null;
      if (!slot) continue;
      const uid = slot.getAttribute('data-uid');
      if (uid && uid !== excludeUid) return uid;
    }
    return null;
  }

  function onPointerDown(e: React.PointerEvent, uid: string) {
    if (disabled || completed) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    try { el.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = {
      pointerId: e.pointerId,
      src: uid,
      el,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  }

  function resetDragVisuals(el: HTMLElement) {
    el.classList.remove("dragging");
    el.style.transform = "";
    el.style.zIndex = "";
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 8) return;
      d.moved = true;
      d.el.classList.add("dragging");
      d.el.style.zIndex = "10";
    }
    // Follow the pointer with a slight tilt for tactile feedback.
    const tilt = Math.max(-12, Math.min(12, dx * 0.05));
    d.el.style.transform = `translate(${dx}px, ${dy}px) rotate(${tilt}deg) scale(1.04)`;
    const targetUid = findSlotUidAt(e.clientX, e.clientY, d.src);
    setDragOver(targetUid);
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { d.el.releasePointerCapture(e.pointerId); } catch {}
    const wasDragging = d.moved;
    resetDragVisuals(d.el);
    dragRef.current = null;
    setDragOver(null);
    if (!wasDragging) return; // treat as a click — onClick handles selection
    justDraggedRef.current = true;
    const targetUid = findSlotUidAt(e.clientX, e.clientY, d.src);
    if (targetUid) pickPair(d.src, targetUid);
  }

  function onPointerCancel(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    try { d.el.releasePointerCapture(e.pointerId); } catch {}
    resetDragVisuals(d.el);
    dragRef.current = null;
    setDragOver(null);
  }

  return (
    <div className="card-board">
      <div className="card-board-grid">
        {live.map((lc) => {
          const isOriginal = lc.base !== null;
          const isAce = isOriginal && lc.base!.rank === "A";
          const slotCls = [
            "board-slot",
            selected === lc.uid ? "selected" : "",
            dragOver === lc.uid ? "drag-over" : "",
          ].filter(Boolean).join(" ");
          return (
            <div
              key={lc.uid}
              data-board-slot=""
              data-uid={lc.uid}
              className={slotCls}
              onPointerDown={(e) => onPointerDown(e, lc.uid)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onClick={() => onCardClick(lc.uid)}
            >
              {isOriginal ? (
                <PlayingCard card={lc.base!} selectable={!disabled} />
              ) : (
                <CombinedCard text={fStr(lc.value)} />
              )}
              {isAce ? (
                <button
                  className="ace-toggle"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); toggleAce(lc.uid); }}
                  type="button"
                  disabled={disabled || completed}
                >
                  Ace = {lc.aceFlipped ? "11" : "1"}
                </button>
              ) : (
                <div className="value-tag">= {fStr(lc.value)}</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="row" style={{ marginTop: "1.25rem", justifyContent: "center" }}>
        <button className="ghost" onClick={undo} disabled={history.length === 0 || disabled}>
          ↶ Undo last
        </button>
      </div>

      {pending && (
        <OpModal
          src={live.find((c) => c.uid === pending.src)}
          tgt={live.find((c) => c.uid === pending.tgt)}
          onPick={applyOp}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function CombinedCard({ text }: { text: string }) {
  return (
    <div className="card combined">
      <div className="card-inset">
        <div className="corner tl">
          <div className="rank">{text}</div>
        </div>
        <div className="combined-face">{text}</div>
        <div className="corner br">
          <div className="rank">{text}</div>
        </div>
      </div>
    </div>
  );
}

function OpModal({
  src, tgt, onPick, onCancel,
}: {
  src?: LiveCard;
  tgt?: LiveCard;
  onPick: (op: Op) => void;
  onCancel: () => void;
}) {
  if (!src || !tgt) return null;
  const a = fStr(src.value);
  const b = fStr(tgt.value);

  return (
    <div className="op-modal-overlay" onClick={onCancel}>
      <div className="op-modal" onClick={(e) => e.stopPropagation()}>
        <div className="op-modal-title">Choose operation</div>
        <div className="op-modal-summary">
          <span className="operand">{a}</span>
          <span className="placeholder">?</span>
          <span className="operand">{b}</span>
        </div>
        <div className="op-grid">
          {(["+", "-", "*", "/"] as const).map((op) => (
            <button
              key={op}
              className={`op-card op-${op === "+" ? "add" : op === "-" ? "sub" : op === "*" ? "mul" : "div"}`}
              onClick={() => onPick(op)}
              type="button"
            >
              <span className="glyph">{OP_GLYPH[op]}</span>
              <span className="label">{OP_LABEL[op]}</span>
            </button>
          ))}
        </div>
        <button className="ghost" onClick={onCancel} type="button">Cancel</button>
      </div>
    </div>
  );
}
