locals {
  secrets = {
    GEMINI_API_KEY     = var.gemini_api_key
    JEV_API_KEY        = var.jev_api_key
    BRIGHTDATA_API_KEY = var.brightdata_api_key
    SENTRY_DSN         = var.sentry_dsn
  }
}

# Next.js deploys to Cloudflare via @opennextjs/cloudflare (`opennextjs-cloudflare build && deploy`).
# This stack owns the Worker script slot, its secret bindings, workers.dev and the custom domain;
# the real bundle is uploaded by wrangler, so Terraform ignores later code changes.
resource "cloudflare_workers_script" "rehearsal" {
  account_id          = var.account_id
  script_name         = var.worker_name
  main_module         = "worker.js"
  compatibility_date  = "2025-09-01"
  compatibility_flags = ["nodejs_compat"]

  # Placeholder module until the first `opennextjs-cloudflare deploy`.
  content = "export default { async fetch() { return new Response(\"Rehearsal: deploy pending\", { status: 503 }); } };"

  bindings = [
    for name, value in local.secrets : {
      name = name
      type = "secret_text"
      text = value
    } if value != ""
  ]

  lifecycle {
    ignore_changes = [content, content_file, content_sha256, content_type, files, main_module, compatibility_date, compatibility_flags, assets]
  }
}

resource "cloudflare_workers_script_subdomain" "rehearsal" {
  account_id  = var.account_id
  script_name = cloudflare_workers_script.rehearsal.script_name
  enabled     = true
}

resource "cloudflare_workers_custom_domain" "rehearsal" {
  count = var.domain == "" ? 0 : 1

  account_id = var.account_id
  zone_id    = var.zone_id
  hostname   = var.domain
  service    = cloudflare_workers_script.rehearsal.script_name
}
