# Deploying to the public internet

The production stack is `Caddy (automatic HTTPS) -> nginx (static files) -> FastAPI -> PostgreSQL`. Only Caddy is reachable from the internet; the API and the database are on a private Docker network.

## What you need
- A Linux server (VPS) with 1 GB RAM or more, for example Ubuntu 24.04
- A domain name where you can add a DNS record

## 1. Point your domain at the server
Create an **A record** for e.g. `app.yourdomain.com` pointing to the server's public IP. Wait until `ping app.yourdomain.com` shows that IP.

## 2. Prepare the server
```bash
sudo apt update && sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER        # log out and back in afterwards
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```
Use SSH keys and disable password logins (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

## 3. Get the code and configure it
```bash
git clone https://github.com/sohamrt-labs/Worktime-Scheduling-Dashboard.git && cd Worktime-Scheduling-Dashboard
cp deploy/.env.production.example .env.production
chmod 600 .env.production
openssl rand -hex 32     # paste as SECRET_KEY
openssl rand -hex 24     # paste as POSTGRES_PASSWORD
nano .env.production     # set DOMAIN, the two secrets above, CONTACT_EMAIL and your SMTP_* email settings
```
Never commit `.env.production`; it is already in `.gitignore`.

## 4. Email (required)
Sign-up confirmation and password reset are sent by email, and the server refuses to start in production without an email provider. Any SMTP service works: Brevo (free tier), Mailgun, Amazon SES, or Gmail with an app password. Put its host, port, user and password in `.env.production`, and use an address on your own domain as `MAIL_FROM` (ask the provider how to set up SPF and DKIM so messages do not land in spam).

## 5. Launch
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production logs -f backend
```
The first start applies the database migrations automatically and Caddy fetches the HTTPS certificate (needs ports 80 and 443 open and the DNS record in place).

## 6. Check it
```bash
curl -s https://app.yourdomain.com/api/health        # {"status":"ok"}
```
Open the site and create your first account. Confirm that the confirmation email arrives (check spam), then try "Forgot your password?". While you are still testing in public, set `INVITE_CODE` in `.env.production` (people must enter it to sign up) or `ALLOW_SIGNUP=false`, then re-run the `up -d` command. Also open the browser developer console once and check for red errors (the Content-Security-Policy is strict).

## 7. Updating
```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```
Migrations run on start. When you change a model, create a migration locally and commit it:
```bash
cd backend && alembic revision --autogenerate -m "describe the change"
```
CI fails if models and migrations disagree.

## 8. Backups (do this before real users arrive)
```bash
mkdir -p ~/backups
# crontab -e   (nightly at 03:00)
0 3 * * * cd ~/Worktime-Scheduling-Dashboard && docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db pg_dump -U worktime worktime | gzip > ~/backups/worktime-$(date +\%F).sql.gz
```
Restore: `gunzip -c ~/backups/FILE.sql.gz | docker compose -f docker-compose.prod.yml --env-file .env.production exec -T db psql -U worktime worktime`.
Copy backups off the server, and test a restore at least once.

## 9. Monitoring
Point a free uptime monitor (for example UptimeRobot) at `https://app.yourdomain.com/api/health`. Logs: `docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail 200`.

## Helping a locked-out user
Users normally reset their own password with "Forgot your password?". If email is not working, set a new password yourself on the server:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec backend python reset_password.py USERNAME
```
On your own computer: `python reset_password.py USERNAME` inside the `backend` folder.

## Built in
HTTPS with HSTS and security headers; PostgreSQL with migrations; non-root containers; private API and database; login session in an httpOnly SameSite cookie with CSRF protection (no token in browser storage); email confirmation and password reset (changing a password signs out every other session); account deletion and data download; Terms and Privacy pages with recorded consent; rate limits on login, sign-up and reset; optional invite code; per-business data isolation; size caps; API docs disabled in production; startup refuses unsafe settings; the synthetic-data model is disclosed in the app.

## Before you accept real users
- **Review the Terms and Privacy texts** in `frontend/src/pages/Legal.jsx`. They are sensible starting points that match what the app really does, but they are not legal advice. Adjust them to your country (for example GDPR or India's DPDP Act) and business.
- Set `CONTACT_EMAIL` to an inbox you actually read.
- Test the email flows on your real domain.

## Still limited
- No two-factor authentication.
- Rate limits are in memory and per process (correct for the single worker used here; use Redis to scale out).
- A stolen session cookie works until it expires or the password changes; changing the password is the "sign out everywhere" button.
- The strict Content-Security-Policy was tested in headless Chromium with no violations. Open the live site once in your own browser anyway and check the console.
- The delay-risk model is trained on synthetic data and says so throughout the app.
- Not yet verified on a live server: the Docker and Caddy files are validated in CI, and you are the first real deployment.
