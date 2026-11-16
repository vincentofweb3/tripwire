import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { unichainSepolia, baseSepolia } from "./lib/chains";
import { App } from "./App";
import "./styles.css";

const wagmiConfig = createConfig({
  chains: [unichainSepolia, baseSepolia],
  connectors: [injected({ shimDisconnect: true })],
  transports: {
    [unichainSepolia.id]: http(unichainSepolia.rpcUrls.default.http[0]),
    [baseSepolia.id]: http(baseSepolia.rpcUrls.default.http[0])
  },
  ssr: false
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false }
  }
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </StrictMode>
);
