output "droplet_ip" {
  description = "Public IPv4 address of the demo droplet."
  value       = digitalocean_droplet.rehearsal.ipv4_address
}

output "app_url" {
  description = "URL of the Rehearsal dashboard (allow ~10 min after apply for cloud-init to build)."
  value       = local.fqdn == "" ? "http://${digitalocean_droplet.rehearsal.ipv4_address}" : "https://${local.fqdn}"
}
