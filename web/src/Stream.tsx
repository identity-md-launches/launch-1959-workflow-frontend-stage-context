import { useState } from "react";
import { useLive, lastKnownStream } from "./live";
import { CardHead, Icon } from "./ui";
export function Stream() {
  const live = useLive();
  const [playing, setPlaying] = useState(
    () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const id = live.data?.publicId ?? lastKnownStream();
  return (
    <section className="card camera">
      <CardHead
        title="The wheel cam"
        help="A real hamster, on his own schedule. Video comes from Squeekchain. The counter above uses hardware telemetry; only the IMD oracle settles bets."
      >
        <span className="live-indicator">
          {live.data?.state === "live" ? "Live camera" : "Wheel camera"}
        </span>
      </CardHead>
      <div className="video-frame">
        {playing ? (
          <iframe
            title="Squeekchain live wheel camera"
            src={`https://www.youtube.com/embed/${id}?autoplay=1&mute=1`}
            loading="lazy"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : (
          <button className="cam-paused" onClick={() => setPlaying(true)}>
            <Icon name="play" /> Play wheel cam
          </button>
        )}
      </div>
      <div className="camera-caption">
        <span>
          {live.isError
            ? "Last known stream · reconnecting"
            : live.data?.state === "live"
              ? "Tiny paws. Big ambitions."
              : "He may be taking a nap."}
        </span>
        <button className="text-button" onClick={() => setPlaying(!playing)}>
          {playing ? "Pause video" : "Play video"}
        </button>
      </div>
    </section>
  );
}
