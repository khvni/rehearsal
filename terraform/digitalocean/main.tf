terraform {
  required_version = ">= 1.6"
  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.40"
    }
  }
}

variable "do_token" {
  type      = string
  sensitive = true
}

variable "github_repo" {
  type    = string
  default = "khvni/rehearsal"
}

variable "region" {
  type    = string
  default = "sfo3"
}

# App secrets are injected at deploy time via terraform -var or DO env vars.
variable "gemini_api_key" { type = string, sensitive = true, default = "" }
variable "jev_api_key" { type = string, sensitive = true, default = "" }
variable "brightdata_api_key" { type = string, sensitive = true, default = "" }
variable "brightdata_zone" { type = string, default = "" }
variable "sentry_dsn" { type = string, sensitive = true, default = "" }
variable "database_url" { type = string, sensitive = true, default = "" }

provider "digitalocean" {
  token = var.do_token
}

resource "digitalocean_app" "rehearsal" {
  spec {
    name   = "rehearsal"
    region = var.region

    service {
      name               = "web"
      instance_count     = 1
      instance_size_slug = "basic-xs"

      github {
        repo           = var.github_repo
        branch         = "main"
        deploy_on_push = true
      }

      build_command = "npm ci && npm run build"
      run_command   = "npm start"

      env {
        key   = "GEMINI_API_KEY"
        value = var.gemini_api_key
        type  = "SECRET"
      }
      env {
        key   = "JEV_API_KEY"
        value = var.jev_api_key
        type  = "SECRET"
      }
      env {
        key   = "BRIGHTDATA_API_KEY"
        value = var.brightdata_api_key
        type  = "SECRET"
      }
      env {
        key   = "BRIGHTDATA_ZONE"
        value = var.brightdata_zone
      }
      env {
        key   = "SENTRY_DSN"
        value = var.sentry_dsn
        type  = "SECRET"
      }
      env {
        key   = "DATABASE_URL"
        value = var.database_url
        type  = "SECRET"
      }

      http_port = 3000
    }
  }
}

output "app_url" {
  value = digitalocean_app.rehearsal.live_url
}
