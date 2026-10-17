import type { windowProgress } from "./live";
import { counted } from "./model";

export function WindowProgress({
  k,
  line,
  progress,
}: {
  k: bigint;
  line: bigint;
  progress: ReturnType<typeof windowProgress>;
}) {
  if (!progress) return null;
  const passes = progress.passes;
  return (
    <div className="window-progress">
      <div
        className="window-progress-summary"
        role="region"
        tabIndex={0}
        aria-label={`Window ${k} live progress; scroll for details`}
      >
        {passes !== undefined && <>Window {k.toString()} in progress · </>}round{" "}
        {progress.round} of 6
        {passes !== undefined && (
          <>
            {" "}
            · {progress.approximate ? "≈" : ""}
            {counted(passes, "pass", "passes")} so far · line {line.toString()}
          </>
        )}
      </div>
      {passes !== undefined && (
        <div
          role="progressbar"
          className="window-progress-bar"
          aria-label={`Window ${k} passes toward line ${line}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress.percent}
          aria-valuetext={`${progress.approximate ? "Approximately " : ""}${counted(passes, "pass", "passes")} of line ${line}`}
        >
          <span style={{ width: `${progress.percent}%` }} />
        </div>
      )}
      <p className="small muted">
        Live counter, unofficial. Result is settled by the IMD oracle.
      </p>
    </div>
  );
}
