"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { fetchAgentPermissions, fetchRoles, fetchUsers } from "@/lib/api";
import { deptLabel } from "@/lib/utils";

export default function UsersPage() {
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });
  const { data: permissions = [] } = useQuery({
    queryKey: ["agent-permissions"],
    queryFn: fetchAgentPermissions,
  });

  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [dept, setDept] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const filteredUsers = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users
      .filter((u) => {
        if (status === "active" && !u.is_active) return false;
        if (status === "inactive" && u.is_active) return false;
        if (dept !== "all" && (u.department ?? "") !== dept) return false;
        if (role !== "all") {
          const roleNames = u.roles?.map((r) => r.name) ?? [];
          if (!roleNames.includes(role)) return false;
        }
        if (!needle) return true;
        const inName = (u.full_name ?? "").toLowerCase().includes(needle);
        const inEmail = (u.email ?? "").toLowerCase().includes(needle);
        return inName || inEmail;
      })
      .slice();
  }, [users, q, role, dept, status]);

  const selectedUser = useMemo(() => {
    if (selectedId) return filteredUsers.find((u) => u.id === selectedId) ?? null;
    return filteredUsers[0] ?? null;
  }, [filteredUsers, selectedId]);

  const selectedPermissions = useMemo(() => {
    if (!selectedUser) return [];
    return permissions.filter((p) => p.user_id === selectedUser.id);
  }, [permissions, selectedUser]);

  function exportCsv() {
    const rows = filteredUsers.map((u) => ({
      name: u.full_name ?? "",
      email: u.email ?? "",
      department: deptLabel(u.department),
      roles: (u.roles?.map((r) => r.name) ?? []).join(", "),
      status: u.is_active ? "active" : "inactive",
      mfa: u.mfa_enabled ? "yes" : "no",
    }));
    const header = Object.keys(rows[0] ?? { name: "", email: "", department: "", roles: "", status: "", mfa: "" });
    const csv = [
      header.join(","),
      ...rows.map((r) => header.map((k) => JSON.stringify((r as Record<string, string>)[k] ?? "")).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">کاربران و دسترسی‌ها</h1>
          <p className="text-stone-500">نقش‌ها، دسترسی per-agent و سیاست‌های امنیتی</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" />
            صادرات CSV
          </Button>
          <Button onClick={() => setInviteOpen(true)}>
            <Plus className="h-4 w-4" />
            دعوت کاربر
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
          {users.length} کاربران
        </span>
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
          ۸ گروه‌ها
        </span>
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
          {roles.length} نقش‌ها
        </span>
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
          ۳ درخواست دسترسی
        </span>
        <span className="rounded-full bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-700">
          سیاست‌ها
        </span>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجو در نام، ایمیل، نقش…"
              className="pr-9"
            />
          </div>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">همه: دپارتمان</option>
            <option value="finance">مالی</option>
            <option value="hr">منابع انسانی</option>
            <option value="support">پشتیبانی</option>
            <option value="sales">فروش</option>
            <option value="ops">عملیات</option>
          </select>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">همه: نقش</option>
            {roles.map((r) => (
              <option key={r.id} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <div className="inline-flex rounded-full border border-stone-200 bg-white p-1 text-xs font-semibold">
            {[
              { v: "active" as const, t: "فعال" },
              { v: "inactive" as const, t: "غیرفعال" },
              { v: "all" as const, t: "همه" },
            ].map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setStatus(o.v)}
                className={
                  "rounded-full px-3 py-1.5 transition " +
                  (status === o.v ? "bg-brand-600 text-white" : "text-stone-600 hover:bg-brand-50 hover:text-brand-800")
                }
              >
                {o.t}
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-stone-500">{filteredUsers.length} کاربر</span>
        </CardBody>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <h3 className="font-bold">کاربران</h3>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="border-b bg-stone-50 text-right text-xs text-stone-400">
                <tr>
                  <th className="px-4 py-3 font-semibold">کاربر</th>
                  <th className="px-4 py-3 font-semibold">دپارتمان</th>
                  <th className="px-4 py-3 font-semibold">نقش</th>
                  <th className="px-4 py-3 font-semibold">یادداشت</th>
                  <th className="px-4 py-3 font-semibold">وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-stone-400">
                      در حال بارگذاری…
                    </td>
                  </tr>
                )}
                {filteredUsers.map((u) => {
                  const active = selectedUser?.id === u.id;
                  const roleNames = u.roles?.map((r) => r.name) ?? [];
                  const access = permissions.filter((p) => p.user_id === u.id);
                  const accessPreview =
                    access.length > 0
                      ? access
                          .slice(0, 2)
                          .map((p) => p.agent_name)
                          .join("، ") + (access.length > 2 ? ` +${access.length - 2}` : "")
                      : "—";
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelectedId(u.id)}
                      className={
                        "cursor-pointer border-b border-stone-100 transition hover:bg-brand-50/40 " +
                        (active ? "bg-brand-50/60" : "")
                      }
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                            {u.full_name?.charAt(0) ?? "؟"}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-stone-800">{u.full_name ?? "—"}</p>
                            <p className="truncate text-xs text-stone-500">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-stone-600">{deptLabel(u.department)}</td>
                      <td className="px-4 py-3 text-stone-600">
                        {roleNames.length ? roleNames.join("، ") : u.is_superuser ? "admin" : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block max-w-[12rem] truncate rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                          {accessPreview}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={u.is_active ? "success" : "muted"}>
                          {u.is_active ? "فعال" : "غیرفعال"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>

        <Card className="h-fit lg:sticky lg:top-6">
          <CardHeader>
            <h3 className="font-bold">جزئیات کاربر</h3>
          </CardHeader>
          <CardBody className="space-y-4 text-sm">
            {!selectedUser && <p className="text-stone-400">کاربری انتخاب نشده</p>}
            {selectedUser && (
              <>
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-bold text-white shadow-glow">
                    {selectedUser.full_name?.charAt(0) ?? "؟"}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-bold text-stone-900">{selectedUser.full_name ?? "—"}</p>
                    <p className="truncate text-xs text-stone-500">{selectedUser.email}</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant={selectedUser.is_active ? "success" : "muted"}>
                        {selectedUser.is_active ? "فعال" : "غیرفعال"}
                      </Badge>
                      <Badge variant={selectedUser.mfa_enabled ? "success" : "muted"}>
                        {selectedUser.mfa_enabled ? "MFA فعال" : "MFA خاموش"}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-stone-400">دسترسی به ایجنت‌ها</p>
                  <div className="mt-2 space-y-2">
                    {selectedPermissions.slice(0, 8).map((p) => (
                      <div
                        key={`${p.user_id}-${p.agent_id}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-stone-100 px-3 py-2"
                      >
                        <span className="min-w-0 truncate text-stone-700">{p.agent_name}</span>
                        <div className="flex shrink-0 gap-2 text-xs">
                          <span className={p.can_invoke ? "text-accent-green" : "text-stone-400"}>اجرا</span>
                          <span className={p.can_configure ? "text-accent-green" : "text-stone-400"}>
                            پیکربندی
                          </span>
                        </div>
                      </div>
                    ))}
                    {selectedPermissions.length === 0 && (
                      <p className="text-xs text-stone-400">دسترسی‌ای ثبت نشده</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-stone-400">سیاست‌های اعمالی</p>
                  <ul className="mt-2 space-y-1 text-xs text-stone-600">
                    <li>● فقط در ساعت کاری (۸–۱۸)</li>
                    <li>● MFA الزامی برای ادمین</li>
                    <li>● سقف ۸۴۰K توکن / ماه</li>
                  </ul>
                </div>
              </>
            )}
          </CardBody>
        </Card>
      </div>

      {inviteOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setInviteOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">دعوت کاربر</h3>
            <p className="mt-1 text-sm text-stone-500">
              در این نسخه، دعوت ایمیلی به‌صورت نمایشی است (API ایجاد کاربر در مرحله بعدی افزوده می‌شود).
            </p>
            <div className="mt-4 space-y-3">
              <Input placeholder="ایمیل سازمانی" />
              <select className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
                <option>نقش پیش‌فرض</option>
                {roles.map((r) => (
                  <option key={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                بستن
              </Button>
              <Button onClick={() => setInviteOpen(false)}>ارسال دعوت</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
