output "worker_name" {
  description = "Worker script name (use as `name` in wrangler config)."
  value       = cloudflare_workers_script.rehearsal.script_name
}

output "app_url" {
  description = "Public URL of the app: the custom domain if set, else workers.dev (null if workers_dev_subdomain is unknown)."
  value = (
    var.domain != "" ? "https://${var.domain}" :
    var.workers_dev_subdomain != "" ? "https://${var.worker_name}.${var.workers_dev_subdomain}.workers.dev" :
    null
  )
}
