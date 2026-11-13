variable "cloudflare_api_token" {
  description = "Cloudflare API token with Workers Scripts:Edit (+ Workers Routes/DNS:Edit on the zone for a custom domain). Pass via -var or TF_VAR_cloudflare_api_token; never commit it."
  type        = string
  sensitive   = true
}

variable "account_id" {
  description = "Cloudflare account ID that owns the Worker."
  type        = string
}

variable "zone_id" {
  description = "Optional zone ID for var.domain. Required when var.domain is set."
  type        = string
  default     = ""
}

variable "domain" {
  description = "Optional hostname for the Worker custom domain (e.g. rehearsal.example.com). Empty = workers.dev only."
  type        = string
  default     = ""

  validation {
    condition     = var.domain == "" || var.zone_id != ""
    error_message = "zone_id must be set when domain is set."
  }
}

variable "workers_dev_subdomain" {
  description = "The account's workers.dev subdomain (the <sub> in <sub>.workers.dev), used only to build the app_url output."
  type        = string
  default     = ""
}

variable "worker_name" {
  description = "Worker script name; must match `name` in the OpenNext wrangler config."
  type        = string
  default     = "rehearsal"
}

# App secrets, bound as Worker secret_text. All optional: adapters fall back to fixtures.
variable "gemini_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "jev_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "brightdata_api_key" {
  type      = string
  sensitive = true
  default   = ""
}

variable "brightdata_zone" {
  type    = string
  default = ""
}

variable "sentry_dsn" {
  type      = string
  sensitive = true
  default   = ""
}
