#
# IoT Gateway NG LuCI theme — a fork of luci-theme-argon v3.1.2
# (Copyright (C) 2008-2019 Jerrykuku, Apache License 2.0). See UPSTREAM.md.
#

include $(TOPDIR)/rules.mk

LUCI_TITLE:=IoT Gateway NG theme (based on Argon)
# Older SDKs require the coreutils parent menu to enable coreutils-timeout.
LUCI_DEPENDS:=+luci-base +USE_APK:wget-any +!USE_APK:wget +jsonfilter +ucode-mod-math +flock +coreutils +coreutils-timeout
PKG_VERSION:=3.1.2-1
PKG_LICENSE:=Apache-2.0 MIT OFL-1.1
LUCI_MAINTAINER:=i40sys

CONFIG_LUCI_CSSTIDY:=
# Ship template source across stable and snapshot runtimes. Precompiled
# bytecode would require the SDK's ucode format (upstream issue #715).
CONFIG_LUCI_UTMIN:=
LUCI_MINIFY_UT:=0

define Package/luci-theme-iotgw/conffiles
/etc/config/argon
endef

include $(TOPDIR)/feeds/luci/luci.mk

# Same files as upstream Argon (/www/luci-static/argon, /etc/config/argon):
# opkg refuses to install it over luci-theme-argon (luci.mk has no CONFLICTS hook).

# call BuildPackage - OpenWrt buildroot signature
