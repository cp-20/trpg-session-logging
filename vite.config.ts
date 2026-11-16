import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import Icons from "unplugin-icons/vite";

export default defineConfig({
  plugins: [
    react(),
    Icons({
      compiler: "jsx",
      jsxFactory: "React.createElement",
      jsxFragmentFactory: "React.Fragment",
    }),
  ],
  server: { port: 5173, host: true },
});
