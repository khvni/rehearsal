terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.12"
    }
  }
}

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "account_id" {
  type = string
}

variable "worker_name" {
  type    = string
  default = "rehearsal"
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# Next.js deploys to Cloudflare via @opennextjs/cloudflare (`opennextjs-cloudflare build && deploy`).
# This stack manages the Worker script slot + env bindings; the bundle is uploaded by wrangler
# during deploy. For a fully-Terraform-managed variant, swap in cloudflare_workers_script with
# content_file pointing at the built .open-next/worker.js bundle.
resource "cloudflare_workers_script" "rehearsal" {
  account_id  = var.account_id
  script_name = var.worker_name
  # Placeholder module — the real bundle ships via `opennextjs-cloudflare deploy`.
  content = "export default { async fetch(request, env, ctx) { return fetch(request); } };"

  bindings = [
    { name = "GEMINI_API_KEY", type = "secret_text", text = var.gemini_api_key },
    { name = "JEV_API_KEY", type = "secret_text", text = var.jev_api_key },
    { name = "BRIGHTDATA_API_KEY", type = "secret_text", text = var.brightdata_api_key },
    { name = "SENTRY_DSN", type = "secret_text", text = var.sentry_dsn },
  ]
}

variable "gemini_api_key" { type = string, sensitive = true, default = "" }
variable "jev_api_key" { type = string, sensitive = true, default = "" }
variable "brightdata_api_key" { type = string, sensitive = true, default = "" }
variable "sentry_dsn" { type = string, sensitive = true, default = "" }
