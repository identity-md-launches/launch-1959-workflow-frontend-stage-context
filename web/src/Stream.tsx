import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { services } from "./config";
export function streamId(data: unknown): string {
  if (!data || typeof data !== "object")
    throw Error("No live video is listed.");
  const d = data as Record<string, unknown>;
  for (const value of [
    d.youtubeId,
    d.youtube_id,
    d.videoId,
    d.video_id,
    d.youtubeVideoId,
    d.id,
    d.url,
    d.youtubeUrl,
    d.youtube_url,
  ]) {
    if (typeof value !== "string") continue;
    if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
    try {
      const u = new URL(value);
      if (
        [
          "youtube.com",
          "www.youtube.com",
          "youtu.be",
          "www.youtube-nocookie.com",
        ].includes(u.hostname)
      ) {
        const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
        if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return id;
      }
    } catch {
      /* an unsupported field is not a video */
    }
  }
  throw Error("The feed has no supported YouTube video ID.");
}
export function Stream() {
  const [playing, setPlaying] = useState(true);
  const q = useQuery({
    queryKey: ["stream"],
    queryFn: async () => {
      const r = await fetch(services.stream, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error(`Stream feed returned ${r.status}.`);
      return streamId(await r.json());
    },
    retry: false,
    refetchInterval: 60000,
  });
  return (
    <section className="stream" aria-label="Squeekchain live stream">
      <div className="stream-bar">
        <span>
          <span className="status-dot" />
          Squeekchain · wheel cam
        </span>
        <a href={services.source} target="_blank" rel="noreferrer">
          Open source ↗
        </a>
      </div>
      {q.data && playing ? (
        <iframe
          title="Live Squeekchain hamster wheel"
          src={`https://www.youtube-nocookie.com/embed/${q.data}?autoplay=0&rel=0`}
          allow="encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <div className="stream-empty">
          <img src="./favicon.svg" width="54" height="54" alt="" />
          <div>
            <strong>
              {q.isPending
                ? "Finding the live wheel…"
                : q.data
                  ? "Wheel cam paused"
                  : "Wheel cam unavailable"}
            </strong>
            <p>
              {q.data
                ? "Resume to watch the current feed."
                : "Live video is not listed."}
            </p>
          </div>
          {!q.isPending && (
            <button
              onClick={() => (q.data ? setPlaying(true) : void q.refetch())}
              disabled={q.isFetching}
            >
              {q.isFetching
                ? "Retrying…"
                : q.data
                  ? "Resume stream"
                  : "Retry stream"}
            </button>
          )}
        </div>
      )}
      {q.data && playing && (
        <button className="stop-stream" onClick={() => setPlaying(false)}>
          Hide stream
        </button>
      )}
    </section>
  );
}
