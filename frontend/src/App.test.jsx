// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App.jsx";
import { login } from "./api/client";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import RiskBadge from "./components/RiskBadge.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import ResourcePage from "./pages/ResourcePage.jsx";

globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
const reply = (body, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

const ME = { username: "admin", email: "admin@x.io", email_verified: true, verification_required: false };
const BUSINESSES = [{ id: 1, name: "Acme Foods", industry: "" }, { id: 2, name: "Bolt Logistics", industry: "" }];
const EMPTY = { summary: { active_projects: 0, items_due_this_week: 0, meetings_today: 0, overdue_items: 0, total_actual_cost: 0, total_budget: 0 }, projects: [], upcoming: [], equipment: [], workforce: [] };
const FULL = {
  summary: { active_projects: 4, items_due_this_week: 5, meetings_today: 2, overdue_items: 3, total_workers: 60, workers_male: 45, workers_female: 15, total_actual_cost: 4_000_000, total_budget: 19_100_000 },
  projects: [{ id: 1, name: "Depot", status: "active", budget: 1e7, actual_cost: 5e6, completion_pct: 50, workers_male: 30, workers_female: 10, manual_risk: null, risk_note: "",
    risk: { probability: 0.7, level: "High", causes: [{ factor: "overdue_count", text: "Overdue: 3 work item(s) past due", impact: 1.2 }, { factor: "completion", text: "Completion: 50% of work items done", impact: -0.4 }] } }],
  upcoming: [], equipment: [{ site: "Pune", in_use: 1, idle: 2, maintenance: 0 }], workforce: [{ site: "Pune", male: 30, female: 10 }],
};

// A fake backend: routes by path; a `null` route answers 401 (not signed in).
function backend(overrides = {}) {
  const routes = { "/auth/config": { signup_enabled: true, invite_required: false, contact_email: "help@x.io" }, "/auth/me": ME, "/businesses": BUSINESSES, "/dashboard": EMPTY, ...overrides };
  const fn = vi.fn((url) => {
    const hit = routes[String(url).replace(/^\/api/, "").split("?")[0]];
    return hit === undefined ? reply({}) : hit === null ? reply({ detail: "Not signed in" }, 401) : hit.__status ? reply({ detail: hit.detail }, hit.__status) : reply(hit);
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}
const called = (fn, part, method) => fn.mock.calls.find(([u, o]) => String(u).includes(part) && (!method || o?.method === method));
const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

// ---------- first visit, returning visit, sign-up policy
test("a first-time visitor lands on registration", async () => {
  backend({ "/auth/me": null });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Create your account" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Create account" }).disabled).toBe(true);
});

test("a returning visitor lands on sign in", async () => {
  localStorage.setItem("worktime_returning", "1");
  backend({ "/auth/me": null });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
});

test("registration needs the terms ticked and sends email and consent", async () => {
  const fetchMock = backend({ "/auth/me": null, "/auth/register": { access_token: "x" } });
  render(<App />);
  await screen.findByRole("heading", { name: "Create your account" });
  type("Username", "maya"); type("Email address", "maya@x.io"); type("Password", "password123"); type("Business name", "Maya Bakery");
  expect(screen.getByRole("button", { name: "Create account" }).disabled).toBe(true); // terms not ticked yet
  fireEvent.click(screen.getByLabelText(/I agree to the/));
  fireEvent.click(screen.getByRole("button", { name: "Create account" }));
  await waitFor(() => expect(called(fetchMock, "/auth/register")).toBeTruthy());
  const [, options] = called(fetchMock, "/auth/register");
  expect(JSON.parse(options.body)).toMatchObject({ username: "maya", email: "maya@x.io", business_name: "Maya Bakery", accepted_terms: true });
  expect(options.headers["X-Requested-With"]).toBe("XMLHttpRequest");
  await waitFor(() => expect(localStorage.getItem("worktime_returning")).toBe("1"));
});

test("sign-up is hidden when the server disables it", async () => {
  backend({ "/auth/me": null, "/auth/config": { signup_enabled: false, invite_required: false } });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Welcome back" })).toBeTruthy();
  expect(screen.queryByText("Create an account")).toBeNull();
});

test("an invite code field appears when the server requires one", async () => {
  backend({ "/auth/me": null, "/auth/config": { signup_enabled: true, invite_required: true } });
  render(<App />);
  expect(await screen.findByLabelText("Invite code")).toBeTruthy();
});

test("forgot password sends the email address and shows the confirmation", async () => {
  localStorage.setItem("worktime_returning", "1");
  const fetchMock = backend({ "/auth/me": null, "/auth/forgot-password": { message: "If an account exists, a reset link is on its way." } });
  render(<App />);
  fireEvent.click(await screen.findByText("Forgot your password?"));
  expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeTruthy();
  type("Email address", "maya@x.io");
  fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));
  expect(await screen.findByText(/reset link is on its way/)).toBeTruthy();
  expect(JSON.parse(called(fetchMock, "/auth/forgot-password")[1].body)).toEqual({ email: "maya@x.io" });
});

test("login keeps no token in browser storage", async () => {
  const fetchMock = backend({ "/auth/login": { access_token: "secret" } });
  await login("admin", "pw");
  expect(Object.keys(localStorage).some((k) => k.toLowerCase().includes("token"))).toBe(false);
  expect(JSON.stringify({ ...localStorage })).not.toContain("secret");
  expect(localStorage.getItem("worktime_returning")).toBe("1");
  expect(called(fetchMock, "/auth/login")[1].headers["X-Requested-With"]).toBe("XMLHttpRequest");
});

// ---------- inside the app
test("the business switcher lists every business and scopes requests to the chosen one", async () => {
  const fetchMock = backend();
  render(<App />);
  const select = await screen.findByLabelText("Business");
  expect(within(select).getByText("Bolt Logistics")).toBeTruthy();
  fireEvent.change(select, { target: { value: "2" } });
  await waitFor(() => expect(fetchMock.mock.calls.some(([u, o]) => String(u).includes("/dashboard") && o.headers["X-Business-Id"] === "2")).toBe(true));
  expect(localStorage.getItem("worktime_business")).toBe("2");
});

test("sign out is its own button, clears the session on the server and returns to login", async () => {
  const fetchMock = backend();
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await screen.findByLabelText("Username");
  expect(called(fetchMock, "/auth/logout", "POST")).toBeTruthy();
});

test("unconfirmed users see a check-your-email screen instead of the app", async () => {
  const fetchMock = backend({ "/auth/me": { ...ME, email_verified: false, verification_required: true }, "/auth/resend-verification": { message: "Confirmation email sent." } });
  render(<App />);
  expect(await screen.findByText("Check your email")).toBeTruthy();
  fireEvent.click(screen.getByText("Resend the email"));
  expect(await screen.findByText("Confirmation email sent.")).toBeTruthy();
  expect(called(fetchMock, "/dashboard")).toBeFalsy();
});

test("deleting an account asks for confirmation inside the app, not in a browser pop-up", async () => {
  const fetchMock = backend();
  const nativeConfirm = vi.fn(() => true);
  window.confirm = nativeConfirm;
  render(<App />);
  fireEvent.click(await screen.findByText("👤 admin"));
  await screen.findByText("Your account");
  type("Confirm with your password", "pw");
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Delete your account?")).toBeTruthy();
  expect(called(fetchMock, "/auth/me", "DELETE")).toBeFalsy(); // nothing happens until the user confirms
  fireEvent.click(within(dialog).getByRole("button", { name: "Yes, delete everything" }));
  await waitFor(() => expect(called(fetchMock, "/auth/me", "DELETE")).toBeTruthy());
  expect(JSON.parse(called(fetchMock, "/auth/me", "DELETE")[1].body)).toEqual({ password: "pw" });
  expect(nativeConfirm).not.toHaveBeenCalled();
});

test("cancelling the confirmation keeps the account", async () => {
  const fetchMock = backend();
  render(<App />);
  fireEvent.click(await screen.findByText("👤 admin"));
  await screen.findByText("Your account");
  type("Confirm with your password", "pw");
  fireEvent.click(screen.getByRole("button", { name: "Delete my account" }));
  fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Cancel" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(called(fetchMock, "/auth/me", "DELETE")).toBeFalsy();
});

test("deleting a record shows the in-app confirmation with the cascade warning", async () => {
  const fetchMock = backend({ "/sites": [{ id: 1, name: "Alpha Yard", location: "Pune", site_manager: "", contact_phone: "", status: "active" }], "/projects": [] });
  render(<ResourcePage resource="sites" />);
  fireEvent.click(await screen.findByText("Delete"));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/ALL its projects/)).toBeTruthy();
  fireEvent.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(called(fetchMock, "/sites/1", "DELETE")).toBeTruthy());
});

test("the forgot-password link sits under the password box and also appears after a failed sign-in", async () => {
  localStorage.setItem("worktime_returning", "1");
  backend({ "/auth/me": null, "/auth/login": { __status: 401, detail: "Incorrect username or password" } });
  render(<App />);
  expect(await screen.findByText("Forgot your password?")).toBeTruthy();
  type("Username", "admin"); type("Password", "wrong");
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  fireEvent.click(within(await screen.findByRole("alert")).getByText("Forgot your password?"));
  expect(await screen.findByRole("heading", { name: "Reset your password" })).toBeTruthy();
});

test("the reset screen warns when the server cannot send email", async () => {
  localStorage.setItem("worktime_returning", "1");
  backend({ "/auth/me": null, "/auth/config": { signup_enabled: true, invite_required: false, email_enabled: false } });
  render(<App />);
  fireEvent.click(await screen.findByText("Forgot your password?"));
  expect(await screen.findByText(/Email sending is not set up/)).toBeTruthy();
});

// ---------- public pages and emailed links
test("the Terms of Service page is public and discloses the synthetic-data model", async () => {
  window.history.pushState({}, "", "/terms");
  backend({ "/auth/me": null });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Terms of Service" })).toBeTruthy();
  expect(screen.getByText(/synthetic/)).toBeTruthy();
  expect((await screen.findByText("help@x.io")).getAttribute("href")).toBe("mailto:help@x.io");
});

test("the Privacy Policy page is public", async () => {
  window.history.pushState({}, "", "/privacy");
  backend({ "/auth/me": null });
  render(<App />);
  expect(await screen.findByRole("heading", { name: "Privacy Policy" })).toBeTruthy();
});

test("the emailed confirmation link confirms the address", async () => {
  window.history.pushState({}, "", "/?verify=tok123");
  const fetchMock = backend({ "/auth/verify-email": { message: "Email confirmed. Thank you!" } });
  render(<App />);
  expect(await screen.findByText("Email confirmed. Thank you!")).toBeTruthy();
  expect(JSON.parse(called(fetchMock, "/auth/verify-email")[1].body)).toEqual({ token: "tok123" });
});

test("the emailed reset link lets the user choose a new password", async () => {
  window.history.pushState({}, "", "/?reset=tok456");
  const fetchMock = backend({ "/auth/reset-password": { message: "Password updated. You can now sign in." } });
  render(<App />);
  type("New password", "brandnew123");
  type("Repeat new password", "brandnew123");
  fireEvent.click(screen.getByRole("button", { name: "Save new password" }));
  expect(await screen.findByText("Password updated. You can now sign in.")).toBeTruthy();
  expect(JSON.parse(called(fetchMock, "/auth/reset-password")[1].body)).toEqual({ token: "tok456", new_password: "brandnew123" });
});

// ---------- components and pages
test("risk badge shows level and probability, or 'manual'", () => {
  render(<RiskBadge risk={{ level: "High", probability: 0.71 }} />);
  expect(screen.getByText("High (71%)")).toBeTruthy();
  render(<RiskBadge risk={{ level: "Low" }} manual />);
  expect(screen.getByText("Low · manual")).toBeTruthy();
});

test("the form blocks saving when required fields are empty", async () => {
  const fetchMock = backend({ "/sites": [], "/projects": [] });
  render(<ResourcePage resource="sites" />);
  fireEvent.click(screen.getByRole("button", { name: /Add new/ }));
  fireEvent.click(screen.getByText("Save"));
  expect((await screen.findAllByText("Required")).length).toBe(2); // name + address (status has a default)
  expect(called(fetchMock, "/sites", "POST")).toBeFalsy();
});

test("the search box filters rows and never alters ordinary text", async () => {
  const site = (id, name) => ({ id, name, location: "Pune", site_manager: "A", contact_phone: "1", status: "active" });
  backend({ "/sites": [site(1, "Alpha Yard"), site(2, "Beta Yard"), site(3, "Tower Yard")], "/projects": [] });
  render(<ResourcePage resource="sites" />);
  expect((await screen.findAllByText("Beta Yard")).length).toBeGreaterThan(0);
  expect(screen.getByText("Tower Yard")).toBeTruthy(); // regression: a capital T in a name must not be altered
  fireEvent.change(screen.getByLabelText("Search"), { target: { value: "alpha" } });
  expect(screen.queryByText("Beta Yard")).toBeNull();
  expect(screen.getByText("Alpha Yard")).toBeTruthy();
});

test("the dashboard shows cards, team, risk and the synthetic-data notice", async () => {
  backend({ "/dashboard": FULL });
  render(<Dashboard />);
  expect(await screen.findByText("High (70%)")).toBeTruthy();
  expect(screen.getByText("₹40.00 Lkh / ₹1.91 Cr")).toBeTruthy();
  expect(screen.getByText("60 (45 / 15)")).toBeTruthy();
  expect(screen.getByText("Overdue work items")).toBeTruthy();
  expect(screen.getByText("Nothing scheduled in the next 7 days.")).toBeTruthy();
  expect(screen.getByText(/1 in use · 2 idle/)).toBeTruthy();
  expect(screen.getByText(/synthetic data/)).toBeTruthy();
});

test("the budget chart switches between crore and lakh", async () => {
  backend({ "/dashboard": FULL });
  render(<Dashboard />);
  expect(await screen.findByText("Budget vs actual cost (in ₹ Cr)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Lakh (Lkh)" }));
  expect(screen.getByText("Budget vs actual cost (in ₹ Lkh)")).toBeTruthy();
});

test("a risk row explains the main cause and saves a manual rating", async () => {
  const fetchMock = backend({ "/dashboard": FULL, "/projects/1/risk-override": { ok: true } });
  render(<Dashboard />);
  fireEvent.click(await screen.findByText("Depot"));
  expect(screen.getByText(/Main cause:/)).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Your risk rating"), { target: { value: "Low" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Saved");
  const [, options] = called(fetchMock, "/risk-override");
  expect(options.method).toBe("PUT");
  expect(JSON.parse(options.body).risk_override).toBe("Low");
});

test("a crashing page shows a friendly fallback instead of a blank screen", () => {
  const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
  const Boom = () => { throw new Error("boom"); };
  render(<ErrorBoundary><Boom /></ErrorBoundary>);
  expect(screen.getByText("Something went wrong")).toBeTruthy();
  quiet.mockRestore();
});

test("small amounts get the rupee unit so the budget chart is not empty", async () => {
  backend({ "/dashboard": { ...FULL, projects: [{ ...FULL.projects[0], budget: 4344, actual_cost: 0 }] } });
  render(<Dashboard />);
  expect(await screen.findByText("Budget vs actual cost (in ₹)")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Lakh (Lkh)" }));
  expect(screen.getByText("Budget vs actual cost (in ₹ Lkh)")).toBeTruthy();
});

test("a project with no work items says so instead of just showing 0% and High", async () => {
  backend({ "/dashboard": { ...FULL, projects: [{ ...FULL.projects[0], completion_pct: 0, work_item_count: 0 }] } });
  render(<Dashboard />);
  expect(await screen.findByText("(no work items)")).toBeTruthy();
  fireEvent.click(screen.getByText("Depot"));
  expect(screen.getByText(/no work items yet/)).toBeTruthy();
});

test("an empty list invites you to add the first record, and date filters are labelled", async () => {
  backend({ "/work-items": [], "/projects": [], "/sites": [] });
  render(<ResourcePage resource="work-items" />);
  expect(await screen.findByText(/Nothing here yet/)).toBeTruthy();
  expect(screen.getByText("From date")).toBeTruthy();
  expect(screen.getByText("To date")).toBeTruthy();
});

test("team-member fields start at 0 in a new project", async () => {
  backend({ "/projects": [], "/sites": [] });
  render(<ResourcePage resource="projects" />);
  fireEvent.click(await screen.findByRole("button", { name: /Add new/ }));
  expect(screen.getByLabelText(/Male team members/).value).toBe("0");
  expect(screen.getByLabelText(/Female team members/).value).toBe("0");
});

test("an unconfirmed user can ask for the confirmation email again from Account", async () => {
  const fetchMock = backend({ "/auth/me": { ...ME, email_verified: false }, "/auth/resend-verification": { message: "Confirmation email sent." } });
  render(<App />);
  fireEvent.click(await screen.findByText("👤 admin"));
  fireEvent.click(await screen.findByText("Send confirmation email"));
  expect(await screen.findByText("Confirmation email sent.")).toBeTruthy();
  expect(called(fetchMock, "/auth/resend-verification", "POST")).toBeTruthy();
});

test("the author's credit and licence are shown on the sign-in page and inside the app", async () => {
  localStorage.setItem("worktime_returning", "1");
  backend({ "/auth/me": null });
  const first = render(<App />);
  expect(await screen.findByText(/© 2026 Soham Raut/)).toBeTruthy();
  first.unmount();
  backend();
  render(<App />);
  expect(await screen.findByText("© 2026 Soham Raut · Open source under the Apache License 2.0")).toBeTruthy();
});

test("the Terms explain what the open-source licence covers", async () => {
  window.history.pushState({}, "", "/terms");
  backend({ "/auth/me": null });
  render(<App />);
  expect(await screen.findByText(/Apache License 2.0/)).toBeTruthy();
});
