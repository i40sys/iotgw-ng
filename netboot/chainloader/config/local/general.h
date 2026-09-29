/* iotgw-ng chainloader (task-149.03): HTTPS on every platform (upstream
 * v2.0.0 disables it for BIOS builds), plus the commands chain.ipxe uses. */
#undef DOWNLOAD_PROTO_HTTPS
#define DOWNLOAD_PROTO_HTTPS
#define POWEROFF_CMD	/* the QEMU tests' stub menu powers the VM off */
#define SLEEP_CMD
