import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/500.css";
import "@fontsource/noto-sans-jp/700.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.env.DEV) {
  if (location.search.includes("review=0")) {
    localStorage.removeItem("takufu-live-review");
  } else if (location.search.includes("review=1")) {
    localStorage.setItem("takufu-live-review", "1");
  }
  if (localStorage.getItem("takufu-live-review") === "1") {
    const s = document.createElement("script");
    s.src = "http://127.0.0.1:4319/overlay.js";
    document.body.appendChild(s);
  }
}
