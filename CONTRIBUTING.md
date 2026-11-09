# Contributing to Work-Time

Thank you for helping to improve Work-Time! Bug reports, fixes, documentation and ideas are all welcome.

## Quick start
```bash
# backend
cd backend && python -m venv venv && source venv/bin/activate      # Windows: venv\Scripts\Activate.ps1
pip install -r requirements-dev.txt
cp ../.env.example ../.env     # set SECRET_KEY (16+ characters) and ADMIN_PASSWORD
python seed.py && python -m uvicorn app.main:app --reload

# frontend (second terminal)
cd frontend && npm install && npm run dev
```
The README has the full setup, including Windows notes and Docker.

## Making a change
1. For anything big, open an issue first so we can agree on the approach.
2. Fork the repository and create a branch from `main`.
3. Keep the change focused, and add or update tests. A bug fix needs a test that fails without the fix.
4. Before you push, run:
   - backend: `ruff check .` and `pytest` (in `backend`)
   - frontend: `npm test` and `npm run build` (in `frontend`)
   - if you edited `frontend/src/legalText.js`: `npm run legal`
5. Sign off your commits to certify the [Developer Certificate of Origin](https://developercertificate.org): `git commit -s -m "Your message"`.
6. Open a pull request and fill in the template.

## Licensing and credit
- **Your contribution is licensed under the Apache License 2.0** (section 5), the same licence as the project.
- **You keep authorship of your own work.** It is recorded permanently in the Git history and on GitHub's contributors page, and that history is never rewritten.
- **The original author, Soham Raut, is credited** in `NOTICE`, in the header of every source file, in the README and in the app footer. Pull requests that remove or alter these notices will not be accepted.
- **Every source file needs the two-line header.** Copy it from any file (`# Copyright 2026 Soham Raut` and `# SPDX-License-Identifier: Apache-2.0`, using `//` in JavaScript). For a substantial new file you may add your own line below, for example `# Copyright 2027 Your Name`. A test checks that the header is present.

## What will not be merged
- Secrets, personal data or `.env` files.
- Analytics, tracking, or anything that sends user data to a third party.
- Changes that weaken security (see `SECURITY.md`).
- Removal or alteration of the credit and licence notices.

## Behaviour and security
Please follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately, as described in [SECURITY.md](SECURITY.md), not in public issues.
