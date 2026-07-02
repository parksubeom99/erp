"use client";

export function SignOutButton() {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <button type="button" onClick={signOut} style={{ padding: "6px 12px" }}>
      sign out
    </button>
  );
}
