#!/bin/sh
#
# Build luci-app-nss_<version>-<release>_all.ipk without the OpenWrt SDK.
#
# Layout mirrors what $(TOPDIR)/feeds/luci/luci.mk installs:
#   htdocs/  ->  /www/
#   root/    ->  /
#
# The .ipk produced here is a gzipped tar holding ./debian-binary,
# ./control.tar.gz and ./data.tar.gz -- the flavour of ipk used by opkg on
# OpenWrt 24.10/25.x (an ar archive is rejected by this opkg).
#
# The archive is generated reproducibly (sorted entries, fixed mtime/uid/gid,
# gzip without timestamp), so building the same sources twice yields a
# bit-identical file.
#
set -e

SRC="$(cd "$(dirname "$0")/.." && pwd)"
NAME=luci-app-nss

VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$SRC/Makefile")"
RELEASE="$(sed -n 's/^PKG_RELEASE:=//p' "$SRC/Makefile")"
[ -n "$VERSION" ] && [ -n "$RELEASE" ] || {
	echo "cannot read PKG_VERSION/PKG_RELEASE from $SRC/Makefile" >&2
	exit 1
}

OUT="$SRC/${NAME}_${VERSION}-${RELEASE}_all.ipk"
BUILD="$SRC/build"

rm -rf "$BUILD"
mkdir -p "$BUILD/data" "$BUILD/control"

# ---------------------------------------------------------------- data -----
mkdir -p "$BUILD/data/www"
cp -r "$SRC/htdocs/." "$BUILD/data/www/"
cp -r "$SRC/root/." "$BUILD/data/"
find "$BUILD/data" -name '*.o' -delete

# ------------------------------------------------------------- control -----
SIZE="$(du -sb "$BUILD/data" | cut -f1)"

cat > "$BUILD/control/control" <<EOF
Package: $NAME
Version: $VERSION-$RELEASE
Depends: luci-base
Source: package/luci-app-nss
SourceName: $NAME
License: ISC
Section: luci
Architecture: all
Installed-Size: $SIZE
Description:  NPU (Qualcomm NSS) status and utilisation for qualcommax targets.
 Shows NSS core utilisation (Status/Overview page and a dedicated detail
 page), ECM hardware accelerated flow counts and per-module packet/byte
 counters by reading the debugfs files exposed by qca-nss-drv and
 qca-nss-ecm.
EOF

TAROPTS="--sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner"

# shellcheck disable=SC2086
( cd "$BUILD/control" && tar $TAROPTS -czf "$BUILD/control.tar.gz" ./control )
# shellcheck disable=SC2086
( cd "$BUILD/data" && tar $TAROPTS -czf "$BUILD/data.tar.gz" . )

printf '2.0\n' > "$BUILD/debian-binary"

rm -f "$OUT"
# shellcheck disable=SC2086
( cd "$BUILD" && tar $TAROPTS -czf "$OUT" ./debian-binary ./control.tar.gz ./data.tar.gz )

echo "built: $OUT"
echo "sha256: $(sha256sum "$OUT" | cut -d' ' -f1)"
