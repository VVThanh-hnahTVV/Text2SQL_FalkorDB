import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Theme flag for canvas / legacy viewers (light-first Architect UI)
try {
  const savedTheme = localStorage.getItem("theme");
  const theme = savedTheme === "light" || savedTheme === "dark" ? savedTheme : "light";
  document.documentElement.setAttribute("data-theme", theme);
  if (savedTheme !== theme) {
    localStorage.setItem("theme", theme);
  }
} catch {
  document.documentElement.setAttribute("data-theme", "light");
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Failed to find the root element. Make sure index.html contains a div with id='root'.");
}
createRoot(rootElement).render(<App />);
