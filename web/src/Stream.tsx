import { useEffect, useState } from "react";
import { useLive, isLiveStream } from "./live";
import { Hamster } from "./pixel";

/** Camera and mascot share one frame. Expired or failed live checks unmount video. */
export function Stream({
  running,
  fresh,
  wake,
  paused,
  setPaused,
  now,
}: {
  running: boolean;
  fresh: boolean;
  wake?: number;
  paused: boolean;
  setPaused: (paused: boolean) => void;
  now: number;
}) {
  const live = useLive();
  const [videoPaused, setVideoPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const available = !live.isError && isLiveStream(live.data, now * 1000);
  const video = available && !videoPaused;
  return (
    <div className={`habitat-art ${video ? "has-video" : ""}`}>
      {video ? (
        <iframe
          key={live.data!.publicId}
          title="Squeekchain live wheel camera"
          src={`https://www.youtube.com/embed/${live.data!.publicId}?autoplay=${reducedMotion ? 0 : 1}&mute=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <Hamster running={running} />
      )}
      <span className="scene-note">
        {video
          ? "Live camera"
          : !fresh
            ? "Waiting for fresh telemetry"
            : running
              ? "On a little run"
              : wake
                ? `usually wakes in ~${wake}h`
                : "Taking a snooze"}
      </span>
      {available ? (
        <button
          className="motion-button"
          onClick={() => {
            setVideoPaused(!videoPaused);
            setPaused(!videoPaused);
          }}
        >
          {videoPaused ? "Watch live" : "Pause video"}
        </button>
      ) : (
        <button
          className="motion-button"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "Resume animations" : "Pause animations"}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      )}
    </div>
  );
}
