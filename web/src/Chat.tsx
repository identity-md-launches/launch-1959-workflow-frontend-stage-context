import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnection } from "wagmi";
import { createWalletClient, custom, getAddress, isAddress } from "viem";
import type { Runtime } from "./config";
import { services } from "./config";
import { reader, type GlobalState } from "./data";
import { positionTotal } from "./portfolio";
import { shortAddress, type Position } from "./model";
import { useWalletControl } from "./Wallet";
export type ChatMessage = {
  id: string;
  address: string;
  message: string;
  ts: number;
};
export const CHAT_MAX = 200;
export const CHAT_KEEP = 200;
export const CHAT_GAP_MS = 5000;
const LINK =
  /(https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|xyz|fun|eth|app|gg|co|me|link|site|dev|ly|to|tv|info|biz)\b)/i;
export const chatText = (ts: number, message: string) =>
  `Hamster Hour chat\n${ts}\n${message}`;
export function validateDraft(text: string) {
  const t = text.trim();
  if (!t) return "Type a message first.";
  if (t.length > CHAT_MAX) return `Keep it under ${CHAT_MAX} characters.`;
  if (LINK.test(t)) return "No links in chat.";
  return "";
}
export function serverWords(status: number, body: unknown) {
  const text =
    body && typeof body === "object" && typeof (body as any).error === "string"
      ? ((body as any).error as string)
      : "";
  if (status === 429 || /rate|slow|too many|wait/i.test(text))
    return "Slow down: one message every 5 seconds.";
  if (/link|url/i.test(text)) return "No links in chat.";
  if (/long|length|200/i.test(text))
    return `Keep it under ${CHAT_MAX} characters.`;
  if (/signature|sign/i.test(text))
    return "The signature did not match. Reconnect your wallet and try again.";
  if (/address/i.test(text)) return "Connect a wallet to chat.";
  if (/stale|ts|time/i.test(text))
    return "Your device clock looks off. Try again.";
  if (text && text.length < 80 && !/https?:\/\//.test(text))
    return text.charAt(0).toUpperCase() + text.slice(1) + ".";
  return `Chat did not accept the message (${status}). Try again.`;
}
export function parseMessages(data: unknown): {
  messages: ChatMessage[];
  now: number;
} {
  const d = (data ?? {}) as Record<string, any>;
  const list = Array.isArray(d.messages) ? d.messages : [];
  const messages: ChatMessage[] = [];
  for (const m of list) {
    if (
      m &&
      typeof m === "object" &&
      typeof m.message === "string" &&
      typeof m.address === "string" &&
      isAddress(m.address) &&
      Number.isFinite(Number(m.ts))
    )
      messages.push({
        id: String(m.id ?? `${m.address}-${m.ts}`),
        address: m.address,
        message: m.message.slice(0, CHAT_MAX),
        ts: Number(m.ts),
      });
  }
  const now = Number(d.now);
  return { messages, now: Number.isFinite(now) ? now : Date.now() };
}
export function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
) {
  const seen = new Set(existing.map((m) => m.id));
  const merged = [...existing, ...incoming.filter((m) => !seen.has(m.id))];
  merged.sort((a, b) => a.ts - b.ts);
  return merged.slice(-CHAT_KEEP);
}
/** Deterministic 5×5 pixel mark from the address, mirrored like an identicon. */
export function Identicon({ address }: { address: string }) {
  const hex = address.toLowerCase().replace(/^0x/, "");
  const hue = parseInt(hex.slice(0, 6), 16) % 360;
  const cells: boolean[] = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 5; col++) {
      const c = col < 3 ? col : 4 - col;
      const nibble = parseInt(hex[(row * 3 + c + 6) % hex.length] ?? "0", 16);
      cells.push(nibble % 2 === 1);
    }
  return (
    <span
      className="identicon"
      style={{ ["--hue" as string]: hue }}
      aria-hidden="true"
    >
      {cells.map((on, i) => (
        <i key={i} className={on ? "on" : ""} />
      ))}
    </span>
  );
}
export function Chat({ r, g }: { r: Runtime; g?: GlobalState }) {
  const { address, connector, chainId } = useConnection();
  const { open } = useWalletControl();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [feedError, setFeedError] = useState(false);
  const [sending, setSending] = useState(false);
  const [stuck, setStuck] = useState(true);
  const since = useRef(0);
  const lastSent = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let stop = false;
    async function poll() {
      try {
        const res = await fetch(
          `${services.proxy}/chat?since=${since.current}`,
          { signal: AbortSignal.timeout(8000), cache: "no-store" },
        );
        if (!res.ok) throw Error(String(res.status));
        const parsed = parseMessages(await res.json());
        if (stop) return;
        since.current = Math.max(
          since.current,
          ...parsed.messages.map((m) => m.ts),
        );
        if (parsed.messages.length)
          setMessages((v) => mergeMessages(v, parsed.messages));
        setFeedError(false);
      } catch {
        if (!stop) setFeedError(true);
      }
    }
    void poll();
    const id = setInterval(() => void poll(), 5000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);
  useEffect(() => {
    const el = list.current;
    if (el && stuck) el.scrollTop = el.scrollHeight;
  }, [messages, stuck]);
  const senders = [...new Set(messages.map((m) => m.address.toLowerCase()))];
  const windows = g
    ? [...new Set([g.currentWindow, g.candidate].map(String))]
    : [];
  const bettors = useQuery({
    queryKey: ["chat-bettors", senders.join(","), windows.join(",")],
    enabled: senders.length > 0 && windows.length > 0,
    staleTime: 30000,
    refetchInterval: 30000,
    retry: 1,
    queryFn: async () => {
      const read = reader(r);
      const flags = await Promise.all(
        senders.map(async (a) => {
          const positions = await Promise.all(
            windows.map((k) =>
              read<Position>("position", [BigInt(k), getAddress(a)]),
            ),
          );
          return [a, positions.some((p) => positionTotal(p) > 0n)] as const;
        }),
      );
      return Object.fromEntries(flags) as Record<string, boolean>;
    },
  });
  async function send() {
    if (sending) return;
    const problem = validateDraft(draft);
    if (problem) return setError(problem);
    if (Date.now() - lastSent.current < CHAT_GAP_MS)
      return setError("Slow down: one message every 5 seconds.");
    if (!address || !connector) return setError("Connect a wallet to chat.");
    setSending(true);
    setError("");
    try {
      const message = draft.trim();
      const ts = Date.now();
      const provider = await connector.getProvider();
      const wallet = createWalletClient({
        account: address,
        chain: r.chain,
        transport: custom(provider as any),
      });
      const signature = await wallet.signMessage({
        account: address,
        message: chatText(ts, message),
      });
      const res = await fetch(`${services.proxy}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, message, signature, ts }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw Error(serverWords(res.status, body));
      lastSent.current = Date.now();
      setDraft("");
      setStuck(true);
      const posted = parseMessages(
        body && Array.isArray((body as any).messages)
          ? body
          : { messages: [body?.message ?? body], now: Date.now() },
      );
      if (posted.messages.length)
        setMessages((v) => mergeMessages(v, posted.messages));
      else
        setMessages((v) =>
          mergeMessages(v, [{ id: `${address}-${ts}`, address, message, ts }]),
        );
    } catch (e: any) {
      setError(
        e?.code === 4001 || e?.name === "UserRejectedRequestError"
          ? "Signature declined in your wallet."
          : e instanceof Error && e.message.length < 160
            ? e.message
            : "The message could not be sent. Try again.",
      );
    } finally {
      setSending(false);
    }
  }
  const connected = !!address && chainId === r.chain.id;
  return (
    <section className="chat" aria-labelledby="chat-title">
      <div className="chat-head">
        <h2 id="chat-title">Wheel chat</h2>
        <span className="small muted">
          {feedError ? "reconnecting…" : `${messages.length} messages`}
        </span>
      </div>
      <div
        className="chat-list"
        ref={list}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(e) => {
          const el = e.currentTarget;
          setStuck(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
      >
        {messages.length === 0 && (
          <p className="small muted chat-empty">
            {feedError
              ? "Chat is unreachable right now. We keep trying every 5 seconds."
              : "No messages yet. Say hi to the wheel."}
          </p>
        )}
        {messages.map((m) => (
          <div className="chat-row" key={m.id}>
            <Identicon address={m.address} />
            <div className="chat-body">
              <span className="chat-meta">
                <span className="chat-address" title={m.address}>
                  {shortAddress(getAddress(m.address))}
                </span>
                {bettors.data?.[m.address.toLowerCase()] && (
                  <span
                    className="bet-tag"
                    title="Has a bet in this or the next window"
                  >
                    bet
                  </span>
                )}
                <time
                  dateTime={new Date(m.ts).toISOString()}
                  className="small muted"
                >
                  {new Date(m.ts).toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </span>
              <p className="chat-text">{m.message}</p>
            </div>
          </div>
        ))}
      </div>
      {!stuck && messages.length > 0 && (
        <button
          className="text-button chat-jump"
          onClick={() => {
            setStuck(true);
            const el = list.current;
            if (el) el.scrollTop = el.scrollHeight;
          }}
        >
          Jump to newest
        </button>
      )}
      {address ? (
        <form
          className="chat-form"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label htmlFor="chat-draft" className="visually-hidden">
            Message
          </label>
          <input
            id="chat-draft"
            value={draft}
            maxLength={CHAT_MAX}
            autoComplete="off"
            placeholder={
              connected
                ? "Say something to the wheel"
                : `Switch to ${r.chain.name} to chat`
            }
            disabled={sending || !connected}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError("");
            }}
            aria-describedby="chat-error chat-hint"
          />
          <button
            type="submit"
            disabled={sending || !connected || !draft.trim()}
          >
            {sending ? "Signing…" : "Send"}
          </button>
        </form>
      ) : (
        <div className="chat-connect">
          <button onClick={open}>Connect to chat</button>
        </div>
      )}
      <p id="chat-hint" className="small muted chat-hint">
        {address
          ? `${draft.length}/${CHAT_MAX} · signed by your wallet, no gas · no links`
          : "Read-only until a wallet is connected."}
      </p>
      <p id="chat-error" className="error small" role="status">
        {error}
      </p>
    </section>
  );
}
