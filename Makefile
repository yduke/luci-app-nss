#
# Copyright (C) 2026 luci-app-nss contributors
#
# This is free software, licensed under the ISC license.
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-nss
PKG_VERSION:=1.1.0
PKG_RELEASE:=1

PKG_LICENSE:=ISC
PKG_MAINTAINER:=

LUCI_TITLE:=NPU (Qualcomm NSS) status and utilisation
LUCI_DESCRIPTION:=Reads the statistics exposed by qca-nss-drv and qca-nss-ecm \
	through debugfs and shows NSS core utilisation on the Status/Overview \
	page, plus a dedicated detail page with ECM accelerated flow counts and \
	per-module packet/byte counters.  Only meaningful on qualcommax targets \
	(IPQ60xx / IPQ807x) with the NSS driver loaded; on other platforms the \
	sections hide themselves.
LUCI_DEPENDS:=+luci-base
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
