# V1 — Extraction pass (payroll, attendance, leave) + Renla rename

This is the V1 milestone from the commercialisation roadmap: pull the highest-value business logic out of `App.jsx` into standalone, tested modules — with **zero behaviour change** — and finish the app's rebrand to Renla. Business logic behaviour is unchanged throughout except for the one deliberate fix noted below; what moved is where the code lives and what it's called.

**Note on the visual design:** a full redesign matched to the landing page's indigo/paper/Fraunces identity was tried in between and then reverted — after seeing it rendered, the original palette and type (the ones still in this version) were preferred. Nothing about that experiment remains in this build.

## What changed

- **`src/features/payroll/payrollEngine.js`** — the PAYE engine, moved out verbatim: the NTA 2025 tax bands, `computePayslip`, `payeAnnual`, rent relief, pension, loan-shortfall protection, and the working-days calendar helper. Nothing in here was rewritten, only relocated.
- **`src/features/attendance/attendanceLogic.js`** — the shift/lateness/overtime time math, moved out verbatim: `crossesMidnight`, `minutesBetween`, `shiftFor`, `lateMinutesAgainst`, `overtimeMinutes`, `shiftMins` (see the Rota fix below), and the per-employee check-override logic. This is specifically the logic the blueprint calls out as tested against the night-shift bug (a 20:00–04:00 shift used to compute as -16 hours).
- **`src/features/leave/leaveLogic.js`** — the two-stage manager-then-HR leave approval chain, pulled out as pure functions: `nextLeaveStatus` (what should the new status be), `shouldDecrementBalance` (should this specific action touch a balance), `decrementLeaveBalance`, and `validateLeaveDates`. `App.jsx`'s `applyLeave`/`decideLeave` still own the actual state update (they're closures over React state and can't move wholesale) but now call these pure functions instead of duplicating the decision logic inline.
- **`src/App.jsx`** — same file, same behaviour (except the Rota fix below), now importing from all three feature modules instead of defining this logic inline. Also renamed throughout: loading screen, sidebar/brand text, backup filename, payslip label, and explanatory copy all say "Renla."
- **Old-product references scrubbed** — this deployment is a fresh company/database with no continuity to preserve, so `DEVICE_KEY` (the localStorage key used for device registration) has been renamed to `"renla:device:v1"`, and a couple of leftover comments referencing the old product name were reworded. The `cp-` CSS class prefix throughout the app was left alone — it's an internal, non-visible abbreviation (not spelled out anywhere), and renaming every class across every page is a large, purely cosmetic change with no user-facing or functional benefit, so it wasn't touched unless you'd specifically like it changed too.
- **`src/lib/supabase.js`, `src/lib/sync.js`** — untouched, copied as-is.

## Tests added

41 tests, all passing (`npm test`):

- `payrollEngine.test.js` (11) — the six NTA 2025 tax bands verified at their boundaries, plus a full `computePayslip` run checked by hand (gross → PAYE → pension → net), plus the loan-repayment-never-goes-negative rule.
- `attendanceLogic.test.js` (15) — the exact night-shift scenarios the blueprint describes by hand (20:00–04:00 = 8 hours; someone clocking in at 00:10 against a 20:00 start is correctly 235 minutes late after grace), the "arriving early earns no overtime" rule, and the `shiftMins` night-shift fix below.
- `leaveLogic.test.js` (15) — the manager→HR chain (manager approval moves it to `pending_hr`, not straight to `approved`; HR can close it out at either stage), balance decrement (once only, floored at zero, untouched for untracked leave types), and date validation.

Run them with:

```
npm install
npm test
```

## Rota night-shift bug — found in the last pass, fixed in this one

`shiftMins` (used by the Rota page to total scheduled hours) did a plain `end - start` with no midnight-wrap handling — unlike `minutesBetween`, which is used for actual clock-in/out and already was midnight-safe. A night shift entered on the Rota totalled as **0 hours instead of 8**. Fixed by having `shiftMins` delegate to `minutesBetween` (same one-line change flagged as an option last time). Verified three ways: the updated unit test now asserts 480 minutes instead of documenting the old 0; the esbuild bundle check passes; and a live Playwright render of the Rota page with a real 20:00–04:00 shift on it shows "Hours scheduled: 8h" and "8h" against the employee's row, not "0h" or a blank dash.

## A real bug I shipped in the first version of this, and how it was caught

The batch of files sent earlier had a genuine regression: `personalOutMinutes`, `excusedLateDatesFor`, and `excursionDatesFor` (used by the Dashboard's monthly insights and by Payroll's pay-run building) were physically extracted into `payrollEngine.js` correctly — the logic wasn't lost — but I forgot to add them to that file's `export` list and to App.jsx's import. The result: `App.jsx` crashed as soon as it tried to render the Dashboard, with `ReferenceError: excusedLateDatesFor is not defined`.

Neither the passing test suite nor the earlier esbuild bundle check caught this, because both only verify that the code you point them at is internally correct — they don't exercise a genuine end-to-end render of the whole app the way a person opening the page would. The only thing that catches "this function silently isn't wired up" is actually running the app. So after sending the first version, I set up a throwaway local preview (a mock Supabase module with sample data, standing in for a real login/database — not part of the app, not shipped) and rendered `App.jsx` itself, completely unmodified, in a real browser. That's what surfaced the crash. Fixed by adding the three missing names to the export/import lines — nothing else changed. Re-verified: tests still pass, and the Dashboard, Employees, Attendance, and Payroll pages all render correctly now (screenshots attached alongside this).

One cosmetic thing visible in the screenshots that is **not** a real bug: the ₦ symbol looks slightly off on the Dashboard's "Cost of absence" tile. That's this sandbox failing to fetch the app's Google Fonts (no outbound access to fonts.googleapis.com here) and falling back to a system font — it's an artifact of this specific preview environment, not something wrong with the app or the extraction.

## Page-component split — `App.jsx` went from 4,484 lines to 781

The other big remaining V1 item: `App.jsx` held every page (Dashboard, Employees, Attendance, Rota, Leave, News, Documents, Settings, Payroll — about 45 components in total counting sub-components like `EmployeeForm` and `Payslip`), plus every shared helper, all in one file. That's now split into 22 files, organised by what they actually are:

- **`src/theme.js`** — the `LIGHT`/`DARK` color tokens.
- **`src/lib/`** — `device.js` (local device identity), `format.js` (date/currency/string formatting), `geo.js` (GPS/distance helpers), `presence.js` (mid-shift check logic), `payrollHelpers.js` (month/YTD helpers), `sampleData.js` (an unused demo-data generator that was already dead code — moved as-is, not deleted, so nothing about its reachability changed).
- **`src/features/insights/monthInsights.js`** — the "what did this month actually cost" calculation (late arrivals, absence cost, overtime, most-punctual ranking) that the Dashboard and branch comparisons run on. This is business logic in the same spirit as the payroll/attendance/leave modules, just newly identified during this pass.
- **`src/components/`** — `ui.jsx` (the shared primitives every page uses: `Card`, `Btn`, `Badge`, `Modal`, etc.), `ErrorBoundary.jsx`, `StyleTag.jsx` (the global CSS).
- **`src/pages/`** — one file per page area: `AuthPages.jsx`, `DashboardPage.jsx`, `EmployeesPage.jsx`, `LeavePage.jsx`, `NewsPage.jsx`, `DocsPage.jsx`, `SettingsPage.jsx`, `AttendancePage.jsx`, `RotaPage.jsx`, `PayrollPage.jsx`, `SoonPage.jsx`.

**Why this was lower-risk than it sounds:** every page component in the original file was already a plain function taking props — `function RotaPage({ db, isHR, ... })` — not a closure over `App()`'s internal state the way `applyLeave`/`decideLeave` used to be. That meant this was a mechanical move-and-rewire job (find each component's exact line range, work out what it references, write the right imports), not a rewrite. I did the extraction with a script rather than by hand specifically to avoid the kind of transcription slip that caused the `excusedLateDatesFor` bug earlier in this file — cutting and pasting exact line ranges can't introduce a typo the way retyping can.

**One real bug this did catch, and how:** the automated import-wiring got one thing wrong — `ytdFor` (used by Payroll to compute year-to-date payslip figures) physically landed in `lib/payrollHelpers.js`, but `PayrollPage.jsx`'s export line still listed it as its own. The esbuild bundle check caught this immediately (`"ytdFor" is not declared in this file"`) before it ever reached a browser — a case where the bundle check *did* catch a real error, unlike the earlier `ReferenceError` incident where it couldn't. Fixed by importing `ytdFor` into `PayrollPage.jsx` from its real location instead of re-declaring it. Re-verified: bundle check clean, all 41 tests still pass.

**Full-app verification:** rather than trust the mechanical process alone, I live-rendered every single page in the app afterward — Dashboard, Employees (including opening a profile drawer), Attendance, Rota, Leave, Company news, Documents, Payroll (including building a pay run and opening a payslip), Settings (the largest page in the app, ~500 lines), and the sign-in screen — with console-error capture on. Zero errors anywhere, and the Rota night-shift fix still shows the correct 8h.

## URL-based routing (React Router) — the last V1 item

Navigation used to be pure in-memory state (`view === "dashboard" ? ... : ...`), so refreshing the page or sharing a link always landed back on the dashboard regardless of where you actually were. That's fixed now with `react-router-dom` (`^7.18.2`, confirmed compatible with React 19 — the only new runtime dependency added in this pass).

**What changed in `App.jsx`:** `App()` is now a thin wrapper —

```jsx
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
```

— with every line that used to be in `App()` moved as-is into a new `AppShell()` function. This split was necessary because `useNavigate()`/`useLocation()` only work inside a component that renders *underneath* `BrowserRouter`, not in the same component that creates it. Inside `AppShell`, the old `const [view, setView] = useState("dashboard")` became `const view = location.pathname.split("/")[1] || "dashboard"`, and the old `go(k)` (`setView(k)`) now calls `navigate("/" + k)`. The big ternary chain that picked which page to render was replaced one-for-one with a `<Routes>` block — same components, same props, one `<Route>` per page plus a catch-all that redirects unknown paths to `/dashboard`. Nothing about what any page renders or receives as props changed.

**Verified live** (Playwright, served over a real `http://` static server rather than `file://` — see note below): clicking each nav item updates the URL (`/dashboard`, `/rota`, `/payroll`, …); browser Back and Forward move correctly between them; and critically, **reloading the page while on `/payroll` stays on `/payroll`** instead of bouncing to the dashboard (screenshot attached). A direct deep-link to `/rota`, as if it were a bookmarked or shared URL, loads straight into the Rota page. An unknown path (`/some-bogus-route`) redirects to `/dashboard` as intended. Console was clean throughout except the same pre-existing Google Fonts fetch failures noted elsewhere in this doc (no outbound internet in this sandbox — not a routing issue).

One thing worth knowing about how this was tested: React Router's client-side navigation relies on `history.pushState`, which real browsers restrict under the `file://` protocol (each `file://` document is treated as its own unique origin, so Chromium refuses to push a new path and instead attempts a real page load, which fails). That's a property of `file://` testing, not of the app — once served over `http://` like a real deployment, every check above passed cleanly. A tiny local static server (`preview/spa-server.mjs`, not part of the app) was added purely so this could be tested honestly; it serves the same live-preview HTML for any path, the same way Vercel's SPA rewrite will in production.

**Nothing to configure on Vercel-side beyond the SPA rewrite it already does for a single-page app** — this is a client-side-only router, no new server routes.

## How to apply this to the real repo

Drop the entire `src/` folder (all of `App.jsx`, `src/lib`, `src/features`, `src/components`, `src/pages`) into the real repo's `src/`, add `react-router-dom` to `package.json` dependencies, then let Vercel rebuild. This is still a plain Vite/React build — one new runtime dependency, no new build steps. `vitest` remains dev-only.

## What's next in V1

Payroll, attendance, leave, the Renla rename, the page-component split, and URL routing are all done — **V1 is complete.** The roadmap moves to V1.5 hardening next (pagination/date-windowing for `loadWorkspace`, real selfie storage deletion, server-side IP capture) — not started, pending direction.
