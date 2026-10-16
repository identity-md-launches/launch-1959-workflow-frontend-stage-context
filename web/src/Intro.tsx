import { useEffect, useRef, useState } from "react";
export const SOCIAL = "https://x.com/hamsterhourgame";
const key = "hamster-hour:intro-dismissed:v1";
export function Intro() {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(key) !== "yes";
    } catch {
      return true;
    }
  });
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dismiss = () => {
    try {
      localStorage.setItem(key, "yes");
    } catch {
      /* dismiss this visit */
    }
    setVisible(false);
  };
  useEffect(() => {
    if (visible) dialog.current?.showModal();
    else {
      dialog.current?.close();
      document
        .querySelector<HTMLButtonElement>(".market-button")
        ?.focus({ preventScroll: true });
    }
  }, [visible]);
  useEffect(() => {
    if (paused) video.current?.pause();
    else void video.current?.play().catch(() => setPaused(true));
  }, [paused, visible]);
  if (!visible) return null;
  return (
    <dialog
      ref={dialog}
      className="intro-overlay"
      aria-labelledby="intro-title"
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onClick={(e) => {
        if (e.target === dialog.current) dismiss();
      }}
    >
      <div className="intro-content">
        <button
          className="intro-close"
          onClick={dismiss}
          aria-label="Close introduction"
        >
          ×
        </button>
        <h1 id="intro-title">HAMSTER HOUR</h1>
        <div className="intro-video-frame">
          <video
            ref={video}
            src="./assets/hamster-chewing.mp4"
            poster="./assets/hamster-happy.svg"
            autoPlay={!paused}
            muted
            loop
            playsInline
            preload="auto"
            aria-label="A hamster chewing"
          />
          <button className="video-toggle" onClick={() => setPaused(!paused)}>
            {paused ? "Play video" : "Pause video"}
          </button>
        </div>
        <p>bet. lose. win $HAMSTER.</p>
        <div className="intro-actions">
          <button className="primary" onClick={dismiss} autoFocus>
            Start playing
          </button>
          <a className="button" href={SOCIAL} target="_blank" rel="noreferrer">
            Follow on X
          </a>
        </div>
        <span className="small muted">$HAMSTER rewards coming soon.</span>
      </div>
    </dialog>
  );
}
