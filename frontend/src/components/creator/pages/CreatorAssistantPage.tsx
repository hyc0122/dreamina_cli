"use client";

import ScriptCreatorApp from "@/components/creator/scriptCreator/App";
import "@/components/creator/scriptCreator/index.css";

type CreatorAssistantPageProps = {
  routeHash: "" | "#settings" | "#novel" | "#screenplay" | "#storyboard" | "#score";
};

export default function CreatorAssistantPage({ routeHash }: CreatorAssistantPageProps) {
  return (
    <div className="creator-assistant-scope h-full min-h-0 overflow-hidden">
      <ScriptCreatorApp routeHash={routeHash} />
    </div>
  );
}
