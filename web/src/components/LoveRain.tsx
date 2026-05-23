"use client";
import { useMemo } from "react";

const HEART_GLYPHS = ["♥", "❤", "💖", "💗", "💕"];
const HEART_HUES = ["#ff5d8f", "#ff7aa8", "#ff95b8", "#e0457b", "#ffb3c8"];

export function LoveRain({ count = 36 }: { count?: number }) {
  const hearts = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const x = Math.random() * 100;
        const size = 18 + Math.random() * 28;
        const duration = 4 + Math.random() * 4;
        const delay = -Math.random() * duration;
        const hue = HEART_HUES[i % HEART_HUES.length];
        const glyph = HEART_GLYPHS[i % HEART_GLYPHS.length];
        return { x, size, duration, delay, hue, glyph, key: i };
      }),
    [count]
  );
  return (
    <div className="love-rain" aria-hidden>
      {hearts.map((h) => (
        <span
          key={h.key}
          className="heart"
          style={
            {
              "--x": `${h.x}%`,
              "--size": `${h.size}px`,
              "--duration": `${h.duration}s`,
              "--delay": `${h.delay}s`,
              "--hue": h.hue,
            } as React.CSSProperties
          }
        >
          {h.glyph}
        </span>
      ))}
    </div>
  );
}
