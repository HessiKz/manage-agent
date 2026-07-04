"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fieldsToSchema,
  keyFromLabel,
  schemaToFields,
  type ActionInputField,
} from "@/lib/action-inputs";
import { formatPersianYearMonthNumeric } from "@/lib/persian-date";

type Props = {
  schema: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
};

function emptyField(used: Set<string>): ActionInputField {
  return {
    key: `input_${used.size + 1}`,
    label: "",
    type: "string",
    defaultValue: "",
  };
}

export function ActionInputsEditor({ schema, onChange }: Props) {
  const fields = schemaToFields(schema);
  const periodPlaceholder = `مثلاً ${formatPersianYearMonthNumeric()}`;

  function updateFields(next: ActionInputField[]) {
    onChange(fieldsToSchema(next));
  }

  function patchField(index: number, patch: Partial<ActionInputField>) {
    const next = [...fields];
    next[index] = { ...next[index], ...patch };
    if (patch.label !== undefined) {
      const used = new Set(next.filter((_, i) => i !== index).map((f) => f.key));
      next[index].key = keyFromLabel(patch.label || next[index].label, used);
    }
    updateFields(next);
  }

  return (
    <div className="space-y-2 rounded-xl border border-stone-100 bg-stone-50/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-stone-800">ورودی از کاربر (اختیاری)</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-stone-500">
            اگر لازم است قبل از اجرا چیزی بپرسید — مثل «دوره» یا «سال». نیازی به کد یا انگلیسی نیست.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          className="!px-2 !py-1 text-[11px]"
          onClick={() => {
            const used = new Set(fields.map((f) => f.key));
            updateFields([...fields, emptyField(used)]);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          ورودی
        </Button>
      </div>

      {fields.length === 0 && (
        <p className="text-center text-[11px] text-stone-400">بدون ورودی — دکمه بلافاصله اجرا می‌شود.</p>
      )}

      {fields.map((field, idx) => (
        <div
          key={`${field.key}-${idx}`}
          className="grid gap-2 rounded-lg border border-stone-200 bg-white p-2 sm:grid-cols-[1fr_1fr_auto]"
        >
          <div>
            <label className="mb-1 block text-[10px] font-medium text-stone-500">عنوان سوال</label>
            <Input
              placeholder="مثلاً دوره"
              value={field.label}
              onChange={(e) => patchField(idx, { label: e.target.value })}
              className="text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium text-stone-500">مقدار پیش‌فرض</label>
            <Input
              placeholder={periodPlaceholder}
              value={field.defaultValue ?? ""}
              onChange={(e) => patchField(idx, { defaultValue: e.target.value })}
              className="text-sm"
            />
          </div>
          <div className="flex items-end gap-1">
            <select
              className="h-10 flex-1 rounded-xl border border-stone-200 bg-white px-2 text-xs"
              value={field.type}
              onChange={(e) =>
                patchField(idx, {
                  type: e.target.value as ActionInputField["type"],
                })
              }
            >
              <option value="string">متن</option>
              <option value="integer">عدد</option>
            </select>
            <button
              type="button"
              className="rounded-lg p-2 text-stone-400 hover:bg-stone-100 hover:text-accent-red"
              onClick={() => updateFields(fields.filter((_, i) => i !== idx))}
              aria-label="حذف ورودی"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
