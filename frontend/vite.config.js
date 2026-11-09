// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// In dev, forward /api to the FastAPI server so the browser sees a single origin.
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom" },
  server: { port: 5173, proxy: { "/api": "http://localhost:8000" } },
});
