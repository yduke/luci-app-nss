# luci-app-nss

Qualcomm **NSS**(Network Subsystem)状态查看插件 —— NSS 是 IPQ60xx / IPQ807x
(qualcommax)路由器里那颗专门做网络转发的协处理器,也就是通常所说的“NPU”。

插件不修改任何配置、不写入任何 NSS 寄存器,只**读取** `qca-nss-drv` 与
`qca-nss-ecm` 内核模块通过 debugfs 暴露的统计数据。

**注意：**
本插件目前仅在 京东云太乙 Kwrt 25.12 测试通过，其他硬件不支持，其他系统未进行过测试，安装风险自担。

## 功能

| 位置 | 内容 |
| --- | --- |
| **状态 → 概览**(CPU 使用率下方) | NPU 使用率,表格 + `cbi-progressbar`,格式与 CPU 面板一致,按 NSS 核心逐行显示 |
| **状态 → NPU (NSS) 状态** | 详细页:核心负载(带最低/最高水位)、ECM 硬件加速流(IPv4/IPv6、TCP/UDP)、NSS 模块实时吞吐(N2H / IPv4 / IPv6 / PPPoE)、非零的 drop / error 计数器 |

概览页那一段之所以能直接插在 CPU 下面,是因为 LuCI 的概览页会**动态扫描**
`/www/luci-static/resources/view/status/include/` 并按文件名顺序加载其中的 `*.js`,
本包放进去的文件名是 `12_nss.js`,所以自然排在 `11_cpu.js` 之后 —— 没有覆盖或
修改任何 LuCI 自带文件,固件升级后不会被冲掉。

在不具备 NSS 的平台(或 `qca-nss-drv` 未加载)上,概览页那一节会自动隐藏。

## 目录结构

```
.
├── Makefile                                  # OpenWrt buildroot / SDK 用
├── README.md
├── LICENSE                                   # ISC
├── .gitignore
├── htdocs/                                   # 安装时映射到 /www/
│   └── luci-static/resources/view/
│       ├── nss/status.js                     # 详细状态页
│       └── status/include/12_nss.js          # 概览页 NPU 使用率
├── root/                                     # 安装时映射到 /
│   └── usr/share/
│       ├── luci/menu.d/luci-app-nss.json     # 菜单项:状态 → NPU (NSS) 状态
│       └── rpcd/acl.d/luci-app-nss.json      # debugfs 读取权限
├── scripts/
│   ├── build-ipk.sh                          # 免 SDK 打包(可复现构建)
│   └── install.sh                            # 构建 + scp + opkg install
├── tests/
│   ├── run.sh                                # 运行下面的 node 离线测试
│   ├── test-overview-include.js
│   └── test-status-view.js
└── luci-app-nss_1.1.0-1_all.ipk              # 预编译安装包
```

## 安装方法

### 方法一:直接安装仓库里的 ipk(推荐)

在**路由器**上执行(把 ipk 传到路由器后):

```sh
# 从本机传到路由器
scp luci-app-nss_1.1.0-1_all.ipk root@192.168.2.1:/tmp/

# 在路由器上安装
ssh root@192.168.2.1
opkg install /tmp/luci-app-nss_1.1.0-1_all.ipk

# 让 rpcd 重新加载 ACL(rpcd 在启动时缓存 /usr/share/rpcd/acl.d)
/etc/init.d/rpcd reload
```

然后**退出 LuCI 重新登录**(菜单在浏览器会话里有缓存),即可在
「状态 → 概览」看到 NPU 使用率,在「状态 → NPU (NSS) 状态」看到详细页。

> 已经装过旧版本时,同样用 `opkg install` 安装新 ipk 即为升级;
> `opkg list-installed | grep luci-app-nss` 可查看已装版本。

### 方法二:LuCI 界面上传

「系统 → 软件包 → 上传软件包…」选择 `luci-app-nss_1.1.0-1_all.ipk`,
上传并安装,然后执行 `/etc/init.d/rpcd reload`(或重启路由器)。

### 方法三:源码目录直接安装(不打包)

```sh
SRC=./                       # 本仓库根目录
scp -r $SRC/htdocs/. root@192.168.2.1:/www/
scp -r $SRC/root/.   root@192.168.2.1:/
ssh root@192.168.2.1 '/etc/init.d/rpcd reload'
```

### 一键脚本

```sh
scripts/install.sh root@192.168.2.1
```

会依次执行:构建 ipk → scp 到 `/tmp` → `opkg install` → `rpcd reload`。

### 卸载

```sh
opkg remove luci-app-nss
```

## 从源码构建

### 免 SDK(推荐,只用 tar/gzip)

```sh
scripts/build-ipk.sh
# built: /…/luci-app-nss_1.1.0-1_all.ipk
```

脚本把 `htdocs/` 映射到 `/www/`、`root/` 映射到 `/`,生成 opkg 使用的
gzipped-tar 形式的 ipk(`./debian-binary` + `./control.tar.gz` + `./data.tar.gz`);
构建是可复现的(条目排序、mtime/uid/gid 固定、gzip 不带时间戳),
同样源码构建两次得到的文件逐字节相同。

> 注意:本包面向 OpenWrt 24.10 / 25.x 的 opkg。这类 opkg **不接受**传统的
> ar 归档 ipk,所以脚本生成的是 gzipped-tar 形式。

### 用 OpenWrt SDK / buildroot

把整个目录放进 `package/luci-app-nss/`(或做一个 feed),然后:

```sh
make menuconfig      # LuCI → Applications → luci-app-nss
make package/luci-app-nss/compile V=s
```

## 测试

两个视图的逻辑用 node 做了离线测试(LuCI 运行时 `E` / `fs` / `poll` / `L` /
`baseclass` 用桩件替代,不需要路由器):

```sh
tests/run.sh          # 需要 node
```

- `tests/test-overview-include.js`:概览页 NPU 面板,覆盖单核、双核、驱动缺失
  (应返回 `null` 从而隐藏该节)、内容异常四种情况;
- `tests/test-status-view.js`:详细页,覆盖首轮无速率(`—`)、计数器变化后的
  速率换算、累计值、drop/error 表重建。

## 数据来源

全部来自驱动已有的 debugfs 节点,只读:

| 数据 | 路径 |
| --- | --- |
| NSS 核心负载(Min/Avg/Max,1 秒均值) | `/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi` |
| NSS 模块计数(N2H / IPv4 / IPv6 / PPPoE / drv …) | `/sys/kernel/debug/qca-nss-drv/stats/<模块>` |
| ECM 硬件加速流数量 | `/sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count` 等 |
| 各模块内存布局 | `/sys/kernel/debug/qca-nss-drv/meminfo/core0` |

命令行等价查看:

```sh
cat /sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi
cat /sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count
```

## 说明与注意事项

- `cpu_load_ubi` 是驱动给出的 1 秒平均占用率。数值低是**正常且期望**的:
  说明转发确实在 NPU 上完成,而不是 CPU 软转发。
- 除核心负载外,页面上的计数都是**自 NSS 固件启动(即路由器开机)以来的累计值**;
  “吞吐”一栏的速率是相邻两次采样的差值。
- 菜单项与详情页都依赖 `/usr/share/rpcd/acl.d/luci-app-nss.json` 授予的
  debugfs 读取权限;若使用非 root 的 LuCI 账号,需要为该账号授予
  `luci-app-nss` ACL 组。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 菜单里看不到「NPU (NSS) 状态」 | 重新登录 LuCI;仍不行则 `/etc/init.d/rpcd reload`,必要时 `/etc/init.d/nginx restart` |
| 概览页没有 NPU 那一节 | `ls /sys/kernel/debug/qca-nss-drv/stats/` 是否存在;不存在说明 `qca-nss-drv` 未加载或平台不支持 |
| 页面数值全是「—」 | 该 debugfs 文件不可读(权限不足),检查 ACL 与 `rpcd` 是否已 reload |
| 想确认已经装好 | `opkg files luci-app-nss` 应列出 4 个文件 |

## 已验证环境

- 设备:JDCloud RE-CS-07(IPQ60xx,NSS 固件 11.4)
- 固件:Kwrt 25.12-SNAPSHOT,内核 6.12.108
- LuCI:26.283(client-side JS,主题 argon)

## License

ISC,见 [LICENSE](LICENSE)。
