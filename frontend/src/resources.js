// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

// One config object drives the table, filters, detail view and form for every CRUD page.
// type: text | textarea | number | date | datetime | select | ref (dropdown filled from another resource)
// The FIRST option of a select is its default. `columns` = what the table shows; the form and detail row show all fields.
// UI words are business-neutral; the API paths keep their technical names (/sites = locations, /machines = equipment).
const req = { required: true };
const PRIORITY = ["medium", "low", "high"];

export const RESOURCES = {
  sites: {
    label: "Locations",
    deleteWarning: "Deleting a location also deletes ALL its projects, work items, meetings and equipment.",
    columns: ["name", "location", "site_manager", "status"],
    fields: [
      { name: "name", label: "Name", type: "text", ...req },
      { name: "location", label: "Address", type: "text", ...req },
      { name: "site_manager", label: "Manager", type: "text" },
      { name: "contact_phone", label: "Contact phone", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["active", "inactive"], ...req },
    ],
  },
  projects: {
    label: "Projects",
    dateField: "start_date",
    deleteWarning: "Deleting a project also deletes all its work items and meetings.",
    columns: ["name", "site_id", "client_name", "priority", "end_date", "budget", "status"],
    fields: [
      { name: "site_id", label: "Location", type: "ref", ref: "sites", ...req },
      { name: "name", label: "Name", type: "text", ...req },
      { name: "client_name", label: "Client or customer", type: "text" },
      { name: "project_type", label: "Category", type: "select", options: ["operations", "technology", "marketing", "expansion", "other"] },
      { name: "priority", label: "Priority", type: "select", options: PRIORITY },
      { name: "start_date", label: "Start date", type: "date", ...req },
      { name: "end_date", label: "End date", type: "date", ...req },
      { name: "budget", label: "Budget (INR)", type: "number", min: 1, money: true, ...req },
      { name: "status", label: "Status", type: "select", options: ["active", "planned", "completed"], ...req },
      { name: "workers_male", default: 0, label: "Male team members", type: "number", min: 0, ...req },
      { name: "workers_female", default: 0, label: "Female team members", type: "number", min: 0, ...req },
      { name: "risk_override", label: "Delay risk (your own rating)", type: "select", options: ["Low", "Medium", "High"], nullable: true },
      { name: "risk_note", label: "Why this rating? (note)", type: "text" },
      { name: "description", label: "Description", type: "textarea" },
    ],
  },
  "work-items": {
    label: "Work items",
    dateField: "due_date",
    quickStatus: true,
    columns: ["title", "project_id", "due_date", "priority", "status", "assigned_to"],
    fields: [
      { name: "project_id", label: "Project", type: "ref", ref: "projects", ...req },
      { name: "title", label: "Title", type: "text", ...req },
      { name: "due_date", label: "Due date", type: "date", ...req },
      { name: "priority", label: "Priority", type: "select", options: PRIORITY },
      { name: "status", label: "Status", type: "select", options: ["todo", "in_progress", "done"], ...req },
      { name: "assigned_to", label: "Assigned to", type: "text", ...req },
      { name: "estimated_cost", label: "Estimated cost", type: "number", min: 0, money: true, ...req },
      { name: "actual_cost", default: 0, label: "Actual cost", type: "number", min: 0, money: true, ...req },
    ],
  },
  meetings: {
    label: "Meetings",
    dateField: "datetime",
    columns: ["title", "project_id", "datetime", "location"],
    fields: [
      { name: "project_id", label: "Project", type: "ref", ref: "projects", ...req },
      { name: "title", label: "Title", type: "text", ...req },
      { name: "datetime", label: "Date and time", type: "datetime", ...req },
      { name: "location", label: "Venue", type: "text" },
      { name: "attendees", label: "Attendees", type: "text" },
      { name: "notes", label: "Notes", type: "textarea" },
    ],
  },
  machines: {
    label: "Equipment",
    quickStatus: true,
    columns: ["name", "type", "site_id", "operator", "hours_used", "status"],
    fields: [
      { name: "name", label: "Name", type: "text", ...req },
      { name: "type", label: "Type", type: "text", ...req },
      { name: "site_id", label: "Location", type: "ref", ref: "sites", ...req },
      { name: "operator", label: "Assigned to", type: "text" },
      { name: "status", label: "Status", type: "select", options: ["idle", "in_use", "maintenance"], ...req },
      { name: "hours_used", default: 0, label: "Hours used", type: "number", min: 0, ...req },
      { name: "last_service_date", label: "Last service date", type: "date" },
    ],
  },
  businesses: {
    label: "Businesses",
    noScope: true, // these are the user's workspaces, not data inside one
    deleteWarning: "Deleting a business permanently deletes ALL its locations, projects, work items, meetings and equipment.",
    columns: ["name", "industry"],
    fields: [
      { name: "name", label: "Business name", type: "text", ...req },
      { name: "industry", label: "Industry", type: "text" },
    ],
  },
};
