# Terraform deploys

Two stacks; the demo host is **DigitalOcean**, Cloudflare is the alternate target.
Each stack is self-contained: `versions.tf` (pinned providers), `variables.tf`, `main.tf`,
`outputs.tf`, plus a committed `.terraform.lock.hcl`. Terraform >= 1.9.

**No API keys are committed.** Pass tokens and app secrets at apply time with `-var` or
`TF_VAR_<name>` env vars. App secrets are optional: every adapter falls back to fixtures.
Don't commit `*.tfvars` files that contain secrets (state files are gitignored; they hold
secret values, so use a private/remote backend for anything shared).

## DigitalOcean (primary — droplet)

One Ubuntu droplet; cloud-init installs Node 22 + Playwright Chromium, clones
`github_repo@git_ref`, runs `npm ci && npm run build`, serves `next start` on
`127.0.0.1:3000` under systemd, and fronts it with Caddy (port 80, or auto-HTTPS when
`domain` or `site_host` is set). A firewall allows only 22/80/443 in.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `do_token` | yes | — | DigitalOcean API token |
| `region` | no | `sfo3` | |
| `size` | no | `s-2vcpu-4gb` | build + Chromium want >= 4 GB |
| `domain` | no | `""` | DO-managed zone; creates an A record |
| `subdomain` | no | `rehearsal` | record name in `domain` when `site_host` is empty (`@` = apex) |
| `site_host` | no | `""` | externally managed hostname; enables auto-HTTPS without creating a DO DNS record |
| `ssh_key_fingerprints` | no | `[]` | DO SSH keys for shell access |
| `github_repo` / `git_ref` | no | `khvni/rehearsal` / `main` | |
| `gemini_api_key`, `jev_api_key`, `brightdata_api_key`, `brightdata_zone`, `sentry_dsn`, `database_url` | no | `""` | written to `/etc/rehearsal/env` (0600) |

```bash
cd terraform/digitalocean
terraform init
terraform apply \
  -var="do_token=$DIGITALOCEAN_TOKEN" \
  -var="domain=example.com" \
  -var="gemini_api_key=$GEMINI_API_KEY"   # optional secrets, same pattern
```

For externally managed DNS, set `site_host` instead of `domain`; it takes precedence
and disables DigitalOcean DNS record creation.

Outputs: `droplet_ip`, `app_url`. The first boot build takes ~10 minutes
(`tail -f /var/log/cloud-init-output.log` on the droplet). Secrets passed here end up in
droplet user-data, which is readable by anyone with access to the DO account.

## Cloudflare (alternate — Workers)

The Next.js app deploys via `@opennextjs/cloudflare` (`npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`).
Terraform owns the Worker script slot (placeholder module until the first deploy), its
`secret_text` bindings, the workers.dev route, and an optional custom domain. Code changes
from wrangler are ignored by Terraform. Keep `worker_name` equal to `name` in the wrangler config.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `cloudflare_api_token` | yes | — | Workers Scripts:Edit (+ zone Workers Routes/DNS:Edit for `domain`) |
| `account_id` | yes | — | |
| `zone_id` | with `domain` | `""` | zone that contains `domain` |
| `domain` | no | `""` | custom hostname, e.g. `rehearsal.example.com` |
| `workers_dev_subdomain` | no | `""` | only used to build `app_url` when no `domain` |
| `worker_name` | no | `rehearsal` | |
| `gemini_api_key`, `jev_api_key`, `brightdata_api_key`, `brightdata_zone`, `sentry_dsn` | no | `""` | empty values are not bound |

```bash
cd terraform/cloudflare
terraform init
terraform apply \
  -var="cloudflare_api_token=$CLOUDFLARE_API_TOKEN" \
  -var="account_id=$CF_ACCOUNT_ID" \
  -var="zone_id=$CF_ZONE_ID" \
  -var="domain=rehearsal.example.com"
npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy   # from the repo root
```

Outputs: `worker_name`, `app_url`.

## Validation

CI runs, per stack:

```bash
terraform fmt -check -recursive terraform/
terraform init -backend=false
terraform validate
```
