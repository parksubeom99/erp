import { describe, expect, it } from "vitest";
import { APPROVER_ROLES, canApprove, canReject, canTransition } from "../src/index";
import type { MacroStatus } from "../src/index";

describe("canApprove — verified gate + RBAC", () => {
  it("owner may approve a verified macro", () => {
    expect(canApprove({ verified: true }, "owner")).toEqual({ ok: true });
  });
  it("engineer may approve a verified macro", () => {
    expect(canApprove({ verified: true }, "engineer")).toEqual({ ok: true });
  });
  it("an unverified macro is refused even for owner", () => {
    const r = canApprove({ verified: false }, "owner");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("not verified");
  });
  it("a non-approver role is refused even when verified", () => {
    for (const role of ["viewer", "sales", "cad"]) {
      const r = canApprove({ verified: true }, role);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toContain(role);
    }
  });
  it("APPROVER_ROLES is exactly owner + engineer", () => {
    expect([...APPROVER_ROLES].sort()).toEqual(["engineer", "owner"]);
  });
});

describe("canReject — RBAC only", () => {
  it("owner and engineer may reject", () => {
    expect(canReject("owner").ok).toBe(true);
    expect(canReject("engineer").ok).toBe(true);
  });
  it("viewer may not reject", () => {
    expect(canReject("viewer").ok).toBe(false);
  });
});

describe("canTransition — state machine", () => {
  const legal: [MacroStatus, MacroStatus][] = [
    ["draft", "approved"],
    ["draft", "rejected"],
    ["approved", "superseded"],
  ];
  const illegal: [MacroStatus, MacroStatus][] = [
    ["draft", "superseded"],
    ["approved", "draft"],
    ["approved", "rejected"],
    ["superseded", "approved"],
    ["rejected", "approved"],
  ];
  it.each(legal)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });
  it.each(illegal)("forbids %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});
