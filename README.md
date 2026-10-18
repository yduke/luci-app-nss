# luci-app-nss
[中文文档](https://github.com/yduke/luci-app-nss/blob/master/README_zhCN.md)
A LuCI status plugin for Qualcomm **NSS** (Network Subsystem), the network
offload processor (often called an NPU) found in IPQ60xx / IPQ807x
(`qualcommax`) routers.

The plugin does not change any configuration or write to NSS registers. It
only reads statistics exposed through debugfs by the `qca-nss-drv` and
`qca-nss-ecm` kernel modules.

> **Warning:** This plugin has only been tested on JDCloud Taiyi routers
> running Kwrt 25.12. Other hardware is not supported, and other firmware
> has not been tested. Install at your own risk.

## Features

| Location | Information |
| --- | --- |
| **Status → Overview** (below CPU usage) | NSS utilization, displayed as one progress bar per NSS core in a table using the same `cbi-progressbar` style as the CPU panel |
| **Status → NPU (NSS) Status** | Detailed view of core load (including minimum and maximum values), ECM hardware-accelerated flows (IPv4/IPv6 and TCP/UDP), live NSS module throughput (N2H / IPv4 / IPv6 / PPPoE), and non-zero drop/error counters |

The Overview panel appears below the CPU panel because LuCI dynamically scans
`/www/luci-static/resources/view/status/include/` and loads its `*.js` files
in filename order. This package installs `12_nss.js`, so it follows
`11_cpu.js` without replacing or modifying any LuCI-provided files. This also
means the panel is not overwritten by firmware upgrades.

On platforms without NSS, or when `qca-nss-drv` is not loaded, the Overview
section is hidden automatically.

## Repository layout

```text
.
├── Makefile                                  # For the OpenWrt buildroot / SDK
├── README.md
├── README_zhCN.md                            # Chinese documentation
├── LICENSE                                   # ISC
├── .gitignore
├── htdocs/                                   # Mapped to /www/ during installation
│   └── luci-static/resources/view/
│       ├── nss/status.js                     # Detailed status page
│       └── status/include/12_nss.js          # Overview NPU utilization panel
├── root/                                     # Mapped to / during installation
│   └── usr/share/
│       ├── luci/menu.d/luci-app-nss.json     # Menu entry: Status → NPU (NSS) Status
│       └── rpcd/acl.d/luci-app-nss.json      # Permission to read debugfs statistics
├── scripts/
│   ├── build-ipk.sh                          # Reproducible package build without the SDK
│   └── install.sh                            # Build + SCP + opkg install
├── tests/
│   ├── run.sh                                # Runs the offline Node.js tests below
│   ├── test-overview-include.js
│   └── test-status-view.js
└── luci-app-nss_1.1.0-1_all.ipk              # Prebuilt package
```

## Installation

### Method 1: Install the prebuilt package from this repository (recommended)

Run these commands on the **router** after copying the package to it:

```sh
# Copy the package from your computer to the router
scp luci-app-nss_1.1.0-1_all.ipk root@192.168.2.1:/tmp/

# Connect to the router and install it
ssh root@192.168.2.1
opkg install /tmp/luci-app-nss_1.1.0-1_all.ipk

# Reload rpcd so it picks up the new ACL
# (rpcd caches /usr/share/rpcd/acl.d at startup)
/etc/init.d/rpcd reload
```

Then **log out of LuCI and log back in** (the menu is cached in the browser
session). You should see NSS utilization on **Status → Overview** and the
detailed page at **Status → NPU (NSS) Status**.

> To upgrade an existing installation, install the new IPK with `opkg install`
> in the same way. Run `opkg list-installed | grep luci-app-nss` to check the
> installed version.

### Method 2: Upload through the LuCI interface

Go to **System → Software → Upload Package…**, select
`luci-app-nss_1.1.0-1_all.ipk`, and upload and install it. Then run
`/etc/init.d/rpcd reload` (or reboot the router).

### Method 3: Install directly from the source tree (without packaging)

```sh
SRC=./                       # Repository root
scp -r "$SRC"/htdocs/. root@192.168.2.1:/www/
scp -r "$SRC"/root/.   root@192.168.2.1:/
ssh root@192.168.2.1 '/etc/init.d/rpcd reload'
```

### One-step installation script

```sh
scripts/install.sh root@192.168.2.1
```

The script builds the IPK, copies it to `/tmp` over SCP, installs it with
`opkg`, and reloads `rpcd`.

### Uninstall

```sh
opkg remove luci-app-nss
```

## Build from source

### Without the SDK (recommended; requires only `tar` and `gzip`)

```sh
scripts/build-ipk.sh
# built: /…/luci-app-nss_1.1.0-1_all.ipk
```

The script maps `htdocs/` to `/www/` and `root/` to `/`, then creates an IPK
in the gzipped-tar format used by `opkg` (`./debian-binary` +
`./control.tar.gz` + `./data.tar.gz`). The build is reproducible: archive
entries are sorted, timestamps and ownership are fixed, and gzip timestamps
are omitted. Building the same source twice produces byte-identical files.

> **Note:** This package targets `opkg` on OpenWrt 24.10 / 25.x. These
> versions of `opkg` do **not** accept the traditional ar-archive IPK format,
> so the script creates a gzipped-tar IPK.

### With the OpenWrt SDK / buildroot

Place the whole directory under `package/luci-app-nss/` (or add it as a
feed), then run:

```sh
make menuconfig      # LuCI → Applications → luci-app-nss
make package/luci-app-nss/compile V=s
```

## Tests

The view logic is tested offline with Node.js. LuCI runtime APIs (`E`, `fs`,
`poll`, `L`, and `baseclass`) are stubbed, so no router is required:

```sh
tests/run.sh          # Requires Node.js
```

- `tests/test-overview-include.js` tests the Overview NPU panel with one core,
  two cores, a missing driver (which should return `null` and hide the
  section), and malformed input.
- `tests/test-status-view.js` tests the detailed page, including unavailable
  rates on the first poll (`—`), rate calculations from counter deltas,
  cumulative values, and rebuilding the drop/error table.

## Data sources

All data is read from existing driver debugfs nodes:

| Data | Path |
| --- | --- |
| NSS core load (Min/Avg/Max, one-second average) | `/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi` |
| NSS module counters (N2H / IPv4 / IPv6 / PPPoE / driver, etc.) | `/sys/kernel/debug/qca-nss-drv/stats/<module>` |
| Number of ECM hardware-accelerated flows | `/sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count`, etc. |
| Per-core memory layout | `/sys/kernel/debug/qca-nss-drv/meminfo/core0` |

Equivalent command-line checks:

```sh
cat /sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi
cat /sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count
```

## Notes and caveats

- `cpu_load_ubi` reports utilization averaged over one second by the driver.
  A low value is **normal and expected**: it indicates that packet
  forwarding is being handled by the NPU rather than by software forwarding
  on the CPU.
- Except for core load, the page's counters are **cumulative since the NSS
  firmware started** (that is, since the router booted). The throughput
  rates are calculated from the difference between consecutive samples.
- Both the menu entry and the detailed page depend on the debugfs read
  permissions granted by `/usr/share/rpcd/acl.d/luci-app-nss.json`. If you
  use a non-root LuCI account, grant that account the `luci-app-nss` ACL
  group.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| **NPU (NSS) Status** is missing from the menu | Log in to LuCI again. If it is still missing, run `/etc/init.d/rpcd reload`; if necessary, restart nginx with `/etc/init.d/nginx restart`. |
| The NPU section is missing from the Overview page | Check whether `ls /sys/kernel/debug/qca-nss-drv/stats/` exists. If it does not, `qca-nss-drv` is not loaded or the platform is unsupported. |
| All page values show `—` | The debugfs files may not be readable due to insufficient permissions. Check the ACL and whether `rpcd` has been reloaded. |
| Verify that the package is installed | `opkg files luci-app-nss` should list four files. |

## Tested environment

- Device: JDCloud RE-CS-07 (IPQ60xx, NSS firmware 11.4)
- Firmware: Kwrt 25.12-SNAPSHOT, kernel 6.12.108
- LuCI: 26.283 (client-side JavaScript, Argon theme)

## License

ISC; see [LICENSE](LICENSE).
