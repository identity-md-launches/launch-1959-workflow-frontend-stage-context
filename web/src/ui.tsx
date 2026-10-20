import { useId, type ReactNode } from "react";
export function Help({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  const id = useId();
  return (
    <details className="help">
      <summary aria-label={`About ${label}`} aria-describedby={id}>
        ?
      </summary>
      <div className="help-popover" id={id}>
        {children}
      </div>
    </details>
  );
}
export function CardHead({
  title,
  help,
  children,
}: {
  title: string;
  help: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="card-head">
      <h2>{title}</h2>
      <div className="row">
        {children}
        <Help label={title}>{help}</Help>
      </div>
    </div>
  );
}
export function Icon({
  name,
}: {
  name:
    | "sun"
    | "moon"
    | "sound"
    | "mute"
    | "arrow"
    | "play"
    | "seed"
    | "chat"
    | "chart"
    | "external";
}) {
  const paths = {
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z" />,
    sound: (
      <>
        <path d="m11 5-5 4H3v6h3l5 4zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" />
      </>
    ),
    mute: (
      <>
        <path d="m11 5-5 4H3v6h3l5 4zM16 9l6 6m0-6-6 6" />
      </>
    ),
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    play: <path d="m8 5 11 7-11 7z" />,
    seed: (
      <>
        <path d="M12 3c15 9 10 18 0 18S-3 12 12 3Z" />
        <path d="M12 8v10" />
      </>
    ),
    chat: (
      <path d="M21 11a8 8 0 0 1-9 8H7l-4 3V7a5 5 0 0 1 5-4h8a5 5 0 0 1 5 5ZM7 9h10M7 13h6" />
    ),
    chart: <path d="M4 20V12m8 8V4m8 16V8" />,
    external: <path d="M13 4h7v7m0-7L9 15m0-11H4v16h16v-5" />,
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
