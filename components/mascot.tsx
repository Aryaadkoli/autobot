import type { CSSProperties } from "react";

// The Autobot mascot: shapes fly into place on load, then idles
// (bob, blink, sway, pulse) — built entirely from divs, no images/SVGs.
// Designed for dark backgrounds (stone-900/950).
export default function Mascot({
  scale = 1,
  className = "",
}: {
  scale?: number;
  className?: string;
}) {
  return (
    <div
      className={`mx-auto w-fit select-none [animation:robot-bob_3s_ease-in-out_1.5s_infinite] ${className}`}
      style={{ transform: `scale(${scale})` }}
    >
      {/* antenna */}
      <div className="flex flex-col items-center">
        <div
          className="h-2 w-2 rounded-full bg-amber-500 opacity-0 [animation:piece-in_0.5s_ease-out_0.15s_both,glow-pulse_2.2s_ease-in-out_1.6s_infinite]"
          style={{ "--ty": "-16px", "--s": "0.3" } as CSSProperties}
        />
        <div
          className="h-4 w-[3px] rounded-full bg-stone-500 opacity-0 [animation:piece-in_0.5s_ease-out_0.1s_both]"
          style={{ "--ty": "-16px" } as CSSProperties}
        />
      </div>

      {/* head */}
      <div
        className="relative mx-auto mt-0.5 flex h-10 w-10 items-center justify-center gap-2 rounded-xl bg-stone-200 opacity-0 [animation:piece-in_0.55s_ease-out_0.2s_both]"
        style={{ "--ty": "-26px" } as CSSProperties}
      >
        <div className="h-1.5 w-1.5 rounded-full bg-stone-900 [animation:robot-blink_4s_ease-in-out_1.7s_infinite]" />
        <div className="h-1.5 w-1.5 rounded-full bg-stone-900 [animation:robot-blink_4s_ease-in-out_1.7s_infinite]" />
      </div>

      {/* arms + torso */}
      <div className="mt-1.5 flex items-center justify-center gap-1">
        <div
          className="h-2.5 w-6 opacity-0 [animation:piece-in_0.5s_ease-out_0.3s_both]"
          style={{ "--tx": "-18px", "--rot": "-25deg" } as CSSProperties}
        >
          <div
            className="h-full w-full rounded-full bg-stone-400 [animation:arm-sway_2.6s_ease-in-out_1.9s_infinite]"
            style={{ transformOrigin: "right center" }}
          />
        </div>

        <div
          className="relative flex h-14 w-16 items-center justify-center rounded-2xl bg-stone-200 opacity-0 [animation:piece-in_0.55s_ease-out_0.25s_both]"
          style={{ "--s": "0.85" } as CSSProperties}
        >
          <div className="h-3 w-3 rounded-full bg-amber-500 [animation:glow-pulse_2.2s_ease-in-out_1.8s_infinite]" />
        </div>

        <div
          className="h-2.5 w-6 opacity-0 [animation:piece-in_0.5s_ease-out_0.35s_both]"
          style={{ "--tx": "18px", "--rot": "25deg" } as CSSProperties}
        >
          <div
            className="h-full w-full rounded-full bg-stone-400 [animation:arm-sway_2.6s_ease-in-out_2.1s_infinite_reverse]"
            style={{ transformOrigin: "left center" }}
          />
        </div>
      </div>

      {/* legs */}
      <div className="mt-1 flex items-center justify-center gap-3">
        <div
          className="h-5 w-2.5 rounded-full bg-stone-400 opacity-0 [animation:piece-in_0.5s_ease-out_0.4s_both]"
          style={{ "--ty": "14px" } as CSSProperties}
        />
        <div
          className="h-5 w-2.5 rounded-full bg-stone-400 opacity-0 [animation:piece-in_0.5s_ease-out_0.45s_both]"
          style={{ "--ty": "14px" } as CSSProperties}
        />
      </div>
    </div>
  );
}
