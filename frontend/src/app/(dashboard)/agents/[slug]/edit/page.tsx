"use client";

import { use } from "react";
import { AgentFixPanel } from "@/components/agents/agent-fix-panel";

export default function AgentEditPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  return <AgentFixPanel slug={slug} mode="edit" />;
}
