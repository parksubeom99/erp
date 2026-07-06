/**
 * E2E smoke (handoff §STEP 6): login → tree → module permission, end to end
 * against a running server. Assumes `pnpm db:seed` has been run.
 *
 *   BASE_URL=http://localhost:3000 node scripts/smoke.mjs
 *
 * Exits non-zero on any failure.
 */
const BASE = process.env.BASE_URL || "http://localhost:3000";
let failures = 0;
function check(name, ok, detail = "") {
  if (ok) console.log(`  PASS  ${name}`);
  else {
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
    failures++;
  }
}
function cookieFrom(res) {
  const sc = res.headers.get("set-cookie");
  const m = sc && sc.match(/edim_session=([^;]+)/);
  return m ? `edim_session=${m[1]}` : null;
}
async function login(email, tenantSlug) {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, tenantSlug }),
  });
  return { status: res.status, cookie: cookieFrom(res) };
}
const text = (path, cookie) =>
  fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }).then((r) => r.text());
const status = (path, cookie) =>
  fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }).then((r) => r.status);
const postStatus = (path, body, cookie) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  }).then((r) => r.status);

// Deterministic seeded project (see prisma/seed.ts IDS).
const PROJECT_ID = "c0000000-0000-4000-8000-000000000001";

async function main() {
  // unauthenticated redirect --------------------------------------------------
  const home0 = await fetch(`${BASE}/`, { redirect: "manual" });
  check("unauthenticated / redirects to login", home0.status === 307 || home0.status === 302, `status=${home0.status}`);

  // owner -------------------------------------------------------------------
  const o = await login("owner@acme.test");
  check("owner login sets session", o.status === 200 && !!o.cookie);
  const oHome = await text("/", o.cookie);
  check("owner sees the 3-panel shell", oHome.includes(">hierarchy<") && oHome.includes(">inspector<"));
  check("owner sees live tree data", oHome.includes("EDIM Set-up"));
  check("owner menu includes Finance + CPQ", oHome.includes("/m/finance") && oHome.includes("/m/cpq"));
  check("owner hierarchy API 200", (await status("/api/hierarchy", o.cookie)) === 200);
  check("owner can open finance module (200)", (await status("/api/modules/finance", o.cookie)) === 200);

  // L3 Project: owner sees seeded project + can drive it -----------------------
  check("owner sees seeded project in tree", oHome.includes("PS-61313-5"));
  check("owner menu includes Project", oHome.includes("/m/project"));
  check("owner can change sales stage (200)", (await postStatus(`/api/projects/${PROJECT_ID}/stage`, { stage: "협의" }, o.cookie)) === 200);
  check("owner can add a task (200)", (await postStatus(`/api/projects/${PROJECT_ID}/tasks`, { title: "smoke task" }, o.cookie)) === 200);

  // viewer ------------------------------------------------------------------
  const v = await login("viewer@acme.test");
  check("viewer login sets session", v.status === 200 && !!v.cookie);
  const vHome = await text("/", v.cookie);
  check("viewer menu excludes Finance/CPQ/HR", !vHome.includes("/m/finance") && !vHome.includes("/m/cpq") && !vHome.includes("/m/hr"));
  check("viewer menu keeps Toolbox/Company", vHome.includes("/m/toolbox") && vHome.includes("/m/company"));
  check("viewer BLOCKED from finance route (403)", (await status("/api/modules/finance", v.cookie)) === 403);
  check("viewer allowed on toolbox route (200)", (await status("/api/modules/toolbox", v.cookie)) === 200);

  // L3 Project RBAC: viewer is read-only ---------------------------------------
  check("viewer sees Project module (read)", vHome.includes("/m/project"));
  check("viewer BLOCKED from stage change (403)", (await postStatus(`/api/projects/${PROJECT_ID}/stage`, { stage: "협의" }, v.cookie)) === 403);
  check("viewer BLOCKED from deciding approval (403)", (await postStatus(`/api/project-approvals/${PROJECT_ID}`, { decision: "approved" }, v.cookie)) === 403);

  // cross-tenant ------------------------------------------------------------
  const x = await login("owner@acme.test", "globex");
  check("cross-tenant login rejected (401)", x.status === 401);

  console.log("");
  if (failures > 0) {
    console.error(`E2E SMOKE: FAIL (${failures})`);
    process.exit(1);
  }
  console.log("E2E SMOKE: PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
