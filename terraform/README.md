# Terraform deploys

Two stacks; the demo host is **DigitalOcean**, Cloudflare is the alternate target.

## DigitalOcean (primary — App Platform)

```bash
cd terraform/digitalocean
terraform init
terraform apply \
  -var="do_token=$DIGITALOCEAN_TOKEN" \
  -var="gemini_api_key=$GEMINI_API_KEY" \
  -var="jev_api_key=$JEV_API_KEY" \
  -var="brightdata_api_key=$BRIGHTDATA_API_KEY" \
  -var="brightdata_zone=$BRIGHTDATA_ZONE" \
  -var="sentry_dsn=$SENTRY_DSN" \
  -var="database_url=$DATABASE_URL"
```

App Platform builds from `khvni/rehearsal@main` (`npm ci && npm run build`, `npm start`).
Note: Playwright needs a Chromium runtime on the service image — for the demo, run the
pipeline locally/CI and treat the DO app as the dashboard host, or add a Dockerfile
with `npx playwright install --with-deps chromium` in the build.

## Cloudflare (alternate — Workers)

Deploys via `@opennextjs/cloudflare` (`npx opennextjs-cloudflare build && deploy`); the
Terraform stack manages the script slot + secret bindings.

```bash
cd terraform/cloudflare
terraform init
terraform apply -var="cloudflare_api_token=$CLOUDFLARE_API_TOKEN" -var="account_id=$CF_ACCOUNT_ID" ...
```

CI validates both stacks (`terraform fmt -check`, `init -backend=false`, `validate`).
