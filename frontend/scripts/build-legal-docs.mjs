// Copyright 2026 Soham Raut
// SPDX-License-Identifier: Apache-2.0

// Writes TERMS_OF_SERVICE.md and PRIVACY_POLICY.md at the repository root from src/legalText.js,
// so the app pages and the repository documents can never disagree.  Run:  npm run legal
import { writeFileSync } from "node:fs";
import { PRIVACY, TERMS, UPDATED } from "../src/legalText.js";

const NOTE = `> **Read this first.** This is the template that ships with the open-source Work-Time software; the app shows the same text at \`/%PAGE%\`.
> The software contains **no analytics** and **sends nothing to its author**. **Whoever runs a copy is the operator** and is responsible for these texts:
> edit \`frontend/src/legalText.js\`, set \`CONTACT_EMAIL\`, run \`npm run legal\` in \`frontend\`, and have the result reviewed for your country and business.
> Templates are not legal advice. The software itself is licensed under the Apache License 2.0 (see \`LICENSE\`).`;

const doc = (title, page, sections) =>
  `# ${title}\n\n_Last updated ${UPDATED}_\n\n${NOTE.replace("%PAGE%", page)}\n\n` +
  sections.map(([head, text]) => `## ${head}\n\n${text}\n`).join("\n") +
  "\n## Contact\n\nContact the operator of this service, using the address shown in the app.\n";

writeFileSync(new URL("../../TERMS_OF_SERVICE.md", import.meta.url), doc("Terms of Service", "terms", TERMS));
writeFileSync(new URL("../../PRIVACY_POLICY.md", import.meta.url), doc("Privacy Policy", "privacy", PRIVACY));
console.log("Wrote TERMS_OF_SERVICE.md and PRIVACY_POLICY.md");
