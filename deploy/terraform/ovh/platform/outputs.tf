output "public_hosts" {
  value = {
    app     = "https://iotgw.i40sys.com"
    backend = "https://backend.iotgw.i40sys.com"
    api     = "https://api.iotgw.i40sys.com"
    device  = "https://${var.device_api_host}"
  }
}
