// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

// Thin fetch wrapper. The login session lives in an httpOnly cookie that page JavaScript can never read,
// so there is no token to store or steal here.
const BUSINESS_KEY = "worktime_business";
const RETURNING_KEY = "worktime_returning"; // this browser has an account, so the login page opens on "Sign in"

export const getBusiness = () => localStorage.getItem(BUSINESS_KEY) || "";
export const setBusiness = (id) => localStorage.setItem(BUSINESS_KEY, id);
export const isReturning = () => localStorage.getItem(RETURNING_KEY) === "1";
const markReturning = () => localStorage.setItem(RETURNING_KEY, "1");

function errorMessage(body, status) {
  const d = body?.detail;
  if (Array.isArray(d)) return d.map((e) => `${e.loc.slice(1).join(".")}: ${e.msg}`).join("; ");
  return d || `Request failed (${status})`;
}

async function request(path, options = {}) {
  // The custom header is our CSRF defence: another website cannot add it to a request to us.
  const headers = { "X-Requested-With": "XMLHttpRequest", ...options.headers };
  if (getBusiness()) headers["X-Business-Id"] = getBusiness(); // every data request is scoped to the business being worked in
  if (options.json) {
    headers["Content-Type"] = "application/json";
    options = { ...options, body: JSON.stringify(options.json) };
  }
  const res = await fetch(`/api${path}`, { ...options, headers });
  if (res.status === 401 && !path.startsWith("/auth/")) window.location.reload(); // session expired
  if (res.status === 204) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(errorMessage(body, res.status));
  return body;
}

export async function login(username, password) {
  await request("/auth/login", { method: "POST", body: new URLSearchParams({ username, password }) });
  markReturning();
}

export async function register(fields) {
  await request("/auth/register", { method: "POST", json: fields });
  markReturning();
}

export async function logout() {
  await request("/auth/logout", { method: "POST" }).catch(() => {});
  localStorage.removeItem(BUSINESS_KEY);
}

const post = (path, json) => request(path, { method: "POST", json });

export const api = {
  list: (resource, filters = {}) => {
    const q = new URLSearchParams(Object.entries(filters).filter(([, v]) => v !== "" && v != null));
    return request(`/${resource}?${q}`);
  },
  create: (resource, json) => post(`/${resource}`, json),
  update: (resource, id, json) => request(`/${resource}/${id}`, { method: "PUT", json }),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: "DELETE" }),
  dashboard: () => request("/dashboard"),
  setRisk: (id, risk_override, risk_note) => request(`/projects/${id}/risk-override`, { method: "PUT", json: { risk_override, risk_note } }),
  businesses: () => request("/businesses"),
  authConfig: () => request("/auth/config"),
  me: () => request("/auth/me"),
  resendVerification: () => post("/auth/resend-verification"),
  verifyEmail: (token) => post("/auth/verify-email", { token }),
  forgotPassword: (email) => post("/auth/forgot-password", { email }),
  resetPassword: (token, new_password) => post("/auth/reset-password", { token, new_password }),
  changePassword: (current_password, new_password) => post("/auth/change-password", { current_password, new_password }),
  deleteAccount: (password) => request("/auth/me", { method: "DELETE", json: { password } }),
  exportData: () => request("/auth/export"),
};
