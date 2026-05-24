"use client";
import type { Suit, Rank } from "@games/shared";

const SUIT_GLYPH: Record<Suit, string> = {
  spades: "♠",
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
};

function isRed(s: Suit) {
  return s === "hearts" || s === "diamonds";
}

// Pip layouts (rows of counts) — classic Bicycle-style positions.
const PIPS: Record<string, number[][]> = {
  "1": [[1]],
  "2": [[1], [1]],
  "3": [[1], [1], [1]],
  "4": [
    [1, 1],
    [1, 1],
  ],
  "5": [
    [1, 1],
    [1],
    [1, 1],
  ],
  "6": [
    [1, 1],
    [1, 1],
    [1, 1],
  ],
  "7": [
    [1, 1],
    [1],
    [1, 1],
    [1, 1],
  ],
  "8": [
    [1, 1],
    [1, 1],
    [1, 1],
    [1, 1],
  ],
  "9": [
    [1, 1],
    [1, 1],
    [1],
    [1, 1],
    [1, 1],
  ],
  "10": [
    [1, 1],
    [1],
    [1, 1],
    [1, 1],
    [1],
    [1, 1],
  ],
};

function PipCluster({ rank, glyph }: { rank: Rank; glyph: string }) {
  if (rank === "A") {
    return <div className="face face-ace">{glyph}</div>;
  }
  if (rank === "J" || rank === "Q" || rank === "K") {
    return (
      <div className="face face-court">
        <div className="court-letter">{rank}</div>
        <div className="court-glyph">{glyph}</div>
      </div>
    );
  }
  const layout = PIPS[rank as keyof typeof PIPS];
  if (!layout) return <div className="face">{glyph}</div>;
  return (
    <div className="pips">
      {layout.map((row, ri) => (
        <div key={ri} className="pip-row">
          {row.map((_, ci) => (
            <span key={ci} className="pip">
              {glyph}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

export function PlayingCard({
  card,
  selected,
  used,
  selectable,
  matched,
  wrong,
  onClick,
}: {
  card: { suit: Suit; rank: Rank };
  selected?: boolean;
  used?: boolean;
  selectable?: boolean;
  matched?: boolean;
  wrong?: boolean;
  onClick?: () => void;
}) {
  const red = isRed(card.suit);
  const cls = [
    "card",
    red ? "red" : "",
    selected ? "selected" : "",
    used ? "used" : "",
    matched ? "matched" : "",
    wrong ? "wrong" : "",
    selectable ? "selectable" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const glyph = SUIT_GLYPH[card.suit];
  return (
    <div
      className={cls}
      onClick={onClick}
      role={selectable || onClick ? "button" : undefined}
      tabIndex={selectable || onClick ? 0 : undefined}
      aria-label={`${card.rank} of ${card.suit}`}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="card-inset">
        <div className="corner tl">
          <div className="rank">{card.rank}</div>
          <div className="suit">{glyph}</div>
        </div>
        <PipCluster rank={card.rank} glyph={glyph} />
        <div className="corner br">
          <div className="rank">{card.rank}</div>
          <div className="suit">{glyph}</div>
        </div>
      </div>
    </div>
  );
}

export function CardBack({ onClick }: { onClick?: () => void }) {
  return (
    <div
      className="card-back"
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label="Hidden card"
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="back-inset">
        <div className="back-stars top">
          <span>✦</span>
          <span>✦</span>
          <span>✦</span>
        </div>
        <div className="back-mark">MIND24</div>
        <div className="back-stars bottom">
          <span>✦</span>
          <span>✦</span>
          <span>✦</span>
        </div>
      </div>
    </div>
  );
}

export function MemoryTile({
  card,
  revealed,
  matched,
  onClick,
}: {
  card: { suit: Suit; rank: Rank };
  revealed: boolean;
  matched?: boolean;
  onClick?: () => void;
}) {
  const cls = ["memory-tile", revealed ? "is-flipped" : "", matched ? "is-matched" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <div
      className={cls}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={revealed ? `${card.rank} of ${card.suit}` : "Hidden card"}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <div className="memory-tile-inner">
        <div className="memory-face memory-back">
          <CardBack />
        </div>
        <div className="memory-face memory-front">
          <PlayingCard card={card} matched={matched} />
        </div>
      </div>
    </div>
  );
}
