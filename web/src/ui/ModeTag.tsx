import clsx from "clsx";

export type Mode = "game" | "guide";

const MODE = {
  game: { label: "Game", tip: "A game for practice. It is not for planning a real mission.", cls: "text-warn" },
  guide: { label: "Survival guide", tip: "Survival guide: real NASA data. Use this to plan a mission.", cls: "text-ok" },
} as const;

// Hover text for links and buttons that lead to a game or to the survival guide
export const MODE_TIP: Record<Mode, string> = { game: MODE.game.tip, guide: MODE.guide.tip };

// Plain coloured text that says if a part of MoonScope is a game (practice) or the survival guide (real planning)
export function ModeTag({ mode, className }: { mode: Mode; className?: string }) {
  const { label, tip, cls } = MODE[mode];
  return (
    <span title={tip} className={clsx("inline-block text-[11px] font-semibold tracking-[0.15em] uppercase", cls, className)}>
      {label}
    </span>
  );
}
