"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { createRole, createUser, fetchRoles, fetchUsers } from "@/lib/api";
import { appAlert } from "@/lib/app-dialog";
import { deptLabel } from "@/lib/utils";
import { LoadingIndicator, LoadingSpinner } from "@/components/loading";

const DEPARTMENTS = [
  { value: "finance", label: "مالی" },
  { value: "hr", label: "منابع انسانی" },
  { value: "support", label: "پشتیبانی" },
  { value: "sales", label: "فروش" },
  { value: "ops", label: "عملیات" },
];

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ["users"], queryFn: fetchUsers });
  const { data: roles = [] } = useQuery({ queryKey: ["roles"], queryFn: fetchRoles });

  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [dept, setDept] = useState<string>("all");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("active");
  const [inviteOpen, setInviteOpen] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteAddress, setInviteAddress] = useState("");
  const [inviteDept, setInviteDept] = useState("finance");
  const [inviteRole, setInviteRole] = useState("");
  const [newRoleName, setNewRoleName] = useState("");
  const [creatingRole, setCreatingRole] = useState(false);

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
        const inPhone = (u.phone ?? "").includes(needle);
        return inName || inEmail || inPhone;
      })
      .slice();
  }, [users, q, role, dept, status]);

  const inviteMutation = useMutation({
    mutationFn: createUser,
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["users"] });
      setInviteOpen(false);
      setInviteEmail("");
      setInviteName("");
      setInvitePhone("");
      setInviteAddress("");
      setNewRoleName("");
      await appAlert({
        title: "کاربر ایجاد شد",
        message: "حساب کاربر با موفقیت ساخته شد. رمز عبور موقت در صورت خالی بودن به‌صورت خودکار تولید شده است.",
      });
    },
    onError: async () => {
      await appAlert({
        title: "خطا",
        message: "ایجاد کاربر ممکن نشد. ایمیل تکراری یا نقش نامعتبر را بررسی کنید.",
        tone: "danger",
      });
    },
  });

  async function handleCreateRole() {
    const name = newRoleName.trim();
    if (!name) return;
    setCreatingRole(true);
    try {
      const created = await createRole({ name });
      await qc.invalidateQueries({ queryKey: ["roles"] });
      setInviteRole(created.name);
      setNewRoleName("");
      await appAlert({ title: "نقش ایجاد شد", message: `نقش «${created.name}» اضافه شد.` });
    } catch {
      await appAlert({
        title: "خطا",
        message: "ایجاد نقش ممکن نشد — احتمالاً نام تکراری است.",
        tone: "danger",
      });
    } finally {
      setCreatingRole(false);
    }
  }

  function exportCsv() {
    const rows = filteredUsers.map((u) => ({
      name: u.full_name ?? "",
      email: u.email ?? "",
      phone: u.phone ?? "",
      department: deptLabel(u.department),
      roles: (u.roles?.map((r) => r.name) ?? []).join(", "),
      status: u.is_active ? "active" : "inactive",
    }));
    const header = Object.keys(
      rows[0] ?? { name: "", email: "", phone: "", department: "", roles: "", status: "" }
    );
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
    <div className="page-padding space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-stone-900">کاربران و دسترسی‌ها</h1>
          <p className="mt-1 text-sm text-stone-500">
            {users.length.toLocaleString("fa-IR")} کاربر ·{" "}
            {roles.length.toLocaleString("fa-IR")} نقش
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportCsv} title="دانلود فهرست کاربران به‌صورت فایل CSV">
            <Download className="h-4 w-4" />
            دانلود لیست کاربران
          </Button>
          <Button onClick={() => setInviteOpen(true)} data-ma-guide="users-invite">
            <Plus className="h-4 w-4" />
            دعوت کاربر
          </Button>
        </div>
      </div>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="جست‌وجو در نام، ایمیل، تلفن…"
              className="pr-9"
            />
          </div>
          <select
            value={dept}
            onChange={(e) => setDept(e.target.value)}
            className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
          >
            <option value="all">همه: دپارتمان</option>
            {DEPARTMENTS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
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

      <Card data-ma-guide="users-table">
        <CardHeader>
          <h3 className="font-bold">کاربران</h3>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-stone-50 text-right text-xs text-stone-400">
              <tr>
                <th className="px-4 py-3 font-semibold">کاربر</th>
                <th className="px-4 py-3 font-semibold">تلفن</th>
                <th className="px-4 py-3 font-semibold">دپارتمان</th>
                <th className="px-4 py-3 font-semibold">نقش</th>
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
                const roleNames = u.roles?.map((r) => r.name) ?? [];
                return (
                  <tr key={u.id} className="border-b border-stone-100">
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
                    <td className="px-4 py-3 text-stone-600">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3 text-stone-600">{deptLabel(u.department)}</td>
                    <td className="px-4 py-3 text-stone-600">
                      {roleNames.length ? roleNames.join("، ") : u.is_superuser ? "admin" : "—"}
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

      {inviteOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setInviteOpen(false)} />
          <div className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[min(520px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-stone-900">دعوت کاربر</h3>
            <p className="mt-1 text-sm text-stone-500">اطلاعات کاربر جدید را وارد کنید.</p>
            <div className="mt-4 space-y-3">
              <Input
                placeholder="نام و نام خانوادگی"
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
              />
              <Input
                type="email"
                placeholder="ایمیل سازمانی"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
              <Input
                placeholder="شماره تلفن"
                value={invitePhone}
                onChange={(e) => setInvitePhone(e.target.value)}
              />
              <Textarea
                rows={2}
                placeholder="آدرس (اختیاری)"
                value={inviteAddress}
                onChange={(e) => setInviteAddress(e.target.value)}
              />
              <select
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                value={inviteDept}
                onChange={(e) => setInviteDept(e.target.value)}
              >
                {DEPARTMENTS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
              <select
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm"
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                <option value="">بدون نقش</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-2">
                <Input
                  placeholder="نقش جدید…"
                  value={newRoleName}
                  onChange={(e) => setNewRoleName(e.target.value)}
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={creatingRole || !newRoleName.trim()}
                  onClick={() => void handleCreateRole()}
                >
                  {creatingRole ? <LoadingSpinner /> : "ایجاد نقش"}
                </Button>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setInviteOpen(false)}>
                بستن
              </Button>
              <Button
                disabled={inviteMutation.isPending || !inviteEmail.trim() || !inviteName.trim()}
                onClick={() =>
                  inviteMutation.mutate({
                    email: inviteEmail.trim(),
                    full_name: inviteName.trim(),
                    phone: invitePhone.trim() || undefined,
                    address: inviteAddress.trim() || undefined,
                    department: inviteDept,
                    role_name: inviteRole || undefined,
                  })
                }
              >
                {inviteMutation.isPending ? <LoadingSpinner /> : "ایجاد کاربر"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}