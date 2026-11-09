// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import App from "./App.jsx";

// Full user journey against a REAL running backend (seeded with `python seed.py`). Skipped unless E2E_API is set:
//   E2E_API=http://127.0.0.1:8000 E2E_USER=admin E2E_PASS=<your password> npm test
const API = process.env.E2E_API;

describe.skipIf(!API)("end to end (real backend)", () => {
  beforeAll(() => {
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    const realFetch = globalThis.fetch;
    let cookie = ""; // Node has no cookie jar, so keep the httpOnly session cookie by hand, as a browser would
    vi.stubGlobal("fetch", async (url, opts = {}) => {
      // jsdom's URLSearchParams is not accepted by Node's fetch, so send form bodies as plain strings.
      if (opts.body?.constructor?.name === "URLSearchParams")
        opts = { ...opts, body: opts.body.toString(), headers: { ...opts.headers, "Content-Type": "application/x-www-form-urlencoded" } };
      if (cookie) opts = { ...opts, headers: { ...opts.headers, Cookie: cookie } };
      const res = await realFetch(`${API}${url}`, opts);
      for (const c of res.headers.getSetCookie()) cookie = /Max-Age=0/i.test(c) ? "" : c.split(";")[0];
      return res;
    });
  });
  afterEach(cleanup);

  test("login, browse every page, create / edit / delete a record, sign out", async () => {
    localStorage.clear();
    localStorage.setItem("worktime_returning", "1"); // a returning user sees the sign-in form
    render(<App />);
    await screen.findByLabelText("Username"); // the app first asks the server whether a session exists
    const type = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
    const signIn = () => fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    // wrong password is rejected with a clear message, then the right one works
    type("Username", process.env.E2E_USER || "admin");
    type("Password", "definitely-wrong");
    signIn();
    expect((await screen.findByRole("alert")).textContent).toMatch(/incorrect/i);
    type("Password", process.env.E2E_PASS);
    signIn();
    expect(await screen.findByText("Overview", {}, { timeout: 20000 })).toBeTruthy();
    expect(await screen.findByText("Team members (M / F)")).toBeTruthy();

    // every page loads real seeded data
    for (const tab of ["Locations", "Projects", "Work items", "Meetings", "Equipment", "Businesses"]) {
      fireEvent.click(screen.getByRole("button", { name: tab }));
      expect(await screen.findByRole("heading", { name: new RegExp(tab) })).toBeTruthy();
      await waitFor(() => expect(screen.queryByText(/No records match/)).toBeNull(), { timeout: 10000 });
    }

    // create -> edit -> delete a location
    fireEvent.click(screen.getByRole("button", { name: "Locations" }));
    await screen.findByRole("heading", { name: /Locations/ });
    fireEvent.click(screen.getByRole("button", { name: /Add new/ }));
    type(/^Name/, "E2E Test Site");
    type(/^Address/, "Testville");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const created = await screen.findByText("E2E Test Site", {}, { timeout: 8000 });
    fireEvent.click(within(created.closest("tr")).getByText("Edit"));
    type(/^Name/, "E2E Renamed");
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const renamed = await screen.findByText("E2E Renamed");
    fireEvent.click(within(renamed.closest("tr")).getByText("Delete"));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Delete" })); // the in-app confirmation
    await waitFor(() => expect(screen.queryByText("E2E Renamed")).toBeNull(), { timeout: 10000 });

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(await screen.findByRole("button", { name: "Sign in" })).toBeTruthy();
  }, 90000);
});
