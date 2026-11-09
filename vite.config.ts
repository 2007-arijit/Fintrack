import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Route-level code splitting is already done with React.lazy in App.tsx.
  // The previous manualChunks (react / recharts / supabase / query) can produce circular chunk
  // imports and a blank page at runtime, so Rollup's default chunking is used instead.
});
