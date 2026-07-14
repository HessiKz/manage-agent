"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { deleteAgentFile, fetchAgentFiles, uploadAgentFile } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { validateFileAgainstPolicy, filePolicyAcceptAttr, filePolicyTypeHint } from "@/lib/file-policy-utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentFile, AgentFilePolicy } from "@/types";
import { LoadingSpinner } from "@/components/loading";
import {
  agentFileRoleFromName,
  displayAgentFileName,
  roleBadgeLabel,
} from "@/lib/agent-file-roles";

type Props = {
  agentId: string;
  filePolicy: AgentFilePolicy;
  title?: string;
  description?: string;
  emptyText?: string;
  /** When set, only matching server files are listed (upload still allowed). */
  filter?: (file: AgentFile) => boolean;
};

function clientValidate(file: File, policy: AgentFilePolicy): string | null {
  return validateFileAgainstPolicy(file, policy);
}

export function FileIntakePanel({
  agentId,
  filePolicy,
  title = "آپلود فایل",
  description,
  emptyText = "هنوز فایلی آپلود نشده",
  filter,
}: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: allFiles = [], isLoading, isError, error: queryError } = useQuery({
    queryKey: ["agent-files", agentId],
    queryFn: () => fetchAgentFiles(agentId),
    enabled: Boolean(agentId),
  });
  const files = filter ? allFiles.filter(filter) : allFiles;

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const err = clientValidate(file, filePolicy);
        if (err) {
          setError(err);
          continue;
        }
        if (files.length >= filePolicy.max_files) {
          setError(`حداکثر ${filePolicy.max_files} فایل مجاز است`);
          break;
        }
        await uploadAgentFile(agentId, file);
      }
      await qc.invalidateQueries({ queryKey: ["agent-files", agentId] });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(fileId: string) {
    setError(null);
    setDeletingId(fileId);
    try {
      await deleteAgentFile(agentId, fileId);
      await qc.invalidateQueries({ queryKey: ["agent-files", agentId] });
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setDeletingId(null);
    }
  }

  const policyHint = `${filePolicyTypeHint(filePolicy)} · ${filePolicy.min_files}–${filePolicy.max_files} فایل · حداکثر ${filePolicy.max_file_size_mb}MB`;

  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-stone-50/40 p-4">
      <div>
        <p className="text-sm font-semibold text-stone-800">{title}</p>
        {description ? (
          <p className="mt-1 text-xs leading-relaxed text-stone-500">{description}</p>
        ) : null}
        <p className="mt-1 text-xs text-stone-400">{policyHint}</p>
      </div>
      <Stagger initial={false}>
      <StaggerItem variant="popIn">
        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-stone-300 bg-white p-4 hover:bg-brand-50/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              {uploading ? (
                <LoadingSpinner />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-semibold text-stone-800">افزودن فایل</p>
              <p className="text-xs text-stone-500">
                {isLoading ? "…" : files.length} / {filePolicy.max_files} فایل
              </p>
            </div>
          </div>
          <span className="text-xs font-semibold text-brand-700">انتخاب فایل</span>
          <input
            type="file"
            multiple
            className="hidden"
            accept={filePolicyAcceptAttr(filePolicy)}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </label>
      </StaggerItem>
      </Stagger>
      {(error || isError) && (
        <p className="text-sm text-accent-red">
          {error ||
            (queryError instanceof Error ? queryError.message : "بارگذاری فایل‌ها ناموفق بود.")}
        </p>
      )}
      <Stagger initial={false} className="space-y-2">
        {files.map((f) => (
          <StaggerItem key={f.id} variant="slideRight">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-2 truncate font-semibold text-stone-700" title={f.filename}>
                <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                  {roleBadgeLabel(agentFileRoleFromName(f.filename, f.role))}
                </span>
                <span className="truncate">{displayAgentFileName(f.filename)}</span>
              </span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-stone-400">{Math.round(f.size_bytes / 1024)}KB</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-accent-red disabled:opacity-50"
                  onClick={() => void handleDelete(f.id)}
                  disabled={deletingId === f.id || uploading}
                  aria-label={`حذف ${displayAgentFileName(f.filename)}`}
                >
                  {deletingId === f.id ? (
                    <LoadingSpinner />
                  ) : (
                    <X className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          </StaggerItem>
        ))}
      </Stagger>
      {!isLoading && files.length === 0 && (
        <p className="text-sm text-stone-400">{emptyText}</p>
      )}
    </div>
  );
}