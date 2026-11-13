locals {
  fqdn          = var.domain == "" ? "" : (var.subdomain == "@" ? var.domain : "${var.subdomain}.${var.domain}")
  site_hostname = var.site_host != "" ? var.site_host : local.fqdn

  # Only non-empty values are written to the droplet's env file.
  app_env = {
    for k, v in {
      GEMINI_API_KEY     = var.gemini_api_key
      JEV_API_KEY        = var.jev_api_key
      BRIGHTDATA_API_KEY = var.brightdata_api_key
      BRIGHTDATA_ZONE    = var.brightdata_zone
      SENTRY_DSN         = var.sentry_dsn
      DATABASE_URL       = var.database_url
    } : k => v if v != ""
  }
}

resource "digitalocean_droplet" "rehearsal" {
  name       = "rehearsal"
  region     = var.region
  size       = var.size
  image      = var.image
  ssh_keys   = var.ssh_key_fingerprints
  monitoring = true
  tags       = ["rehearsal"]

  # Installs Node 22 + Chromium, builds the app, runs `next start` under systemd on
  # 127.0.0.1:3000, and fronts it with Caddy (auto-HTTPS when a hostname is set).
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    github_repo = var.github_repo
    git_ref     = var.git_ref
    site        = local.site_hostname == "" ? ":80" : local.site_hostname
    env_file    = join("\n", concat(["NODE_ENV=production"], [for k, v in local.app_env : "${k}=${v}"]))
  })
}

resource "digitalocean_firewall" "rehearsal" {
  name        = "rehearsal"
  droplet_ids = [digitalocean_droplet.rehearsal.id]

  inbound_rule {
    protocol         = "tcp"
    port_range       = "22"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "80"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  inbound_rule {
    protocol         = "tcp"
    port_range       = "443"
    source_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "tcp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "udp"
    port_range            = "1-65535"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }

  outbound_rule {
    protocol              = "icmp"
    destination_addresses = ["0.0.0.0/0", "::/0"]
  }
}

resource "digitalocean_record" "rehearsal" {
  count = var.domain != "" && var.site_host == "" ? 1 : 0

  domain = var.domain
  type   = "A"
  name   = var.subdomain
  value  = digitalocean_droplet.rehearsal.ipv4_address
  ttl    = 300
}
