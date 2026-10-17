'use strict';

/*
 * Functional smoke test for the luci-app-nss view.
 * Stubs the LuCI runtime (E, fs, poll, L, view) and runs load/render/pollOnce
 * with simulated NSS debugfs contents.
 */

const fsNode = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'htdocs/luci-static/resources/view/nss/status.js');

function makeEl(tag, attrs, children) {
	const el = {
		tag: tag,
		attrs: attrs || {},
		style: {},
		children: [],
		_text: '',
		appendChild(c) { this.children.push(c); return c; },
		get textContent() { return this._text; },
		set textContent(v) { this._text = String(v); },
		set innerHTML(v) { if (v === '') this.children = []; }
	};

	if (children != null) {
		const list = Array.isArray(children) ? children : [children];
		for (const c of list)
			if (c != null) el.children.push(c);
	}

	return el;
}

function dump(el, indent) {
	indent = indent || '';
	const text = (el._text || '').trim();
	const own = el.children.filter(c => typeof c === 'string').join(' ').trim();
	const line = [];
	if (text) line.push(JSON.stringify(text));
	if (own) line.push('str=' + JSON.stringify(own));

	if (line.length)
		console.log(indent + (el.tag || '?') + ' -> ' + line.join(' '));

	for (const c of el.children)
		if (c && typeof c === 'object') dump(c, indent + '  ');
}

const DATA = {};
function setData(map) {
	for (const k of Object.keys(map)) DATA[k] = map[k];
}

let now = 1000000;
const sandbox = {
	console: console,
	Promise: Promise,
	Date: { now: () => now },
	Array: Array,
	Object: Object,
	String: String,
	Number: Number,
	Math: Math,
	isNaN: isNaN,
	parseInt: parseInt,
	E: makeEl,
	L: { bind: (fn, self) => fn.bind(self) },
	fs: {
		read: (p) => Promise.resolve(p in DATA ? DATA[p] : null)
	},
	poll: {
		_added: [],
		add(fn, iv) { this._added.push({ fn: fn, iv: iv }); }
	},
	view: { extend: (o) => o }
};

sandbox.globalThis = sandbox;

const src = fsNode.readFileSync(path, 'utf8');
const wrapped = '(function(){\n' + src + '\n})();';

const context = vm.createContext(sandbox);
const view = vm.runInContext(wrapped, context, { filename: 'status.js' });

if (!view || typeof view.load !== 'function' || typeof view.render !== 'function' || typeof view.pollOnce !== 'function')
	throw new Error('view object is missing expected methods');

const load = setData0();

function setData0() {
	setData({
		'/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi':
			'CPU Utilization:\nNote: Averaged over 1 second\n\nCore 0:\nMin\tAvg\tMax\n 4%\t 5%\t 20%\n\n',
		'/sys/kernel/debug/qca-nss-drv/stats/n2h':
			'\tn2h_rx_pkts                       = 1000            common\n' +
			'\tn2h_rx_byts                       = 500000          common\n' +
			'\tn2h_tx_pkts                       = 200             common\n' +
			'\tn2h_tx_byts                       = 100000          common\n' +
			'\tn2h_rx_queue[0]_drops             = 591             drop\n' +
			'\tn2h_queue_drops                   = 0               drop\n',
		'/sys/kernel/debug/qca-nss-drv/stats/ipv4':
			'\tipv4_rx_pkts           = 13829189        common\n' +
			'\tipv4_rx_byts           = 8702955075      common\n' +
			'\tipv4_tx_pkts           = 0               common\n' +
			'\tipv4_tx_byts           = 0               common\n' +
			'\tipv4_rx_queue[0]_drops = 0               drop\n',
		'/sys/kernel/debug/qca-nss-drv/stats/ipv6':
			'\tipv6_rx_pkts           = 5934165         common\n' +
			'\tipv6_rx_byts           = 4534198392      common\n' +
			'\tipv6_tx_pkts           = 36306           common\n' +
			'\tipv6_tx_byts           = 50036515        common\n',
		'/sys/kernel/debug/qca-nss-drv/stats/pppoe':
			'\tpppoe_rx_packets               = 9039917         common\n' +
			'\tpppoe_rx_bytes                 = 7784644609      common\n' +
			'\tpppoe_tx_packets               = 36295           common\n' +
			'\tpppoe_tx_bytes                 = 49298322        common\n' +
			'\tpppoe_rx_dropped[0]            = 0               drop\n',
		'/sys/kernel/debug/qca-nss-drv/stats/drv':
			'\tdrv_nbuf_alloc_errors         = 0               error\n' +
			'\tdrv_tx_queue_full[0]          = 0               error\n' +
			'\tdrv_rx_bad_desciptor          = 7               error\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count': '33\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv4/tcp_accelerated_count': '13\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv4/udp_accelerated_count': '20\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv6/accelerated_count': '4\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv6/tcp_accelerated_count': '2\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv6/udp_accelerated_count': '2\n'
	});
}

(async function() {
	const initial = await view.load();
	console.log('=== initial cpu_load_ubi read ok:', JSON.stringify(initial).slice(0, 40) + '...');

	const node = view.render(initial);
	console.log('=== poll registered:', sandbox.poll._added.length, 'interval:', sandbox.poll._added[0].iv);

	// --- first poll (no rates yet) ---
	await view.pollOnce();
	console.log('\n=== after first poll (no previous sample, rates must be "—") ===');
	dump(node);

	// --- second poll: counters advance by known amounts over 2 simulated seconds ---
	now += 2000;
	setData({
		'/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi':
			'CPU Utilization:\nNote: Averaged over 1 second\n\nCore 0:\nMin\tAvg\tMax\n 40%\t 55%\t 99%\n\n',
		'/sys/kernel/debug/qca-nss-drv/stats/n2h':
			'\tn2h_rx_pkts                       = 3000            common\n' +
			'\tn2h_rx_byts                       = 1500000         common\n' +
			'\tn2h_tx_pkts                       = 400             common\n' +
			'\tn2h_tx_byts                       = 200000          common\n',
		'/sys/kernel/debug/ecm/ecm_nss_ipv4/accelerated_count': '40\n'
	});

	await view.pollOnce();
	console.log('\n=== after second poll (2s later: +2000 pkts, +1 MiB rx -> 1000 pkt/s, 512 KiB/s) ===');
	dump(node);

	await view.pollOnce();
	console.log('\n=== after third poll (no counter change -> rates should drop to 0) ===');
	dump(node);
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
