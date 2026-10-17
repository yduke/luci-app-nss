#!/bin/sh
#
# Build the package and install/upgrade it on a router over SSH.
#
# Usage: scripts/install.sh [user@host]
#        scripts/install.sh root@192.168.1.1
#
set -e

HOST="${1:-root@192.168.2.1}"
SRC="$(cd "$(dirname "$0")/.." && pwd)"

"$SRC/scripts/build-ipk.sh"

IPK="$(ls -1t "$SRC"/luci-app-nss_*.ipk | head -n1)"
echo "installing $(basename "$IPK") on $HOST ..."

scp -q "$IPK" "$HOST:/tmp/"

ssh "$HOST" "set -e
	opkg install /tmp/$(basename "$IPK") || opkg install --force-reinstall /tmp/$(basename "$IPK")
	rm -f /tmp/$(basename "$IPK")"

# rpcd caches /usr/share/rpcd/acl.d at startup: reload so a browser session
# created afterwards is granted the new luci-app-nss ACL group.
ssh "$HOST" '/etc/init.d/rpcd reload'

echo "done. log out and back into LuCI to pick up the new menu entry."
