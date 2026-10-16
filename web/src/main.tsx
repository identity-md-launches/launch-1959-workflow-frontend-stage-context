import { createRoot } from "react-dom/client";
import { Component, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { loadRuntime } from "./config";
import { App } from "./App";
import "./styles.css";
class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="boot">
        <h1>Hamster Hour</h1>
        <p>The interface could not render. Reload to recover.</p>
        <button onClick={() => location.reload()}>Reload game</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
root.render(
  <main className="boot">
    <img src="./favicon.svg" width="48" height="48" alt="" />
    <h1>Hamster Hour</h1>
    <p>Loading the verified game configuration…</p>
  </main>,
);
loadRuntime()
  .then((runtime) => {
    const queries = new QueryClient({
      defaultOptions: {
        queries: { refetchOnWindowFocus: true, retry: 1, gcTime: 120000 },
      },
    });
    root.render(
      <ErrorBoundary>
        <WagmiProvider config={runtime.wagmi}>
          <QueryClientProvider client={queries}>
            <App runtime={runtime} />
          </QueryClientProvider>
        </WagmiProvider>
      </ErrorBoundary>,
    );
  })
  .catch((error) =>
    root.render(
      <main className="boot">
        <h1>Hamster Hour</h1>
        <p role="alert">
          {error instanceof Error
            ? error.message
            : "The deployment configuration could not load."}
        </p>
        <button onClick={() => location.reload()}>Retry loading</button>
      </main>,
    ),
  );
