# Security Policy

## Supported Versions

We actively maintain and provide security updates for the following versions:

| Version | Supported          | Notes |
| ------- | ------------------ | ----- |
| 9.x     | :white_check_mark: | Current. RS256 cookies, TOTP 2FA, IDOR gate, tunnel-only origin |
| 8.x     | :x:                | Upgrade — lacks v9.0 authentication hardening |
| < 8.0   | :x:                | EoL |

## Reporting a Vulnerability

We take the security of APEX Platform seriously. If you believe you have found a security vulnerability, please report it to us as described below.

### How to Report

**Please do NOT report security vulnerabilities through public GitHub issues.**

Instead, please report them via one of the following methods:

1. **Email**: Send details to damonalexander@me.com
2. **GitHub Security Advisories**: Use GitHub's private vulnerability reporting feature
3. **Direct Message**: Contact maintainers directly through GitHub

### What to Include

Please include the following information in your report:

- Type of issue (e.g. buffer overflow, SQL injection, cross-site scripting, etc.)
- Full paths of source file(s) related to the manifestation of the issue
- The location of the affected source code (tag/branch/commit or direct URL)
- Any special configuration required to reproduce the issue
- Step-by-step instructions to reproduce the issue
- Proof-of-concept or exploit code (if possible)
- Impact of the issue, including how an attacker might exploit the issue

### Response Timeline

- **Initial Response**: We will acknowledge receipt of your vulnerability report within 48 hours
- **Assessment**: We will provide an initial assessment within 5 business days
- **Updates**: We will provide regular updates on our progress
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days

### Safe Harbor

We support safe harbor for security researchers who:

- Make a good faith effort to avoid privacy violations, destruction of data, and interruption or degradation of our service
- Only interact with accounts you own or with explicit permission of the account holder
- Do not access a user's private information without permission
- Do not defraud our users or APEX Platform of money or goods

### Recognition

We maintain a list of security researchers who have helped improve the security of APEX Platform:

- [Future contributors will be listed here]

## Security Features (v9.0)

### Authentication
- **RS256 access tokens** (2048-bit RSA keypair, 15-minute TTL) in **httpOnly + Secure + SameSite=Strict cookies** — tokens never touch localStorage, so XSS cannot exfiltrate them
- **Opaque refresh tokens** (SHA-256 hashed, 14-day sliding window) with rotation and reuse detection — presenting a revoked token revokes every session for that user
- **TOTP 2FA** (speakeasy) with AES-256-GCM at-rest encryption of secrets and 10 bcrypt-hashed single-use backup codes
- **Account lockout** — 5 fails → 15 min, 10 → 1 h, 15 → 24 h, returns `423 Locked` + `Retry-After`
- **CSRF double-submit cookie** + `X-CSRF-Token` header
- **bcrypt cost 12** passwords, 12-char policy, 60-day rotation

### Authorization
- **Role-based access control** (superadmin, admin, owner, project_manager, field_ops, auditor, viewer)
- **IDOR gate** on `/api/projects` via the `project_members` table; non-members receive `404` to prevent enumeration
- `requireSelfOrAdmin` on self-service routes

### API hardening
- Parameterized queries everywhere (no string-concat SQL)
- `express-validator` on every mutating endpoint; explicit destructuring (no mass assignment)
- Global rate limit 500 / 15 min; auth-specific rate limit 15 / 15 min
- All 500 responses go through `sendServerError()` returning `{error, correlationId}` — full stack stays server-side
- No query-string JWTs (downloads use fetch+blob with cookies)
- Audit logging on every mutation endpoint

### HTTP + transport
- Helmet CSP, HSTS with `includeSubDomains; preload`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, `server_tokens off`
- TLS 1.2+ enforced for outbound HTTPS (`tls.DEFAULT_MIN_VERSION`)
- DB TLS supported via `DB_SSL` family of env vars

### Infrastructure
- **Tunnel-only origin** — Windows Firewall / host firewall blocks direct access to the backend and database; traffic arrives only via Cloudflare Tunnel or equivalent
- **PostgreSQL on `localhost`** with a dedicated **CRUD-only runtime user** (`apex_app`); schema pushes use a separate admin login via `DDL_USERNAME` / `DDL_PASSWORD` overrides
- **Dedicated low-privilege service account** (`svc_apex` on Windows; `apex` UID in the Docker image) — no `LocalSystem` / `root`
- **`secrets/` directory** with strict ACLs holds the RSA keypair; mounted read-only into the backend container

### Audit + observability
- Structured JSON logger with a `security()` level that also writes to `AuditLog`
- Correlation ids on every 500 response for operator grep
- NSSM / Docker log rotation at 10 MB / 100 MB online

## Secrets management

### Where secrets may live

| Location | Allowed? | Notes |
|---|---|---|
| `.env` / `node/.env` on a dev or operator host | ✅ | Gitignored. Chmod 600. Copy from `.env.example`. |
| `secrets/` on the host | ✅ | Gitignored. RSA keypair, initial-admin credential file, `*_FILE` mount targets. |
| A dedicated secrets manager (Vault, AWS Secrets Manager, Azure Key Vault, GCP Secret Manager) | ✅ — **preferred for production** | Mount as a file, point the matching `*_FILE` env var at the path. |
| Source code, markdown docs, config committed to git | ❌ | Use `<placeholder>` or `CHANGE_ME_*` shapes in docs. The pre-commit hook enforces this. |
| Chat, email, ticket systems | ❌ | Short-lived password resets or a secrets manager instead. |
| Container stdout, CI logs, terminal scrollback | ❌ | `bootstrap-dev.sh` writes the initial admin password to `secrets/initial_admin_credentials.txt` (chmod 600) rather than printing it. |

### Every secret APEX uses

| Secret | Where it lives | How to generate | Rotation |
|---|---|---|---|
| `DB_PASSWORD` | `.env`, `DB_PASSWORD_FILE` mount | `openssl rand -base64 24` | 90 days or on leak |
| `JWT_SECRET` (HS256 fallback) | `.env`, `JWT_SECRET_FILE` mount | `openssl rand -base64 48` | Per release or on leak |
| `secrets/jwt_private.pem` (RS256) | `secrets/` on host, mounted read-only | `./docker/generate-keys.sh` | Annual — invalidates every active access token |
| `secrets/jwt_public.pem` | `secrets/` on host | co-generated | Same as private |
| `TOTP_ENC_KEY` (AES-256-GCM) | `.env`, `TOTP_ENC_KEY_FILE` mount | `openssl rand -base64 32` | Annual — requires re-encrypt of `user_totp` |
| `INITIAL_ADMIN_PASSWORD` | `.env`, one-shot | Password manager | Changed from Profile after first login, then removed from `.env` |
| `CISCO_CLIENT_SECRET`, `CISCO_PERSONAL_TOKEN` | `.env`, `*_FILE` mounts | Webex developer portal | Per Cisco mandate |
| `apex_app` runtime DB password | PostgreSQL, `.env` | Rotated via `ALTER USER` | 90 days |
| `DDL_USERNAME` / `DDL_PASSWORD` | Ephemeral shell export, NOT `.env` | Exported at `npm run db:push` time | Every use |

### The `*_FILE` convention

For production, prefer file-based secrets. Point `<VAR>_FILE` at a path
containing the secret. The backend resolves `*_FILE` into the matching
env var at startup (`node/utils/secrets.js`) and erases the pointer.

```bash
mkdir -p ./secrets && chmod 700 ./secrets
openssl rand -base64 24 > ./secrets/db_password.txt
openssl rand -base64 48 > ./secrets/jwt_secret.txt
openssl rand -base64 32 > ./secrets/totp_enc_key.txt
chmod 600 ./secrets/*.txt
docker compose -f docker-compose.yml -f docker-compose.secrets.yml up -d
```

Supported: `DB_PASSWORD_FILE`, `JWT_SECRET_FILE`, `TOTP_ENC_KEY_FILE`,
`INITIAL_ADMIN_PASSWORD_FILE`, `CISCO_CLIENT_SECRET_FILE`,
`CISCO_PERSONAL_TOKEN_FILE`.

## Pre-commit secret scanning

APEX uses [gitleaks](https://github.com/gitleaks/gitleaks) via the
[pre-commit](https://pre-commit.com) framework. Config is in
`.pre-commit-config.yaml` + `.gitleaks.toml`.

**One-time install after cloning:**

```bash
pip install pre-commit        # or: pipx install pre-commit
pre-commit install            # wires up .git/hooks/pre-commit
pre-commit run --all-files    # baseline scan
```

Every `git commit` now runs gitleaks, `detect-private-key`,
`check-added-large-files` (> 2 MB), merge-conflict check, YAML/JSON
parse, and line-ending normalization.

**When gitleaks fires:**

- Real secret → rotate (see the table above), remove the string, re-commit. Do NOT `git commit --no-verify`.
- False positive → add a specific entry to `.gitleaks.toml`'s `[allowlist]` (either a path pattern or a regex) rather than disabling the hook.

**Server-side:** GitGuardian scans every pull request against its full
detector catalog. If a secret bypasses pre-commit (e.g. via `--no-verify`),
GitGuardian comments on the PR and blocks merge.

## Incident response — a secret has leaked

1. **Rotate first.** Replace the live value (see rotation table above) before touching git. Pulling the value out of history does not unleak it.
2. **Remove from the repo.**
   - Uncommitted → delete the line, rerun `pre-commit run --all-files`.
   - Committed but not pushed → `git reset --soft HEAD~1`, fix, re-commit.
   - Pushed but not merged → force-push a fixup.
   - In published `main` history → `git filter-repo --replace-text` is required. Destructive. Coordinate with collaborators, force-push, require every clone to be re-made.
3. **Audit.** Check `AuditLog` between leak and rotation. If the RSA key or `JWT_SECRET` was exposed, `DELETE FROM refresh_tokens` to force re-auth on fresh key material. If `TOTP_ENC_KEY` was exposed, disable every enrollment (`DELETE FROM user_totp`) and require re-enroll.
4. **Document.** Append a changelog entry with leak window, rotation time, impact scope. Resolve the incident in the GitGuardian dashboard.

### Data Security
- **Audit Logging**: Complete activity trail for all user actions
- **Data Validation**: Server-side validation for all API requests
- **Backup Security**: Encrypted backups with integrity verification
- **Privacy**: GDPR and CCPA compliance features

## Security Best Practices

### For Administrators
- Always use HTTPS in production
- Configure proper security headers in your web server
- Regularly update dependencies and security patches
- Monitor audit logs for suspicious activity
- Use strong passwords and enable two-factor authentication
- Regularly backup data and test restore procedures

### For Users
- Use strong, unique passwords
- Log out when finished using the application
- Report any suspicious activity immediately
- Keep your browser updated to the latest version
- Be cautious about accessing the application on shared computers

### For Developers
- Follow secure coding practices
- Validate and sanitize all user inputs
- Use parameterized queries to prevent SQL injection
- Implement proper error handling that doesn't leak sensitive information
- Regular security testing and code reviews
- Keep dependencies updated and monitor for vulnerabilities

## Security Architecture

APEX Platform follows defense-in-depth security principles:

1. **Perimeter Security**: Network firewalls and access controls
2. **Application Security**: Input validation, output encoding, authentication
3. **Data Security**: Encryption at rest and in transit
4. **Monitoring**: Comprehensive logging and alerting
5. **Incident Response**: Defined procedures for security incidents

## Compliance

APEX Platform is designed to support compliance with:

- **GDPR**: European Union data protection regulation
- **CCPA**: California Consumer Privacy Act
- **SOX**: Sarbanes-Oxley Act (audit trail requirements)
- **ISO 27001**: Information security management standards

## Security Updates

Security updates are released as soon as possible after vulnerabilities are confirmed and fixes are developed. We recommend:

- Subscribe to our security advisories
- Apply security updates promptly
- Test updates in a staging environment before production deployment
- Maintain backups before applying updates

## Contact

For security-related questions or concerns, please contact:

- **Security Team**: damonalexander@me.com
- **General Support**: support@yourdomain.com
- **GitHub Issues**: For non-security related issues only

---

**Last Updated**: 2026-04-21
**Version**: 9.0
