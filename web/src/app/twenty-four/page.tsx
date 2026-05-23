"use client";
import { useState } from "react";
import SoloView from "./SoloView";
import MultiView from "./MultiView";

type Mode = "solo" | "multi";

export default function TwentyFourPage() {
  const [mode, setMode] = useState<Mode>("solo");

  return (
    <main className="container">
      <div className="page-head">
        <div>
          <h1>24</h1>
          <p className="lede">
            Use all four cards exactly once with <span className="kbd">+</span>{" "}
            <span className="kbd">−</span> <span className="kbd">×</span>{" "}
            <span className="kbd">÷</span> and parentheses to make 24. J/Q/K = 10. Ace = 1
            or 11 (tap the Ace again to flip).
          </p>
        </div>
        <div className="mode-tabs">
          <button
            className={`tab ${mode === "solo" ? "active" : ""}`}
            onClick={() => setMode("solo")}
          >
            Solo
          </button>
          <button
            className={`tab ${mode === "multi" ? "active" : ""}`}
            onClick={() => setMode("multi")}
          >
            Multiplayer
          </button>
        </div>
      </div>

      {mode === "solo" ? <SoloView /> : <MultiView />}
    </main>
  );
}
