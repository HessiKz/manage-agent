"use client";

import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Paperclip } from "lucide-react";
import { fetchAgentFiles } from "@/lib/api";
import { downloadFileWithAuth, resolveDownloadUrl } from "@/lib/download-url";
import { showErrorToast } from "@/lib/toast-errors";

type Props = {
  agentId: string;
  enabled?: boolean;
};

export function ChatWorkspaceFilesBanner({ agentId, enabled = true }: Props) {
  const { data: files = [] } = useQuery({
    queryKey: ["agent-files", agentId],
    queryFn: () => fetchAgentFiles(agentId),
    enabled,
  });

  if (!enabled || files.length === 0) return null;

  return (
    <div className="mb-2 shrink-0 rounded-xl border border-brand-200/80 bg-brand-50/50 px-3 py-2 text-xs text-stone-700">
      <div className="flex items-start gap-2">
        <Paperclip className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-700" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-stone-900">
            {files.length} فایل در workspace ایجنت — ایجنت به آن‌ها دسترسی دارد
          </p>
          <p className="mt-0.5 text-stone-600">
            آپلود از تب «اجرای ایجنت» → «دریافت فایل» است؛ در چت نیازی به پیوست مجدد نیست.
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {files.slice(0, 4).map((f) => {
              const url = resolveDownloadUrl(`/api/v1/agents/${agentId}/files/${f.id}/download`);
              return (
                <li key={f.id} className="flex items-center gap-1.5 truncate">
                  <FileSpreadsheet className="h-3 w-3 shrink-0 text-stone-400" />
                  <span className="truncate">{f.filename}</span>
                  {url && (
                    <button
                      type="button"
                      className="shrink-0 font-semibold text-brand-700 underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void downloadFileWithAuth(url, f.filename).catch((err) =>
                          showErrorToast(err, "دانلود فایل")
                        );
                      }}
                    >
                      دانلود
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
