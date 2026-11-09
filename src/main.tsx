import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ConfigMissing } from "@/components/ConfigMissing";
import { supabaseConfigError } from "@/integrations/supabase/client";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element #root not found");

createRoot(rootEl).render(
  <ErrorBoundary>
    {supabaseConfigError ? <ConfigMissing reason={supabaseConfigError} /> : <App />}
  </ErrorBoundary>,
);

// Register the service worker only in production builds. In dev it serves stale files
// and can itself cause a blank page.
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Non-fatal: app still works without a service worker
      });
    });
  } else {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
  }
}
