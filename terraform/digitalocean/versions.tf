terraform {
  required_version = ">= 1.9"

  required_providers {
    digitalocean = {
      source  = "digitalocean/digitalocean"
      version = "~> 2.107"
    }
  }
}

provider "digitalocean" {
  token = var.do_token
}
