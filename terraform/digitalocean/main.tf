locals {
  fqdn = var.domain == "" ? "" : (var.subdomain == "@" ? var.domain : "${var.subdomain}.${var.domain}")

  # Only non-empty values are written to the droplet's env file.
  app_env = {
    for k, v in {
      REHEARSAL_ACCESS_TOKEN = var.rehearsal_access_token
      GEMINI_API_KEY         = var.gemini_api_key
      JEV_API_KEY            = var.jev_api_key
      BRIGHTDATA_API_KEY     = var.brightdata_api_key
      BRIGHTDATA_ZONE        = var.brightdata_zone
      SENTRY_DSN             = var.sentry_dsn
      DATABASE_URL           = var.database_url
    } : k => v if v != ""
  }
  env_file = join("\n", [for k, v in local.app_env : "${k}=${v}"])
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
  # 127.0.0.1:3000, and fronts it with Caddy (auto-HTTPS when a domain is set).
  # No secrets here: user_data is readable from the droplet's metadata service.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    github_repo = var.github_repo
    git_ref     = var.git_ref
    site        = local.fqdn == "" ? ":80" : local.fqdn
  })
}

# Secrets reach the droplet over SSH after boot, into /etc/rehearsal/env (0600, root).
resource "terraform_data" "app_env" {
  triggers_replace = [digitalocean_droplet.rehearsal.id, sha256(local.env_file)]

  lifecycle {
    precondition {
      condition     = length(var.ssh_key_fingerprints) > 0
      error_message = "ssh_key_fingerprints must list the key Terraform uses to provision /etc/rehearsal/env."
    }
  }

  connection {
    type        = "ssh"
    host        = digitalocean_droplet.rehearsal.ipv4_address
    user        = "root"
    private_key = var.ssh_private_key == "" ? null : var.ssh_private_key
    agent       = var.ssh_private_key == ""
    timeout     = "5m"
  }

  provisioner "remote-exec" {
    inline = ["cloud-init status --wait >/dev/null || true", "install -d -m 0700 /etc/rehearsal"]
  }

  provisioner "file" {
    content     = "${local.env_file}\n"
    destination = "/etc/rehearsal/env"
  }

  provisioner "remote-exec" {
    inline = ["chmod 0600 /etc/rehearsal/env", "systemctl restart rehearsal"]
  }
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
  count = var.domain == "" ? 0 : 1

  domain = var.domain
  type   = "A"
  name   = var.subdomain
  value  = digitalocean_droplet.rehearsal.ipv4_address
  ttl    = 300
}
