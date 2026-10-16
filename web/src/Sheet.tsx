import { useEffect, useRef, type ReactNode } from "react";
export function Sheet({
  title,
  close,
  locked = false,
  children,
}: {
  title: string;
  close: () => void;
  locked?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      trigger?.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="amount-sheet"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) close();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !locked) close();
      }}
    >
      <div className="sheet-head">
        <h2>{title}</h2>
        <button
          onClick={close}
          disabled={locked}
          aria-label="Close amount sheet"
        >
          ×
        </button>
      </div>
      {children}
    </dialog>
  );
}
