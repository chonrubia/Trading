import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
const proxy = { "/api": "http://localhost:8765", "/ws": { target: "ws://localhost:8765", ws: true } };
export default defineConfig({ plugins: [react()], server: { proxy }, preview: { port: 5173, proxy } });
