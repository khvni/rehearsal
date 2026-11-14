variable "do_token" {
  description = "DigitalOcean API token (pass via -var or TF_VAR_do_token; never commit it)."
  type        = string
  sensitive   = true
}

variable "region" {
  description = "DigitalOcean region slug for the droplet."
  type        = string
  default     = "sfo3"
}

variable "size" {
  description = "Droplet size slug. Next.js build + headless Chromium want >= 4 GB RAM."
  type        = string
  default     = "s-2vcpu-4gb"
}

variable "image" {
  description = "Droplet base image."
  type        = string
  default     = "ubuntu-24-04-x64"
}

variable "domain" {
  description = "Optional DigitalOcean-managed DNS zone (e.g. example.com). Empty = serve on the droplet IP over plain HTTP."
  type        = string
  default     = ""
}

variable "subdomain" {
  description = "Record name created in var.domain for the app (\"@\" for the apex)."
  type        = string
  default     = "rehearsal"
}

variable "ssh_key_fingerprints" {
  description = "Fingerprints/IDs of SSH keys already uploaded to DigitalOcean, for shell access."
  type        = list(string)
  default     = []
}

variable "ssh_private_key" {
  description = "Private key (PEM) matching one of ssh_key_fingerprints, used to write /etc/rehearsal/env after boot. Empty = use ssh-agent."
  type        = string
  sensitive   = true
  default     = ""
}

variable "github_repo" {
  description = "GitHub repo (owner/name) the droplet clones and builds."
  type        = string
  default     = "khvni/rehearsal"
}

variable "git_ref" {
  description = "Branch or tag to deploy."
  type        = string
  default     = "main"
}

variable "rehearsal_access_token" {
  description = "Shared secret for the dashboard and API (Basic-auth password, any username, or Bearer token). The droplet is public, so it is required."
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.rehearsal_access_token) >= 16
    error_message = "rehearsal_access_token must be at least 16 characters (e.g. openssl rand -hex 24)."
  }
}

# App secrets. All optional: every adapter falls back to fixtures without its key.
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

variable "database_url" {
  type      = string
  sensitive = true
  default   = ""
}
