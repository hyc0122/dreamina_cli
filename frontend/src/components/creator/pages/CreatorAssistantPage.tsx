"use client";

import ScriptCreatorApp from "@/components/creator/scriptCreator/App";
import "@/components/creator/scriptCreator/index.css";

export default function CreatorAssistantPage() {
  return (
    <div className="creator-assistant-scope h-full min-h-0 overflow-auto">
      <ScriptCreatorApp />
    </div>
  );
}
