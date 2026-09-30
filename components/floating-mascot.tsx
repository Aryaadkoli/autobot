"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import Mascot from "./mascot";

const PAGE_CAPTIONS: { match: (path: string) => boolean; caption: string }[] = [
  { match: (p) => p === "/", caption: "Here to help" },
  { match: (p) => p.startsWith("/contacts"), caption: "Tracking your leads" },
  { match: (p) => p.startsWith("/templates"), caption: "Crafting your messages" },
  { match: (p) => p.startsWith("/workflows"), caption: "Running your follow-ups" },
  { match: (p) => p.startsWith("/campaigns"), caption: "Sending campaigns" },
  { match: (p) => p.startsWith("/analytics"), caption: "Crunching the numbers" },
  { match: (p) => p.startsWith("/settings"), caption: "Keeping things tidy" },
];

function captionFor(pathname: string): string {
  return PAGE_CAPTIONS.find((c) => c.match(pathname))?.caption ?? "Here to help";
}

// A little easter egg for now — a click just gets a fun reaction, nothing
// functional yet. Worth turning into a real quick-actions menu (jump to
// Add lead / New campaign / Import) if that'd be more useful than a joke.
const CLICK_REACTIONS = [
  "Beep boop!",
  "You rang?",
  "Leads don't chase themselves.",
  "01101000 01101001",
  "Coffee break?",
  "Reporting for duty!",
];

export default function FloatingMascot() {
  const pathname = usePathname();
  const [hovering, setHovering] = useState(false);
  const [reaction, setReaction] = useState<string | null>(null);
  const [bounce, setBounce] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleClick() {
    setReaction(CLICK_REACTIONS[Math.floor(Math.random() * CLICK_REACTIONS.length)]);
    setBounce(true);
    setTimeout(() => setBounce(false), 400);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setReaction(null), 2200);
  }

  return (
    <button
      onClick={handleClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      aria-label="Autobot"
      className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-2 cursor-pointer"
    >
      {(reaction ?? hovering) && (
        <span className="rounded-xl bg-stone-900/90 text-white text-xs px-3 py-1.5 whitespace-nowrap shadow-lg backdrop-blur-sm text-center">
          <span className="block font-medium">{reaction ?? "Autobot"}</span>
          {!reaction && <span className="block text-stone-400 text-[11px] mt-0.5">{captionFor(pathname)}</span>}
        </span>
      )}
      <div
        className={`relative flex h-20 w-20 items-center justify-center transition-transform ${
          bounce ? "scale-110" : "scale-100"
        }`}
      >
        <div className="absolute inset-0 rounded-full border border-dashed border-amber-400/30 [animation:spin-slow_20s_linear_infinite]" />
        <div className="absolute inset-2 rounded-full bg-stone-900/80 backdrop-blur-xl border border-white/10 shadow-lg" />
        <div className="relative scale-[0.4]">
          <Mascot />
        </div>
      </div>
    </button>
  );
}
