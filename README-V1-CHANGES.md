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

## Real logo + favicon (post-V1 polish)

The app previously used a generic `Sparkles` icon (from `lucide-react`) as a stand-in brand mark, and had no favicon at all. Both are now the real Renla logo:

- **`src/assets/renla-logo-white.png`, `src/assets/renla-logo-green.png`** — the two logo files as supplied (white-on-transparent for dark backgrounds, green-on-transparent for light ones). Only the white version is currently used in the app, because both places the mark appears (`.cp-brand-mark` in the sidebar, `.cp-login-mark` on the auth screens) already render on a solid brand-green square — same idiom as the old sparkles icon, just the real mark instead.
- **`src/App.jsx`, `src/pages/AuthPages.jsx`** — the `<Sparkles size={..} />` icon in the sidebar brand and both login-page brand marks (`NotConfigured` and `AuthShell`) replaced with `<img src={renlaLogoWhite} .../>`. The unused `Sparkles` import was removed from both files.
- **`public/favicon-16.png`, `favicon-32.png`, `apple-touch-icon.png`, `favicon-512.png`** — generated from the source logo (padded to a square canvas, transparent background preserved) at the standard sizes. `index.html` now links the 16/32px favicons and the Apple touch icon, and the page title was updated to `Renla — Attendance, payroll and leave`.
- **`preview/build-artifact.mjs`** — this is review tooling only (not part of the real app), but it needed a one-line fix to keep working: it esbuild-bundles `App.jsx` directly, and had no loader configured for `.png` imports, so it would have failed to build once `App.jsx` started importing the logo file. Added `".png": "dataurl"` to the esbuild loader map so image imports inline as base64 in the single-file preview, same as everything else in that artifact.

No changes to `theme.js` or `StyleTag.jsx` — the app's color tokens, fonts (Bricolage Grotesque / Hanken Grotesk / JetBrains Mono) and card/pill/button styling were already the source the renla.app landing page was built to match, so the two were already visually consistent. The logo was the one real gap, and it's now wired into both places the brand mark appears, plus the browser tab/bookmark icon.

## Forgot-password reset, and per-employee per-day working hours

Two features requested directly: a self-serve password reset, and the option to set different working hours for each day of the week per employee (instead of one shift pattern covering every day).

### Forgot-password reset

- **`src/lib/supabase.js`** — added `requestPasswordReset(email)` (calls Supabase's `resetPasswordForEmail`, redirecting back to whatever origin the app is running on) and `updatePassword(newPassword)` (calls `updateUser({ password })`, used once a recovery session is active). `onAuthChange` now also passes through the auth event name, not just the session, so the app can tell a password-recovery sign-in apart from a normal one.
- **`src/pages/AuthPages.jsx`** — the sign-in screen gained a "Forgot password?" link and a new `forgot` mode (email in, reset link out, with its own "check your inbox" confirmation state). A new `ResetPasswordScreen` component (new password + confirm, reusing the same "at least 6 characters"/mismatch validation) is exported for use once a recovery link is opened.
- **`src/App.jsx`** — a new `recovery` state flips on when `onAuthChange` reports a `PASSWORD_RECOVERY` event (which is what fires when someone opens the link from the reset email — Supabase treats it as a real sign-in). While `recovery` is true, `ResetPasswordScreen` renders in place of the normal app, so a password-reset link can't accidentally drop someone straight into the dashboard using their old password's session.
- **Deployment step required:** the domain the app is actually served from (e.g. `app.renla.app`) needs to be added to Supabase → Authentication → URL Configuration → **Redirect URLs**, the same setting that had to be fixed for email confirmation earlier in this project. Without it, the reset email's link will fail to come back to the app correctly.

### Per-employee, per-day working hours

Previously an employee had exactly one shift pattern (`shiftId`), applied to every day they worked. Now HR can instead set specific start/end times for each day of the week, or mark a day off, per employee — the old single-pattern behaviour is still there and remains the default.

- **`src/features/attendance/attendanceLogic.js`** — added `dayKeyFor(dateStr)` (parsed as a local date, so it can't drift a day depending on timezone) and rewrote `shiftFor(work, emp, dateStr)` to take an optional date. Resolution order: (1) if the employee has a `weekSchedule` and a date was given, use that day's hours, or treat it as a day off, or fall through if that day was left unset; (2) their assigned shift pattern; (3) the company default working day. Calling `shiftFor` without a date — every existing call site that hasn't been updated — behaves exactly as before.
- **`src/features/insights/monthInsights.js`, `src/App.jsx` (`buildLine`)** — both used to compute one shift per employee and reuse it across every attendance record in a month. Both now also compute a per-record `shiftFor(work, emp, a.date)` for the actual lateness/overtime math, so someone with a per-day schedule is measured against each day's own hours, not one shift applied uniformly. The dateless `shift` is still used for the aggregate daily/hourly-rate math, which needs one representative shift length rather than a per-day one.
- **`src/pages/EmployeesPage.jsx`** — the employee edit form's old single "Shift pattern" field moved into a new "Working hours" section with two tabs: **One shift, every day** (the original dropdown) and **Set hours per day** (a Mon–Sun row editor — a day-off checkbox, or start/end time pickers). Switching to "One shift, every day" and saving clears any previously-set `weekSchedule` back to `null`.
- **`src/lib/supabase.js`, `src/lib/sync.js`, `src/lib/payrollHelpers.js`** — the new `weekSchedule` field (stored as `week_schedule` in the database) added to the employee read mapping, write mapping, and the blank-employee default, following the same pattern every other employee field already uses.
- **`catch-up-migration-2.sql`** (new file) — adds the `week_schedule jsonb` column to `employees`. Safe to run whether or not `catch-up-migration.sql` has already been run; only adds the column if it isn't already there.

Verified with the full test suite (`npm test` — still 41/41 passing, `attendanceLogic.test.js`'s existing `shiftFor` assertions unaffected since they don't pass a date), a real `npm run build`, and a rendered preview of the Employees edit form with a sample employee given a per-day schedule (weekdays 9–5, a short Saturday, Sunday off) — the tab defaults to "One shift, every day" for anyone without a `weekSchedule`, and switches to "Set hours per day" with the right values pre-filled for someone who has one.

## Working hours, take two — company → branch → employee hierarchy

The first version of per-day hours above only worked one employee at a time, which doesn't fit a common real case: most of a company (or a whole branch) shares the exact same pattern — e.g. Mon–Fri 9am–5pm, Saturday 10am–4pm, Sunday off — and re-typing that per person doesn't scale. This adds three levels, each one optional to override:

1. **Company** (`Settings → Working hours`) — can now be either the original single "office opens/closes" time, or its own Mon–Sun schedule (the `Different hours per day` tab). Any day left blank in the per-day view falls back to the office opens/closes fields.
2. **Branch** (`Settings → Branches`, new clock icon on each branch row) — each branch can follow the company's hours (the default) or have its own Mon–Sun schedule, same editor.
3. **Employee** (`Employees → edit → Working hours`) — now four tabs instead of two:
   - **Standard hours** — follows the company's working hours directly, ignoring branch. Right for most full-time/part-time staff.
   - **Branch hours** — follows whichever branch they're assigned to (which itself is either following the company or has its own hours). Right for staff whose hours are set at branch level.
   - **Custom hours** — their own individual per-day schedule, unchanged from the first version above. Right for the genuine one-off exception.
   - **Shift pattern** — the original single start/end applied every day, via the shift-pattern dropdown. Right for shift workers, night workers, and contract staff where "which day" doesn't matter, only "which shift."

So a company that's Mon–Fri 9–5 + Sat 10–4 for almost everyone sets that once at the company level, and every employee on "Standard hours" (the natural default for most staff) just follows it — nothing to fill in per person. Someone on nights still uses "Shift pattern" with a Night shift pattern, unaffected by any of this.

- **`src/features/attendance/attendanceLogic.js`** — `shiftFor(work, emp, dateStr, branches)` gained a fourth argument and now resolves through `emp.scheduleMode` ("standard" | "branch" | "custom" | "pattern", defaulting to "custom" if the employee already has a `weekSchedule` from before this existed, else "pattern" — so nobody's hours silently change from this update). Extracted `resolveWeekDay`/`dayOffShift`/`dayShift`/`patternShift` as small internal helpers so the four modes share the same day-lookup logic instead of duplicating it. 11 new unit tests cover every mode and every fallback (`attendanceLogic.test.js`).
- **`src/components/WeekScheduleEditor.jsx`** (new file) — the Mon–Sun row editor, extracted out of the Employees form so the company, branch, and employee editors all use the exact same component instead of three copies that could drift apart.
- **`src/pages/SettingsPage.jsx`** — "Working hours" section gained the same-every-day/different-per-day tabs; "Branches" section gained a clock-icon button per branch that opens an inline hours editor (use company hours, or set the branch's own).
- **`src/pages/EmployeesPage.jsx`** — the Working hours section is now the four tabs described above instead of two.
- **`src/lib/supabase.js`, `src/lib/sync.js`** — branches now read/write `weekSchedule`/`week_schedule` and `useCompanySchedule`/`use_company_schedule`; employees now read/write `scheduleMode`/`schedule_mode`.
- **`src/lib/payrollHelpers.js`** — `emptyEmployee()` defaults new employees to `scheduleMode: "pattern"` (unchanged behaviour — same as every employee before this existed).
- **`catch-up-migration-3.sql`** (new file) — adds `week_schedule` and `use_company_schedule` to `branches`, and `schedule_mode` to `employees`. Safe regardless of which earlier migrations have run.

Verified: 52/52 tests passing (11 new), a real `npm run build`, and rendered previews of all three levels — the company's per-day editor, a branch's own-hours editor with a sample Mon–Fri 8–6 + Sat 9–2 + Sun-off pattern, and an employee's "Branch hours" tab correctly reporting which branch and whether it's following the company or not.

**Deployment note:** run `catch-up-migration-3.sql` (in addition to `catch-up-migration-2.sql` if that one hasn't been run yet either) before uploading this version's code — it adds the new columns this depends on.
