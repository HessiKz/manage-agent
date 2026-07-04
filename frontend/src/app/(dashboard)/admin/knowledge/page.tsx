"use client";

import { KnowledgeBaseAdmin } from "@/components/admin/knowledge-base-admin";

export default function AdminKnowledgePage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-stone-900">پایگاه دانش</h1>
        <p className="mt-1 text-sm text-stone-500">
          مجموعه‌های دانش سازمانی، فایل‌ها و اتصال API.
        </p>
      </div>
      <KnowledgeBaseAdmin />
    </div>
  );
}
