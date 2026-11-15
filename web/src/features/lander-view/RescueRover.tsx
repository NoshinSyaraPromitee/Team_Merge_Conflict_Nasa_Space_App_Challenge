import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getSite, isLit, wrapHour, type RescueState } from "@/core";

// Rescue Mode: the rover (web/public/Altair.svg) is always in the 360-degree view and reacts to every move:
// - Drive: rolls toward the Sun with a bounce and a dust trail, then stays at its new place
// - Instruments off: goes dim; back on: normal
// - Hibernate: goes dark with floating "Z"s until it wakes up
// - Tilt panels: leans toward the Sun and stays tilted
// - Sunlight on the rover: warm glow; in shadow: darker
// - Battery low: blinking red light; mission lost: grey and slumped; mission saved: green glow and a hop
// The newest mission log line pops up briefly at the top, so every move is explained.

const ROVER_SRC = `${import.meta.env.BASE_URL}Altair.svg`;
const STEP = 9; // % of the view the rover moves per 1 km drive

export function RescueRover({ game }: { game: RescueState }) {
  // Direction of the Sun when the game started: the rover faces it and drives toward it
  const [sunPct] = useState(() => {
    const s = getSite(game.params.siteIdx);
    return Math.min(90, Math.max(10, (s.sunAz[wrapHour(game.startH)] / 360) * 100));
  });
  const dir = sunPct >= 50 ? 1 : -1;
  const x = 50 + dir * Math.min(Math.abs(sunPct - 50), game.drives * STEP);

  const lit = isLit(game, game.t);
  const sleeping = game.t < game.hibernateUntil;
  const low = game.soc / game.params.batteryKwh < 0.2;
  const lost = game.status === "lost";
  const saved = game.status === "saved";

  const filter = lost
    ? "grayscale(1) brightness(0.45)"
    : sleeping
      ? "brightness(0.35) saturate(0.4)"
      : game.instrumentsOff
        ? "brightness(0.6) saturate(0.6)"
        : saved
          ? "drop-shadow(0 0 12px rgba(34,197,94,0.8))"
          : lit
            ? "drop-shadow(0 0 10px rgba(245,165,36,0.7))"
            : "brightness(0.7)";

  // Pop up the newest log line for a few seconds whenever a new one arrives
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const seen = useRef(game.log.length);
  useEffect(() => {
    if (game.log.length === seen.current) return;
    seen.current = game.log.length;
    const line = game.log[game.log.length - 1];
    setToast({ id: Date.now(), text: line.text });
    const id = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(id);
  }, [game.log]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-xl" aria-hidden>
      <motion.div
        className="absolute bottom-0 h-[36%] w-16 -translate-x-1/2"
        animate={{ left: `${x}%` }}
        transition={{ type: "spring", stiffness: 40, damping: 14 }}
      >
        {/* Bounce while driving (restarts on every drive) */}
        <motion.div
          key={`drive-${game.drives}`}
          className="h-full w-full"
          initial={{ y: 0 }}
          animate={game.drives > 0 ? { y: [0, -3, 0, -2, 0, -3, 0] } : { y: 0 }}
          transition={{ duration: 1.6 }}
        >
          <motion.img
            src={ROVER_SRC}
            alt=""
            className="h-full w-full object-contain object-bottom"
            style={{ scaleX: -dir, filter, transition: "filter 0.6s" }}
            animate={{
              rotate: lost ? 8 * dir : game.tilted ? -6 * dir : 0,
              y: saved ? [0, -10, 0] : 0,
            }}
            transition={{ type: "spring", stiffness: 80, damping: 12 }}
          />
        </motion.div>

        {/* Dust while driving */}
        {game.drives > 0 &&
          [0, 1, 2, 3].map((i) => (
            <motion.span
              key={`dust-${game.drives}-${i}`}
              className="absolute bottom-1 size-3 rounded-full bg-[#9ca3af]"
              style={{ left: dir > 0 ? "8%" : "80%" }}
              initial={{ opacity: 0.7, scale: 0.4, x: 0, y: 0 }}
              animate={{ opacity: 0, scale: 2.4, x: -dir * 18, y: -10 }}
              transition={{ duration: 1, delay: i * 0.25 }}
            />
          ))}

        {/* Battery low warning light */}
        {low && !lost && (
          <motion.span
            className="absolute top-[18%] left-1/2 size-2 rounded-full bg-[#ef4444]"
            animate={{ opacity: [1, 0.15, 1] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        {/* Sleeping */}
        {sleeping &&
          [0, 1, 2].map((i) => (
            <motion.span
              key={`z-${i}`}
              className="absolute top-0 right-2 text-sm font-bold text-[#c7d2fe]"
              initial={{ opacity: 0, y: 0, x: 0 }}
              animate={{ opacity: [0, 1, 0], y: -28, x: 10 }}
              transition={{ duration: 2.4, delay: i * 0.8, repeat: Infinity }}
            >
              Z
            </motion.span>
          ))}
      </motion.div>

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className="absolute top-2 left-1/2 max-w-[90%] -translate-x-1/2 truncate rounded-full bg-black/65 px-3 py-1 text-xs font-semibold text-white"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
