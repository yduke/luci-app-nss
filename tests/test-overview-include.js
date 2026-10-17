'use strict';

/*
 * Functional smoke test for the Overview include module (12_nss.js).
 * Stubs the LuCI runtime (baseclass, fs, L, E, _) and checks that the
 * cpu_load_ubi report is turned into the expected table markup.
 */

const fsNode = require('fs');
const vm = require('vm');
const path = require('path').join(__dirname, '..', 'htdocs/luci-static/resources/view/status/include/12_nss.js');

/* LuCI extends String.prototype with .format() */
if (!String.prototype.format) {
	String.prototype.format = function () {
		const args = arguments;
		return this.replace(/%s|%%|%d/g, (m) => m === '%%' ? '%'
			: (m === '%d' ? parseInt(args.shift()) : args.shift()));
	};
}

function makeEl(tag, attrs, children) {
	const el = {
		tag: tag, attrs: attrs || {}, style: {}, children: [], _text: '',
		appendChild(c) { this.children.push(c); return c; },
		get textContent() { return this._text; },
		set textContent(v) { this._text = String(v); }
	};
	if (children != null)
		(Array.isArray(children) ? children : [children]).forEach(c => { if (c != null) el.children.push(c); });
	return el;
}

function dump(el, indent) {
	indent = indent || '';
	const own = el.children.filter(c => typeof c === 'string').join(' ').trim();
	let line = (el.tag || '?');
	if (Object.keys(el.attrs).length) line += ' ' + JSON.stringify(el.attrs);
	if (el.style && Object.keys(el.style).length) line += ' style=' + JSON.stringify(el.style);
	if (own) line += ' text=' + JSON.stringify(own);
	console.log(indent + line);
	for (const c of el.children)
		if (c && typeof c === 'object') dump(c, indent + '  ');
}

function loadModule(data) {
	const sandbox = {
		console: console, Promise: Promise, parseInt: parseInt, Math: Math, Array: Array, Object: Object,
		E: makeEl,
		_: (s) => s,
		L: { resolveDefault: (v, d) => Promise.resolve(v).catch(() => d) },
		fs: { read: (p) => (p in data ? Promise.resolve(data[p]) : Promise.reject(new Error('ENOENT'))) },
		baseclass: { extend: (o) => o }
	};
	sandbox.globalThis = sandbox;
	const context = vm.createContext(sandbox);

	/* LuCI provides String.prototype.format inside the page realm */
	vm.runInContext(
		'String.prototype.format = function() {' +
		'  var args = Array.prototype.slice.call(arguments);' +
		'  return this.replace(/%([-+ #0]*(?:\\d+)?(?:\\.\\d+)?)([sdjf%])/g, function(m, spec, f) {' +
		'    if (f == "%") return "%";' +
		'    var v = args.shift();' +
		'    if (f == "d" || spec) return v == null ? m : (f == "f" || spec ? String(parseFloat(v).toFixed(parseInt((spec.match(/\\.(\\d+)/)||[0,0])[1]))) : parseInt(v));' +
		'    if (f == "j") return JSON.stringify(v);' +
		'    return v;' +
		'  });' +
		'};', context);

	const src = fsNode.readFileSync(path, 'utf8');
	return vm.runInContext('(function(){\n' + src + '\n})();', context, { filename: '12_nss.js' });
}

const PATH = '/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi';

(async function() {
	// --- normal single-core device (contents as found on the router) ---
	let mod = loadModule({
		[PATH]: 'CPU Utilization:\nNote: Averaged over 1 second\n\nCore 0:\nMin\tAvg\tMax\n 4%\t 5%\t 20%\n\n'
	});
	console.log('title =', JSON.stringify(mod.title));
	let res = await mod.load();
	console.log('load() ->', JSON.stringify(res).slice(0, 44) + '...');
	console.log('render() ->');
	dump(mod.render(res));

	// --- two NSS cores ---
	mod = loadModule({
		[PATH]: 'CPU Utilization:\nNote: Averaged over 1 second\n\nCore 0:\nMin\tAvg\tMax\n 4%\t 5%\t 20%\n\nCore 1:\nMin\tAvg\tMax\n 90%\t 97%\t 100%\n\n'
	});
	console.log('\n=== two cores ===');
	dump(mod.render(await mod.load()));

	// --- driver missing / path unreadable -> section must hide (null) ---
	mod = loadModule({});
	console.log('\n=== driver missing ===');
	console.log('load() ->', await mod.load());
	console.log('render() ->', mod.render(null));

	// --- garbage content must not throw ---
	mod = loadModule({ [PATH]: 'garbage\nwithout any core data\n' });
	console.log('\n=== garbage content ===');
	console.log('render() ->', mod.render(await mod.load()));
})().catch(e => { console.error('TEST FAILED:', e); process.exit(1); });
