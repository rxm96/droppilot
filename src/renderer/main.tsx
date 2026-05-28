import React from "react";
import ReactDOM from "react-dom/client";
import App from "@renderer/App";
import { initTheme, initAccent } from "@renderer/shared/theme";
import "./app.css";

initTheme();
// Apply stored accent override (if any) before first paint so the UI doesn't
// flash the default violet before swapping to the user's chosen color.
initAccent();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
