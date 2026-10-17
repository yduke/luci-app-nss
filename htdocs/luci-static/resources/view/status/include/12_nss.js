'use strict';
'require baseclass';
'require fs';

/*
 * Status page ("Overview") section: NPU / Qualcomm NSS utilisation.
 *
 * The Overview page loads every *.js file found in
 *   /www/luci-static/resources/view/status/include
 * in alphabetical order and calls load() / render() on each of them.  This
 * file is therefore picked up automatically and shows up directly below the
 * CPU section (11_cpu.js) thanks to its "12_" prefix -- no stock LuCI file is
 * patched, which keeps the package upgrade safe.
 *
 * Layout and the progressbar helper are intentionally identical to
 * 11_cpu.js so both sections look the same.
 */

var LOAD_STATS = '/sys/kernel/debug/qca-nss-drv/stats/cpu_load_ubi';

function progressbar(value, max) {
	var vn = parseInt(value) || 0, mn = parseInt(max) || 100,
	    pc = Math.floor((100 / mn) * vn);

	return E('div', { 'class': 'cbi-progressbar', 'title': '%s%% / %s%%'.format(vn, mn) },
		E('div', { 'style': 'width:%.2f%%'.format(pc) }));
}

/*
 * Parse the driver report
 *   Core 0:
 *   Min	Avg	Max
 *    4%	 5%	20%
 * into [ { id: 0, min: 4, avg: 5, max: 20 }, ... ] (one entry per NSS core).
 */
function parseUsage(text) {
	var cores = [], cur = null;

	if (typeof(text) !== 'string')
		return cores;

	text.replace(/\r/g, '').split('\n').forEach(function(line) {
		var m = line.match(/^\s*Core\s+(\d+)\s*:/i);

		if (m) {
			cur = { id: +m[1], min: null, avg: null, max: null };
			cores.push(cur);
			return;
		}

		if (cur == null)
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

return baseclass.extend({
	title: _('NPU'),

	load: function() {
		/* L.resolveDefault() swallows read errors and yields null, which
		 * render() turns into a hidden section. */
		return L.resolveDefault(fs.read(LOAD_STATS), null);
	},

	render: function(text) {
		var cores = parseUsage(text);

		/*
		 * No debugfs node -> not an NSS capable platform, or the driver is
		 * not loaded.  Returning null makes the Overview page hide this
		 * section instead of showing an empty box.
		 */
		if (!cores.length)
			return null;

		var table = E('table', { 'class': 'table cpu' });

		cores.forEach(function(core) {
			table.appendChild(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'width': '33%' },
					[ 'NSS Core ' + core.id ]),
				E('td', { 'class': 'td left' },
					[ (core.avg != null) ? progressbar(core.avg, 100) : '?' ])
			]));
		});

		return table;
	}
});
