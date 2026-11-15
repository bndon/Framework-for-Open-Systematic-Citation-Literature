import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./App.css";
import "./styles.css";
import { loadAppTheme, applyAppTheme } from "./lib/settings";

// Apply persisted theme immediately to prevent flash
applyAppTheme(loadAppTheme());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
