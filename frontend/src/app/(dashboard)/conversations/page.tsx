"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { MessageSquare, RotateCcw } from "lucide-react";
import { fetchConversations } from "@/lib/api";
import { SUPPORT_AGENT_SLUG } from "@/lib/support-chat";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClientDateTime } from "@/components/ui/client-date";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import { plainTextOutputPreview, plainTextUserPreview } from "@/lib/plain-text-preview";

export default function ConversationsPage() {
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["conversations"],
    queryFn: fetchConversations,
  });

  const workspaceConversations = items.filter((c) => c.agent_slug !== SUPPORT_AGENT_SLUG);

  return (
    <Stagger initial={false} className="page-padding space-y-6" delayChildren={0.03} staggerChildren={0.05}>
      <StaggerItem variant="slideUp">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">گفت‌وگوها</h1>
          <p className="text-stone-500">
            تاریخچه اجراها — برای ادامه، روی «ادامه گفت‌وگو» بزنید
          </p>
        </div>
      </StaggerItem>

      {isLoading && (
        <StaggerItem variant="fadeIn">
          <p className="text-stone-400">در حال بارگذاری…</p>
        </StaggerItem>
      )}

      <Stagger delayChildren={0.04} staggerChildren={0.05} className="grid gap-3">
        {workspaceConversations.map((c) => (
          <StaggerItem key={c.id} variant="slideRight">
            <Card className="transition hover:border-brand-200 hover:shadow-glow">
              <CardBody className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-stone-800">{c.agent_name}</p>
                    <div className="flex items-center gap-2">
                      {(c.message_count ?? 0) > 0 && (
                        <Badge variant="muted">{c.message_count} پیام</Badge>
                      )}
                      <Badge variant={c.status === "success" ? "success" : "muted"}>
                        {c.status === "success" ? "موفق" : c.status}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 truncate text-sm text-stone-600">
                    {plainTextUserPreview(c.preview ?? "")}
                  </p>
                  {c.output_preview && (
                    <p className="mt-0.5 truncate text-xs text-stone-500">
                      پاسخ: {plainTextOutputPreview(c.output_preview)}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-stone-400">
                    {c.started_at ? <ClientDateTime iso={c.started_at} /> : null}
                  </p>
                </div>
                <Link
                  href={`/agents/${c.agent_slug}?conversation=${c.id}`}
                  className="focus-ring inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  ادامه گفت‌وگو
                </Link>
              </CardBody>
            </Card>
          </StaggerItem>
        ))}
        {!isLoading && workspaceConversations.length === 0 && (
          <StaggerItem variant="fadeIn">
            <Card>
              <CardBody className="text-center text-stone-400">
                هنوز گفت‌وگویی ثبت نشده. از داشبورد یک ایجنت را اجرا کنید.
              </CardBody>
            </Card>
          </StaggerItem>
        )}
      </Stagger>
    </Stagger>
  );
}
