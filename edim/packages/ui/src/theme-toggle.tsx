"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

/**
 * Inline script (run before paint, no FOUC / hydration flash) that resolves the
 * initial theme from localStorage then prefers-color-scheme, and sets
 * data-theme on <html>. Rendered once in the document head.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem('edim-theme');if(!t){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}document.documentElement.dataset.theme=t;}catch(e){}})();`;

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current =
      (document.documentElement.dataset.theme as Theme) || "light";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("edim-theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title="toggle theme"
      style={{
        fontFamily: "var(--font-body)",
        fontSize: "var(--fs-13)",
        color: "var(--ink-muted)",
        background: "transparent",
        border: "1px solid var(--line)",
        borderRadius: "var(--radius-sm)",
        padding: "4px 8px",
        cursor: "pointer",
      }}
    >
      {theme === "dark" ? "◑ dark" : "◐ light"}
    </button>
  );
}
