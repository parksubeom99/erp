"use client";

import { useState } from "react";

/**
 * Minimal dev login. Posts to /api/auth/login; on success reloads into the
 * protected app shell. Styling is deliberately plain — the design system lands
 * in STEP 4.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("owner@acme.test");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setBusy(false);
    if (res.ok) {
      window.location.href = "/";
    } else {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "login failed");
    }
  }

  return (
    <main
      style={{ maxWidth: 360, margin: "12vh auto", fontFamily: "system-ui" }}
    >
      <h1 style={{ marginBottom: 4 }}>EDIM</h1>
      <p style={{ color: "#5B6675", marginTop: 0 }}>sign in (dev)</p>
      <form onSubmit={submit}>
        <label style={{ display: "block", fontSize: 13 }}>
          email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ width: "100%", padding: 8, marginTop: 4 }}
            autoComplete="username"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          style={{ marginTop: 12, padding: "8px 16px" }}
        >
          {busy ? "…" : "sign in"}
        </button>
      </form>
      {error && <p style={{ color: "#B45309" }}>{error}</p>}
      <p style={{ color: "#5B6675", fontSize: 12, marginTop: 24 }}>
        seeded: owner@acme.test, viewer@acme.test, owner@globex.test
      </p>
    </main>
  );
}
