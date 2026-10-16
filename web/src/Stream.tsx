import { useEffect, useState } from "react";
import { services } from "./config";
import {
  lastKnownStream,
  useLive,
  useStatus,
  useWentLive,
  type Live,
} from "./live";
import { reducedMotion } from "./meme";
export function streamId(data: unknown): string {
  if (!data || typeof data !== "object")
    throw Error("No live video is listed.");
  const d = data as Record<string, unknown>;
  for (const value of [d.publicId, d.youtubeId, d.videoId, d.id, d.url]) {
    if (typeof value !== "string") continue;
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    try {
      const u = new URL(value);
      if (["youtube.com", "www.youtube.com", "youtu.be"].includes(u.hostname)) {
        const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    } catch {
      /* an unsupported field is not a video */
    }
  }
  throw Error("The feed has no supported YouTube video ID.");
}
export function playerState(live: Live | undefined, failed: boolean) {
  // A failed refresh can retain cached live/idle data; failure takes priority.
  if (failed) return { mode: "fallback" as const, id: lastKnownStream() };
  if (live && live.state === "live" && live.kind === "youtube" && live.publicId)
    return { mode: "live" as const, id: live.publicId };
  if (!live) return { mode: "loading" as const, id: lastKnownStream() };
  return { mode: "sleeping" as const, id: undefined };
}
export function Stream({
  hop,
  onLiveChange,
}: {
  hop: number;
  onLiveChange?: (live: boolean | undefined) => void;
}) {
  const live = useLive(),
    status = useStatus();
  const player = playerState(live.data, live.isError);
  const isLive =
    player.mode === "live"
      ? true
      : player.mode === "sleeping"
        ? false
        : undefined;
  const wentLive = useWentLive(isLive);
  useEffect(() => onLiveChange?.(isLive), [isLive, onLiveChange]);
  const [hopping, setHopping] = useState(false);
  useEffect(() => {
    if (!hop || reducedMotion()) return;
    setHopping(true);
    const id = setTimeout(() => setHopping(false), 500);
    return () => clearTimeout(id);
  }, [hop]);
  const sleeping = player.mode === "sleeping";
  return (
    <section
      className={`stream ${sleeping ? "is-sleeping" : ""} ${wentLive ? "went-live" : ""}`}
      aria-label="Squeekchain live stream"
    >
      <div className="stream-bar">
        <span>
          <span className={`status-dot ${sleeping ? "dim" : ""}`} />
          Squeekchain · wheel cam
        </span>
        <a href={services.source} target="_blank" rel="noreferrer">
          Open source ↗
        </a>
      </div>
      <div className="player">
        <span
          className={`live-badge ${sleeping ? "sleeping" : "live"}`}
          role="status"
        >
          {sleeping ? "SLEEPING" : "LIVE"}
        </span>
        {wentLive && (
          <div className="running-banner" role="status">
            HE’S RUNNING
          </div>
        )}
        {sleeping ? (
          <div className="sleep-screen">
            <div className="zzz" aria-hidden="true">
              <span>z</span>
              <span>z</span>
              <span>z</span>
            </div>
            <img
              className={`mascot ${hopping ? "hop" : ""}`}
              src="./assets/hamster-curled.svg"
              width="120"
              height="120"
              alt="Hamster curled up asleep"
            />
            <p className="sleep-title">HAMSTER IS SLEEPING · stream is off</p>
            <p className="sleep-stats">
              {status.data
                ? `last known: ${status.data.speedMmPerSecond} mm/s · ${Number(status.data.cumulativeWorkUnits).toLocaleString()} passes total`
                : status.isError
                  ? "last known passes unavailable"
                  : "reading last known passes…"}
            </p>
          </div>
        ) : (
          <iframe
            title="Live Squeekchain hamster wheel"
            src={`https://www.youtube.com/embed/${player.id}?autoplay=1&mute=1`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        )}
      </div>
    </section>
  );
}
