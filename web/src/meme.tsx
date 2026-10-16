import { useEffect, useRef, useState } from "react";
export const reducedMotion = () =>
  typeof matchMedia === "function" &&
  matchMedia("(prefers-reduced-motion: reduce)").matches;
let audio: AudioContext | undefined;
/** A short synthesized squeak. No audio file is loaded. */
export function squeak() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    if (audio.state === "suspended") void audio.resume();
    const t = audio.currentTime;
    const osc = audio.createOscillator(),
      gain = audio.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(1300, t);
    osc.frequency.exponentialRampToValueAtTime(2200, t + 0.07);
    osc.frequency.exponentialRampToValueAtTime(1500, t + 0.14);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(gain).connect(audio.destination);
    osc.start(t);
    osc.stop(t + 0.16);
  } catch {
    /* sound is a bonus */
  }
}
const pokeKey = "hamster-hour:pokes";
export function usePokes() {
  const [count, setCount] = useState(() => {
    try {
      const n = Number(localStorage.getItem(pokeKey));
      return Number.isSafeInteger(n) && n > 0 ? n : 0;
    } catch {
      return 0;
    }
  });
  const [hop, setHop] = useState(0);
  function poke() {
    squeak();
    setHop((h) => h + 1);
    setCount((n) => {
      try {
        localStorage.setItem(pokeKey, String(n + 1));
      } catch {
        /* count this visit only */
      }
      return n + 1;
    });
  }
  return { count, hop, poke };
}
const KONAMI = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "b",
  "a",
];
/** Returns a counter that increments every time the Konami code is typed. */
export function useKonami() {
  const [spins, setSpins] = useState(0);
  const position = useRef(0);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      position.current =
        key === KONAMI[position.current]
          ? position.current + 1
          : key === KONAMI[0]
            ? 1
            : 0;
      if (position.current === KONAMI.length) {
        position.current = 0;
        setSpins((s) => s + 1);
      }
    }
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);
  return spins;
}
/** Counts clicks on one element within a short run; resolves after `target`. */
export function useClickRun(target: number) {
  const [done, setDone] = useState(false);
  const clicks = useRef<number[]>([]);
  function click() {
    const t = Date.now();
    clicks.current = [...clicks.current.filter((v) => t - v < 4000), t];
    if (clicks.current.length >= target) {
      clicks.current = [];
      setDone((d) => !d);
    }
  }
  return { done, click };
}
/** Digits roll like a slot machine when the value changes. */
export function SlotNumber({ value }: { value: string }) {
  const chars = value.split("");
  return (
    <span className="slot" aria-label={value} role="text">
      {chars.map((c, i) =>
        /\d/.test(c) ? (
          <span className="slot-digit" key={i} aria-hidden="true">
            <span
              className="slot-reel"
              style={{
                transform: `translateY(calc(-${Number(c)} * var(--slot-row-height)))`,
                transitionDelay: `${i * 60}ms`,
              }}
            >
              {"0123456789".split("").map((d) => (
                <span key={d}>{d}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={i} aria-hidden="true">
            {c}
          </span>
        ),
      )}
    </span>
  );
}
/** Pixel sunflower seeds falling over a result card. Static under reduced motion. */
export function SeedConfetti() {
  const seeds = Array.from({ length: 18 }, (_, i) => i);
  return (
    <div className="confetti" aria-hidden="true">
      {seeds.map((i) => (
        <span
          key={i}
          className="seed"
          style={{
            left: `${(i * 53) % 100}%`,
            animationDelay: `${(i % 6) * 0.25}s`,
            animationDuration: `${2.4 + (i % 4) * 0.4}s`,
            transform: `rotate(${(i * 47) % 360}deg)`,
          }}
        />
      ))}
    </div>
  );
}
export function shareIntent(text: string) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}`;
}
