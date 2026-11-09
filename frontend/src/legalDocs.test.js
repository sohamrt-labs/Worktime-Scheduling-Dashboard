// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { PRIVACY, TERMS, UPDATED } from "./legalText.js";

// tests run with the frontend folder as the working directory, so the repository root is one level up
const read = (name) => readFileSync(resolve(process.cwd(), "..", name), "utf8");

test.each([["TERMS_OF_SERVICE.md", TERMS], ["PRIVACY_POLICY.md", PRIVACY]])("%s matches the in-app text (run `npm run legal` if this fails)", (file, sections) => {
  const markdown = read(file);
  expect(markdown).toContain(UPDATED);
  for (const [heading, text] of sections) {
    expect(markdown).toContain(heading);
    expect(markdown).toContain(text);
  }
});
