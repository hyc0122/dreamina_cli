import React from "react";
import { createRoot } from "react-dom/client";
import JimengApp from "@/components/jimeng/JimengApp";
import "./index.css";

createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <JimengApp />
    </div>
  </React.StrictMode>,
);
