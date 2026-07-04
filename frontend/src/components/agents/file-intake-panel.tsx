"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X } from "lucide-react";
import { deleteAgentFile, fetchAgentFiles, uploadAgentFile } from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { validateFileAgainstPolicy, filePolicyAcceptAttr, filePolicyTypeHint } from "@/lib/file-policy-utils";
import { Stagger, StaggerItem } from "@/components/motion/stagger";
import type { AgentFilePolicy } from "@/types";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

type Props = {
  agentId: string;
  filePolicy: AgentFilePolicy;
};

function clientValidate(file: File, policy: AgentFilePolicy): string | null {
  return validateFileAgainstPolicy(file, policy);
}

export function FileIntakePanel({ agentId, filePolicy }: Props) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: files = [] } = useQuery({
    queryKey: ["agent-files", agentId],
    queryFn: () => fetchAgentFiles(agentId),
  });

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
    <div className="space-y-4">
      <p className="text-xs text-stone-500">{policyHint}</p>
      <Stagger initial={false}>
      <StaggerItem variant="popIn">
        <label className="flex cursor-pointer items-center justify-between rounded-2xl border border-dashed border-stone-300 bg-stone-50/40 p-4 hover:bg-brand-50/30">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
              {uploading ? (
                <LoadingSpinner />
              ) : (
                <Upload className="h-5 w-5" />
              )}
            </div>
            <div>
              <p className="font-semibold text-stone-800">آپلود فایل</p>
              <p className="text-xs text-stone-500">
                {files.length} / {filePolicy.max_files} فایل
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
      {error && <p className="text-sm text-accent-red">{error}</p>}
      <Stagger initial={false} className="space-y-2">
        {files.map((f) => (
          <StaggerItem key={f.id} variant="slideRight">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 bg-white px-3 py-2 text-xs">
              <span className="min-w-0 truncate font-semibold text-stone-700">{f.filename}</span>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-stone-400">{Math.round(f.size_bytes / 1024)}KB</span>
                <button
                  type="button"
                  className="rounded p-0.5 text-stone-400 hover:bg-stone-100 hover:text-accent-red disabled:opacity-50"
                  onClick={() => void handleDelete(f.id)}
                  disabled={deletingId === f.id || uploading}
                  aria-label={`حذف ${f.filename}`}
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
      {files.length === 0 && (
        <p className="text-sm text-stone-400">هنوز فایلی آپلود نشده</p>
      )}
    </div>
  );
}