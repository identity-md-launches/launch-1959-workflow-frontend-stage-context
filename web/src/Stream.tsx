import { useQuery } from "@tanstack/react-query";
import { services } from "./config";
export function streamId(data: unknown): string {
  if (!data || typeof data !== "object")
    throw Error("No live video is listed.");
  const d = data as Record<string, unknown>;
  for (const value of [
    d.publicId,
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
  const q = useQuery({
    queryKey: ["stream"],
    queryFn: async () => {
      const r = await fetch(services.stream, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error(`Stream feed returned ${r.status}.`);
      const data = await r.json();
      return streamId({ publicId: data.publicId });
    },
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) =>
      query.state.status === "error" ? false : 60000,
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
      <iframe
        title="Live Squeekchain hamster wheel"
        src={`https://www.youtube.com/embed/${q.data ?? "6K_uF2s-LSw"}?autoplay=1&mute=1`}
        loading="lazy"
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </section>
  );
}
