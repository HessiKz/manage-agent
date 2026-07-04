import { describe, expect, it } from "vitest";

/** Mirrors sidebar.tsx isActive — /admin must not match /admin/knowledge */
function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
  return pathname === href || pathname.startsWith(href + "/");
}

describe("sidebar isActive", () => {
  it("matches /admin exactly for overview", () => {
    expect(isActive("/admin", "/admin")).toBe(true);
    expect(isActive("/admin/", "/admin")).toBe(true);
    expect(isActive("/admin/knowledge", "/admin")).toBe(false);
    expect(isActive("/admin/agents", "/admin")).toBe(false);
  });

  it("matches nested admin routes for their href", () => {
    expect(isActive("/admin/knowledge", "/admin/knowledge")).toBe(true);
    expect(isActive("/admin/knowledge/foo", "/admin/knowledge")).toBe(true);
  });
});
