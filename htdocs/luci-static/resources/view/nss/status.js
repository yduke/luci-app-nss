'use strict';
'require view';
'require fs';
'require poll';

/*
 * NPU (Qualcomm NSS) status page.
 *
 * Reads the statistics the qca-nss-drv and qca-nss-ecm kernel modules expose
 * through debugfs.  Everything below is cumulative since the NSS firmware
 * was booted, except the CPU utilisation values which are averaged over one
 * second by the driver itself.
 */

var STATS_DIR = '/sys/kernel/debug/qca-nss-drv/stats';
var ECM_DIR = '/sys/kernel/debug/ecm';

var MODULES = [
	{ id: 'n2h',   title: 'N2H 主机通道', rx: 'n2h_rx_pkts',     rxBytes: 'n2h_rx_byts',     tx: 'n2h_tx_pkts',     txBytes: 'n2h_tx_byts' },
	{ id: 'ipv4',  title: 'IPv4 加速',    rx: 'ipv4_rx_pkts',    rxBytes: 'ipv4_rx_byts',    tx: 'ipv4_tx_pkts',    txBytes: 'ipv4_tx_byts' },
	{ id: 'ipv6',  title: 'IPv6 加速',    rx: 'ipv6_rx_pkts',    rxBytes: 'ipv6_rx_byts',    tx: 'ipv6_tx_pkts',    txBytes: 'ipv6_tx_byts' },
	{ id: 'pppoe', title: 'PPPoE 加速',   rx: 'pppoe_rx_packets', rxBytes: 'pppoe_rx_bytes', tx: 'pppoe_tx_packets', txBytes: 'pppoe_tx_bytes' }
];

var ECM_FAMILIES = [
	{
		id: 'ipv4',
		title: 'IPv4',
		dir: ECM_DIR + '/ecm_nss_ipv4',
		counters: [ 'accelerated_count', 'tcp_accelerated_count', 'udp_accelerated_count' ]
	},
	{
		id: 'ipv6',
		title: 'IPv6',
		dir: ECM_DIR + '/ecm_nss_ipv6',
		counters: [ 'accelerated_count', 'tcp_accelerated_count', 'udp_accelerated_count' ]
	}
];

function fmtBytes(v) {
	if (v == null || isNaN(v))
		return '—';

	var units = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ], i = 0;

	while (v >= 1024 && i < units.length - 1) {
		v /= 1024;
		i++;
	}

	return (i === 0 ? v.toFixed(0) : v.toFixed(v < 10 ? 2 : 1)) + ' ' + units[i];
}

function fmtCount(v) {
	if (v == null || isNaN(v))
		return '—';

	return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtPps(v) {
	return v == null ? '—' : fmtCount(Math.round(v));
}

function fmtBps(v) {
	return v == null ? '—' : fmtBytes(v);
}

function setText(el, text) {
	if (el && el.textContent !== text)
		el.textContent = text;
}

/* Parse "name = value  tag" lines, keeping the first (common) occurrence. */
function parseStats(text) {
	var out = {};

	if (typeof(text) !== 'string')
		return out;

	text.split('\n').forEach(function(line) {
		var m = line.match(/^\s*([A-Za-z0-9_\[\]-]+)\s*=\s*(\d+)\s+(\S+)\s*$/);

		if (m && !(m[1] in out))
			out[m[1]] = { value: +m[2], tag: m[3] };
	});

	return out;
}

function statValue(stats, name) {
	return (name in stats) ? stats[name].value : null;
}

/* Parse the cpu_load_ubi report: one Min/Avg/Max triple per NSS core. */
function parseLoad(text) {
	var cores = [], cur = null;

	if (typeof(text) !== 'string')
		return cores;

	text.split('\n').forEach(function(line) {
		var m = line.match(/^\s*Core\s+(\d+)\s*:/i);

		if (m) {
			cur = { id: +m[1], min: null, avg: null, max: null };
			cores.push(cur);
			return;
		}

		if (!cur)
			return;

		m = line.match(/^\s*(\d+)%\s+(\d+)%\s+(\d+)%/);

		if (m) {
			cur.min = +m[1];
			cur.avg = +m[2];
			cur.max = +m[3];
		}
	});

	return cores;
}

return view.extend({
	load: function() {
		return fs.read(STATS_DIR + '/cpu_load_ubi').catch(function() {
			return null;
		});
	},

	render: function(loadText) {
		var self = this;

		this.prev = null;
		this.coreEls = [];
		this.modEls = {};
		this.ecmEls = {};
		this.errEls = {};

		var coresBody = E('div', { 'class': 'nss-cores' });
		var modBody = E('tbody');
		var ecmBody = E('tbody');
		var errBody = E('tbody');

		MODULES.forEach(function(mod) {
			var els = {
				rxPps: E('span', {}, '—'),
				rxBps: E('span', {}, '—'),
				txPps: E('span', {}, '—'),
				txBps: E('span', {}, '—'),
				rxTotal: E('span', {}, '—')
			};

			modBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'data-title': '模块' }, mod.title),
				E('td', { 'class': 'td', 'data-title': '接收速率' }, [ els.rxPps, E('br'), els.rxBps ]),
				E('td', { 'class': 'td', 'data-title': '发送速率' }, [ els.txPps, E('br'), els.txBps ]),
				E('td', { 'class': 'td', 'data-title': '累计接收包' }, els.rxTotal)
			]));

			self.modEls[mod.id] = els;
		});

		ECM_FAMILIES.forEach(function(fam) {
			var els = {
				total: E('span', {}, '—'),
				tcp: E('span', {}, '—'),
				udp: E('span', {}, '—')
			};

			ecmBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td', 'data-title': '协议' }, fam.title),
				E('td', { 'class': 'td', 'data-title': '加速流总数' }, els.total),
				E('td', { 'class': 'td', 'data-title': 'TCP 流' }, els.tcp),
				E('td', { 'class': 'td', 'data-title': 'UDP 流' }, els.udp)
			]));

			self.ecmEls[fam.id] = els;
		});

		var node = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, 'NPU (NSS) 状态'),
			E('div', { 'class': 'cbi-map-descr' }, [
				'高通 NSS (Network Subsystem) 网络协处理器 —— 即通常所说的“NPU” —— 的运行状态。',
				'数据直接读取自 ', E('code', {}, '/sys/kernel/debug/qca-nss-drv/'),
				' 与 ', E('code', {}, '/sys/kernel/debug/ecm/'), '，每 2 秒自动刷新。'
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'NSS 核心负载'),
				E('div', { 'class': 'cbi-section-descr' }, '驱动内核模块给出的 1 秒平均占用率。'),
				coresBody
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '硬件加速流 (ECM)'),
				E('div', { 'class': 'cbi-section-descr' }, '当前被 NSS 硬件接管的连接数。'),
				E('table', { 'class': 'table' }, [
					E('thead', {}, E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, '协议'),
						E('th', { 'class': 'th' }, '加速流总数'),
						E('th', { 'class': 'th' }, 'TCP 流'),
						E('th', { 'class': 'th' }, 'UDP 流')
					])),
					ecmBody
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, 'NSS 模块吞吐'),
				E('div', { 'class': 'cbi-section-descr' }, '速率为相邻两次采样的差值；累计值为 NSS 固件启动以来的总数。'),
				E('table', { 'class': 'table' }, [
					E('thead', {}, E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, '模块'),
						E('th', { 'class': 'th' }, '接收速率'),
						E('th', { 'class': 'th' }, '发送速率'),
						E('th', { 'class': 'th' }, '累计接收包')
					])),
					modBody
				])
			]),

			E('div', { 'class': 'cbi-section' }, [
				E('h3', {}, '异常 / 丢弃计数'),
				E('div', { 'class': 'cbi-section-descr' }, '仅列出非零的 drop / error 计数器，累计自 NSS 启动以来。'),
				E('table', { 'class': 'table' }, [
					E('thead', {}, E('tr', { 'class': 'tr table-titles' }, [
						E('th', { 'class': 'th' }, '来源'),
						E('th', { 'class': 'th' }, '计数器'),
						E('th', { 'class': 'th' }, '数值')
					])),
					errBody
				])
			])
		]);

		this.refs = { coresBody: coresBody, errBody: errBody };
		this.errEmpty = E('tr', { 'class': 'tr' }, E('td', { 'class': 'td', 'colspan': 3 }, '无异常计数'));
		errBody.appendChild(this.errEmpty);

		this.updateLoad(loadText);
		poll.add(L.bind(this.pollOnce, this), 2);

		return node;
	},

	pollOnce: function() {
		var self = this;
		var defs = [ { name: 'load', path: STATS_DIR + '/cpu_load_ubi' } ];

		MODULES.forEach(function(mod) {
			defs.push({ name: 'mod:' + mod.id, path: STATS_DIR + '/' + mod.id });
		});

		defs.push({ name: 'mod:drv', path: STATS_DIR + '/drv' });

		ECM_FAMILIES.forEach(function(fam) {
			fam.counters.forEach(function(c) {
				defs.push({ name: 'ecm:' + fam.id + ':' + c, path: fam.dir + '/' + c });
			});
		});

		return Promise.all(defs.map(function(d) {
			return fs.read(d.path).catch(function() {
				return null;
			});
		})).then(function(res) {
			var data = {};

			defs.forEach(function(d, i) {
				data[d.name] = res[i];
			});

			self.update(data);
		});
	},

	update: function(data) {
		var self = this;
		var now = Date.now();
		var dt = this.prev ? (now - this.prev.t) / 1000 : 0;
		var stats = {};

		this.updateLoad(data['load']);

		MODULES.forEach(function(mod) {
			stats[mod.id] = parseStats(data['mod:' + mod.id]);
		});

		stats['drv'] = parseStats(data['mod:drv']);

		MODULES.forEach(function(mod) {
			var els = self.modEls[mod.id];
			var st = stats[mod.id];
			var available = (data['mod:' + mod.id] != null);
			var rx = available ? statValue(st, mod.rx) : null;
			var rxB = available ? statValue(st, mod.rxBytes) : null;
			var tx = available ? statValue(st, mod.tx) : null;
			var txB = available ? statValue(st, mod.txBytes) : null;
			var prev = self.prev ? self.prev.mods[mod.id] : null;

			setText(els.rxTotal, fmtCount(rx));

			if (dt > 0 && prev && prev.rx != null && rx != null) {
				setText(els.rxPps, fmtPps((rx - prev.rx) / dt) + ' pkt/s');
				setText(els.rxBps, fmtBps((rxB - prev.rxB) / dt) + '/s');
				setText(els.txPps, fmtPps((tx - prev.tx) / dt) + ' pkt/s');
				setText(els.txBps, fmtBps((txB - prev.txB) / dt) + '/s');
			}
			else if (prev === null && dt > 0) {
				/* first pass after the initial render: rates are not known yet */
			}
		});

		ECM_FAMILIES.forEach(function(fam) {
			var els = self.ecmEls[fam.id];
			var read = function(c) {
				var txt = data['ecm:' + fam.id + ':' + c];
				var v = (txt != null) ? parseInt(txt, 10) : null;
				return (v == null || isNaN(v)) ? null : v;
			};

			setText(els.total, fmtCount(read('accelerated_count')));
			setText(els.tcp, fmtCount(read('tcp_accelerated_count')));
			setText(els.udp, fmtCount(read('udp_accelerated_count')));
		});

		this.updateErrors(stats);

		this.prev = {
			t: now,
			mods: (function() {
				var o = {};

				MODULES.forEach(function(mod) {
					var st = stats[mod.id];
					var available = (data['mod:' + mod.id] != null);

					o[mod.id] = {
						rx: available ? statValue(st, mod.rx) : null,
						rxB: available ? statValue(st, mod.rxBytes) : null,
						tx: available ? statValue(st, mod.tx) : null,
						txB: available ? statValue(st, mod.txBytes) : null
					};
				});

				return o;
			})()
		};
	},

	updateLoad: function(text) {
		var cores = parseLoad(text);
		var self = this;

		if (!cores.length) {
			if (!this.coreEls.length)
				this.refs.coresBody.appendChild(E('div', {}, '无法读取 NSS 负载统计（qca-nss-drv 未加载？）'));
			return;
		}

		while (this.coreEls.length < cores.length) {
			var idx = this.coreEls.length;
			var els = {
				bar: E('div', { 'style': 'height:100%;width:0%;background:#3c8dbc;transition:width .3s' }),
				value: E('span', {}, ''),
				range: E('span', { 'class': 'cbi-section-descr' }, '')
			};

			this.refs.coresBody.appendChild(E('div', { 'style': 'margin:.5em 0' }, [
				E('div', { 'style': 'margin-bottom:.25em' }, [
					E('strong', {}, 'NSS Core ' + idx + '：'),
					els.value
				]),
				E('div', { 'style': 'height:12px;background:rgba(128,128,128,.25);border-radius:6px;overflow:hidden' }, els.bar),
				els.range
			]));

			this.coreEls.push(els);
		}

		cores.forEach(function(core, i) {
			var els = self.coreEls[i];
			var avg = (core.avg != null) ? core.avg : 0;
			var color = avg >= 80 ? '#d9534f' : (avg >= 50 ? '#f0ad4e' : '#3c8dbc');

			els.bar.style.width = Math.min(avg, 100) + '%';
			els.bar.style.background = color;
			setText(els.value, avg + '%（1 秒均值）');
			setText(els.range, '区间：最低 ' + (core.min != null ? core.min : '—') + '% / 最高 ' + (core.max != null ? core.max : '—') + '%');
		});
	},

	updateErrors: function(stats) {
		var self = this;
		var rows = [];

		var push = function(source, name, entry) {
			if (entry.value > 0 && (entry.tag === 'drop' || entry.tag === 'error' || entry.tag === 'exception'))
				rows.push({ source: source, name: name, value: entry.value });
		};

		Object.keys(stats).forEach(function(src) {
			Object.keys(stats[src]).forEach(function(name) {
				push(src, name, stats[src][name]);
			});
		});

		this.errEls = {};

		if (!rows.length) {
			if (!this.errBodyEmptyShown) {
				this.refs.errBody.innerHTML = '';
				this.refs.errBody.appendChild(this.errEmpty);
				this.errBodyEmptyShown = true;
			}
			return;
		}

		this.errBodyEmptyShown = false;
		this.refs.errBody.innerHTML = '';

		rows.slice(0, 20).forEach(function(r) {
			self.refs.errBody.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td' }, r.source),
				E('td', { 'class': 'td' }, r.name),
				E('td', { 'class': 'td' }, fmtCount(r.value))
			]));
		});
	},

	handleSave: null,
	handleSaveApply: null,
	handleReset: null
});
