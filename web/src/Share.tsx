import { useEffect, useRef, useState } from "react";
import type { BetReceipt } from "./Bet";
import { Sheet } from "./Sheet";
export function Share({ bet, close }: { bet: BetReceipt; close: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null),
    [url, setUrl] = useState("");
  useEffect(() => {
    void document.fonts.ready.then(() => {
      const c = canvas.current;
      if (!c) return;
      const x = c.getContext("2d")!;
      x.fillStyle = "#FFF5E6";
      x.fillRect(0, 0, 1000, 600);
      x.fillStyle = "#E9D9C3";
      for (let i = 10; i < 1000; i += 24)
        for (let j = 10; j < 600; j += 24) x.fillRect(i, j, 2, 2);
      x.fillStyle = "#2B2118";
      x.font = "600 27px Geist";
      x.fillText("hamster hour", 55, 65);
      const headline = "I’m betting on the hamster.";
      let headSize = 74;
      x.font = `700 ${headSize}px Geist`;
      while (x.measureText(headline).width > 890) {
        headSize--;
        x.font = `700 ${headSize}px Geist`;
      }
      x.fillText(headline, 55, 174);
      x.fillStyle = bet.side.includes("OVER")
        ? "#E07A3E"
        : bet.side.includes("UNDER")
          ? "#5B8DEF"
          : "#9A6FE0";
      x.fillRect(55, 220, 890, 125);
      x.fillStyle = "#2B2118";
      const line = `${bet.side} · ${bet.amount} IMD`;
      let size = 40;
      x.font = `${size}px Silkscreen`;
      while (x.measureText(line).width > 840 && size > 14) {
        size--;
        x.font = `${size}px Silkscreen`;
      }
      x.fillText(line, 78, 296);
      x.font = "400 32px Geist";
      x.fillText(`Line: ${bet.line} passes · ${bet.time}`, 55, 410);
      x.font = "400 25px Geist";
      x.fillText("One real hamster. One hour. Your call.", 55, 465);
      x.font = "600 27px Geist";
      x.fillText("hamsterhour.fun", 55, 548);
      setUrl(c.toDataURL("image/png"));
    });
  }, [bet]);
  const text = `I bet ${bet.amount} IMD on ${bet.side} at Hamster Hour. Line: ${bet.line} passes. ${bet.time} my time.`;
  return (
    <Sheet title="You’re in. Tell the wheel." close={close}>
      <canvas
        ref={canvas}
        width="1000"
        height="600"
        className="share-canvas"
        role="img"
        aria-label={text}
      />
      <p>
        Your bet is confirmed. Download your card to attach it to your post.
      </p>
      <div className="row wrap">
        <a
          className="primary"
          href={`https://x.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent("https://hamsterhour.fun")}`}
          target="_blank"
          rel="noreferrer"
        >
          Share on X ↗
        </a>
        <a className="button" href={url} download="hamster-hour-bet.png">
          Save image ↓
        </a>
      </div>
    </Sheet>
  );
}
