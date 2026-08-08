// Authored by Karter Whitman using Claude Opus 4.8
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { listenForRemoteChanges } from "./store/index.js";
import "./typography.css";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");

// Before the first render: a change from another window that lands during
// startup should be in the pool by the time anything reads it.
listenForRemoteChanges();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
