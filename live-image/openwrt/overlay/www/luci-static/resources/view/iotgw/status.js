'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

/*
 * Status » IoGW NG — the web face of the iotgw gateway agent
 * (iotgw-ng decision-032). It shows the same snapshot as the console
 * dashboard (published by `iotgw daemon`) and runs the same actions, through
 * the rpcd exec plugin /usr/libexec/rpcd/iotgw (ubus object "iotgw").
 */

var callStatus  = rpc.declare({ object: 'iotgw', method: 'status' });
var callRefresh = rpc.declare({ object: 'iotgw', method: 'refresh' });
var callPolicy  = rpc.declare({ object: 'iotgw', method: 'set_policy', params: [ 'policy' ] });
var callHold    = rpc.declare({ object: 'iotgw', method: 'hold', params: [ 'enable', 'reason' ] });
var callVPN     = rpc.declare({ object: 'iotgw', method: 'vpn_refresh', params: [ 'otp' ] });
var callSSH     = rpc.declare({ object: 'iotgw', method: 'ssh_refresh', params: [ 'otp', 'force' ] });
var callJob     = rpc.declare({ object: 'iotgw', method: 'job', params: [ 'id' ] });

var COLORS = {
	'HEALTHY': '#1a7f37', 'WARNING': '#9a6700', 'FAILED': '#cf222e',
	'PENDING': '#0969da', 'RUNNING': '#0969da', 'UNKNOWN': '#57606a',
	'NOT CONFIGURED': '#57606a', 'NOT TESTED': '#57606a', 'SKIPPED': '#57606a'
};
var SYMBOL = {
	'HEALTHY': '[+]', 'WARNING': '[!]', 'FAILED': '[X]', 'PENDING': '[.]', 'RUNNING': '[.]',
	'UNKNOWN': '[?]', 'NOT CONFIGURED': '[-]', 'NOT TESTED': '[ ]', 'SKIPPED': '[-]'
};
var RANK = { 'HEALTHY': 0, 'SKIPPED': 1, 'NOT TESTED': 1, 'PENDING': 2, 'RUNNING': 2,
	'UNKNOWN': 3, 'NOT CONFIGURED': 3, 'WARNING': 4, 'FAILED': 5 };

/* Status text is spelled out, so it reads without colour too. */
function badge(st) {
	st = st || 'UNKNOWN';
	return E('span', {
		'style': 'display:inline-block;padding:1px 6px;border-radius:3px;color:#fff;font-weight:bold;font-size:12px;line-height:18px;vertical-align:middle;white-space:nowrap;background:' + (COLORS[st] || '#57606a')
	}, [ (SYMBOL[st] || '[?]') + ' ' + st ]);
}

function worst() {
	var w = 'HEALTHY';
	for (var i = 0; i < arguments.length; i++)
		if (arguments[i] && (RANK[arguments[i]] || 0) > (RANK[w] || 0))
			w = arguments[i];
	return w;
}

function ok(b) { return b ? 'HEALTHY' : 'FAILED'; }

function never(t) { return !t || String(t).indexOf('0001-01-01') === 0; }

function ago(t) {
	if (never(t)) return _('never');
	var s = Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 1000));
	if (s < 90) return _('%ds ago').format(s);
	if (s < 5400) return _('%dm ago').format(Math.round(s / 60));
	return _('%dh ago').format(Math.round(s / 3600));
}

function when(t) { return never(t) ? '-' : new Date(t).toLocaleString(); }

function bytes(n) {
	n = +n || 0;
	var u = [ 'B', 'KiB', 'MiB', 'GiB', 'TiB' ], i = 0;
	while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
	return (i ? n.toFixed(1) : n) + ' ' + u[i];
}

function dash(v) {
	if (Array.isArray(v)) v = v.join(', ');
	return (v == null || v === '') ? '-' : String(v);
}

/* A section with a title, a badge, and label/value rows. */
function panel(title, st, rows) {
	var tbl = E('table', { 'class': 'table' });
	rows.forEach(function(r) {
		if (!r) return;
		tbl.appendChild(E('tr', { 'class': 'tr' }, [
			E('td', { 'class': 'td left', 'style': 'width:30%;font-weight:bold' }, [ r[0] ]),
			E('td', { 'class': 'td left' }, Array.isArray(r[1]) ? r[1] : [ r[1] ])
		]));
	});
	return E('div', { 'class': 'cbi-section' }, [
		E('h3', {}, [ title, ' ', st ? badge(st) : '' ]),
		tbl
	]);
}

function check(c) {
	c = c || {};
	return [ badge(c.Status), ' ', E('small', {}, [ c.Detail || '' ]) ];
}

function probe(p) {
	p = p || {};
	return [ badge(never(p.at) ? 'NOT TESTED' : ok(p.ok)), ' ', E('small', {}, [ p.detail || '' ]) ];
}

function policyText(c) {
	switch (c.Policy) {
	case 'lan': return _('lan — pinned: Internet via the local LAN, no automatic switching');
	case 'vpn': return _('vpn — pinned: Internet via the Netmaker hub, no automatic switching');
	}
	var pref = c.Prefer || 'lan';
	return _('auto — %s preferred, automatic fallback to %s').format(pref, pref == 'lan' ? 'vpn' : 'lan');
}

return view.extend({
	load: function() {
		return L.resolveDefault(callStatus(), {});
	},

	/* ── actions ─────────────────────────────────────────────────────── */

	/* Follow a background job (vpn/ssh refresh, policy switch) until done. */
	watchJob: function(title, res) {
		if (!res || res.error || !res.job) {
			ui.addNotification(null, E('p', [ _('%s failed: %s').format(title, (res && res.error) || _('no reply')) ]), 'danger');
			return Promise.resolve();
		}
		var pre = E('pre', { 'style': 'white-space:pre-wrap;max-height:22em;overflow:auto' }, [ _('Starting…') ]);
		var state = E('p', {}, [ E('em', { 'class': 'spinning' }, [ _('Running…') ]) ]);
		var close = E('button', { 'class': 'btn', 'disabled': true, 'click': ui.hideModal }, [ _('Close') ]);
		ui.showModal(title, [ state, pre, E('div', { 'class': 'right' }, [ close ]) ]);
		var self = this;
		return new Promise(function(resolve) {
			var tick = function() {
				callJob(res.job).then(function(j) {
					dom.content(pre, (j && j.output) || '…');
					if (j && j.running === false) {
						dom.content(state, [ badge(j.rc === 0 ? 'HEALTHY' : 'FAILED'), ' ',
							j.rc === 0 ? _('Done.') : _('Failed (exit %d). Any change that made the gateway worse was rolled back.').format(j.rc) ]);
						close.disabled = false;
						self.refreshNow();
						resolve();
					} else {
						window.setTimeout(tick, 2000);
					}
				}).catch(function() { window.setTimeout(tick, 3000); });
			};
			tick();
		});
	},

	/* Optional one-time code (the UI's device code); empty = derived. */
	askCode: function(title, withForce, go) {
		var code = E('input', { 'class': 'cbi-input-text', 'type': 'text', 'maxlength': 6, 'placeholder': _('optional 6-digit code') });
		var force = E('input', { 'type': 'checkbox' });
		var body = [
			E('p', {}, [ _('Leave the code empty to derive it from the device identity in /etc/config/iotgw. Enter the current code from the platform UI if the derived one is rejected (e.g. the device counter was reset).') ]),
			E('p', {}, [ E('label', {}, [ _('One-time code') + ': ', code ]) ])
		];
		if (withForce)
			body.push(E('p', {}, [ E('label', {}, [ force, ' ', _('Force: re-request even if the current certificate is still valid') ]) ]));
		body.push(E('div', { 'class': 'right' }, [
			E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]), ' ',
			E('button', { 'class': 'btn cbi-button-action', 'click': function() {
				var v = code.value.trim();
				if (v !== '' && !/^[0-9]{6}$/.test(v)) {
					ui.addNotification(null, E('p', [ _('The code must be 6 digits.') ]), 'warning');
					return;
				}
				ui.hideModal();
				go(v, force.checked);
			} }, [ _('Start') ])
		]));
		ui.showModal(title, body);
	},

	handleVPNRefresh: function() {
		var self = this;
		this.askCode(_('Refresh the VPN configuration'), false, function(otp) {
			callVPN(otp).then(function(r) { return self.watchJob(_('VPN refresh'), r); });
		});
	},

	handleSSHRefresh: function() {
		var self = this;
		this.askCode(_('Refresh SSH trust and host certificate'), true, function(otp, force) {
			callSSH(otp, force).then(function(r) { return self.watchJob(_('SSH refresh'), r); });
		});
	},

	handlePolicy: function(sel) {
		var self = this, p = sel.value;
		ui.showModal(_('Internet policy: %s').format(p.toUpperCase()), [
			E('p', {}, [ {
				'auto': _('LAN preferred, automatic fallback to VPN when the LAN has no Internet (default).'),
				'lan': _('Pinned: Internet via the local LAN router, no automatic switching.'),
				'vpn': _('Pinned: Internet via the Netmaker hub, no automatic switching.')
			}[p] ]),
			E('p', {}, [ _('Saved in /etc/config/iotgw (kept across reboots). A switch is verified and rolled back automatically if the gateway loses Internet.') ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]), ' ',
				E('button', { 'class': 'btn cbi-button-apply', 'click': function() {
					ui.hideModal();
					callPolicy(p).then(function(r) { return self.watchJob(_('Internet policy → %s').format(p), r); });
				} }, [ _('Apply') ])
			])
		]);
	},

	handleHold: function(on) {
		var self = this;
		if (!on) {
			return callHold(false, '').then(function() {
				ui.addNotification(null, E('p', [ _('Hold OFF: automatic repair resumed.') ]), 'info');
				self.refreshNow();
			});
		}
		var reason = E('input', { 'class': 'cbi-input-text', 'type': 'text', 'placeholder': _('why (shown on every console)') });
		ui.showModal(_('Put the agent on HOLD?'), [
			E('p', {}, [ _('The iotgw daemon keeps monitoring and recording, but stops changing the network, the Netmaker route, the Internet path, the VPN or SSH on its own — so you can diagnose by hand. It stays on hold across reboots until resumed. Manual actions on this page still work.') ]),
			E('p', {}, [ E('label', {}, [ _('Reason') + ': ', reason ]) ]),
			E('div', { 'class': 'right' }, [
				E('button', { 'class': 'btn', 'click': ui.hideModal }, [ _('Cancel') ]), ' ',
				E('button', { 'class': 'btn cbi-button-negative', 'click': function() {
					ui.hideModal();
					callHold(true, reason.value.trim()).then(function() { self.refreshNow(); });
				} }, [ _('Hold') ])
			])
		]);
	},

	refreshNow: function() {
		var self = this;
		return L.resolveDefault(callRefresh(), {}).then(function() {
			window.setTimeout(function() { self.poll(); }, 2500);
		});
	},

	/* ── rendering ───────────────────────────────────────────────────── */

	poll: function() {
		var self = this;
		return L.resolveDefault(callStatus(), {}).then(function(st) { self.update(st); });
	},

	update: function(st) {
		dom.content(this.body, this.renderBody(st || {}));
	},

	renderBody: function(st) {
		if (!st.available) {
			return [ E('div', { 'class': 'alert-message warning' }, [
				E('h4', {}, [ _('No status from the iotgw agent') ]),
				E('p', {}, [ st.error || _('The rpcd plugin did not answer.') ]),
				E('p', {}, [ _('Start it with: /etc/init.d/iotgw start') ])
			]) ];
		}
		var s = st.snapshot || {}, inst = s.installed || {}, cfg = inst.Config || {}, d = inst.Daemon;
		var out = [];

		if (!st.fresh)
			out.push(E('div', { 'class': 'alert-message warning' }, [
				_('The agent\'s status is %s old — is the iotgw daemon running? (/etc/init.d/iotgw restart)').format(ago(s.updated_at))
			]));

		if (cfg.Hold)
			out.push(E('div', { 'class': 'alert-message warning' }, [
				E('h4', {}, [ _('HOLD — AUTOMATIC REPAIR IS SUSPENDED') ]),
				E('p', {}, [ _('The iotgw daemon is still monitoring and recording, but it will NOT change the network, the Netmaker route, the Internet path, the VPN or SSH on its own. Meant for manual diagnosis; manual actions still work. Changes it would have made are listed under History.') ]),
				E('p', {}, [ E('strong', {}, [ _('Since') + ': ' ]), when(cfg.HoldSince), ' (' + ago(cfg.HoldSince) + ')   ',
					E('strong', {}, [ _('Reason') + ': ' ]), dash(cfg.HoldReason) ]),
				E('button', { 'class': 'btn cbi-button-positive', 'click': ui.createHandlerFn(this, 'handleHold', false) }, [ _('Resume automatic repair') ])
			]));

		out.push(this.renderActions(cfg));
		out.push(E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:0 2%' }, [
			E('div', { 'style': 'flex:1 1 48%;min-width:340px' }, [
				this.renderInstalled(s, inst), this.renderAgent(inst, cfg, d), this.renderNetwork(s.network), this.renderHost(s.host, inst)
			]),
			E('div', { 'style': 'flex:1 1 48%;min-width:340px' }, [
				this.renderVPN(s.vpn), this.renderReach(s.reach), this.renderInternet(s.internet), this.renderPKI(s.pki)
			])
		]));
		out.push(this.renderHistory(d, st.jobs || []));
		out.push(E('p', { 'class': 'right' }, [ E('small', {}, [
			_('Snapshot %s · %s').format(ago(s.updated_at), dash(s.version))
		]) ]));
		return out;
	},

	renderActions: function(cfg) {
		var sel = E('select', { 'class': 'cbi-input-select' }, [
			E('option', { 'value': 'auto' }, [ _('auto (LAN preferred, VPN fallback)') ]),
			E('option', { 'value': 'lan' }, [ _('lan (pinned)') ]),
			E('option', { 'value': 'vpn' }, [ _('vpn (pinned)') ])
		]);
		sel.value = cfg.Policy || 'auto';
		return E('div', { 'class': 'cbi-section' }, [
			E('h3', {}, [ _('Actions') ]),
			E('div', { 'style': 'display:flex;flex-wrap:wrap;gap:.5em;align-items:center' }, [
				E('button', { 'class': 'btn cbi-button', 'click': ui.createHandlerFn(this, 'refreshNow') }, [ _('Refresh now') ]),
				E('span', { 'style': 'margin-left:1em' }, [ _('Internet policy') + ': ' ]), sel,
				E('button', { 'class': 'btn cbi-button-apply', 'click': ui.createHandlerFn(this, function() { return this.handlePolicy(sel); }) }, [ _('Apply') ]),
				E('span', { 'style': 'margin-left:1em' }),
				cfg.Hold
					? E('button', { 'class': 'btn cbi-button-positive', 'click': ui.createHandlerFn(this, 'handleHold', false) }, [ _('Resume automatic repair') ])
					: E('button', { 'class': 'btn cbi-button-negative', 'click': ui.createHandlerFn(this, 'handleHold', true) }, [ _('Hold') ]),
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'handleVPNRefresh') }, [ _('VPN refresh') ]),
				E('button', { 'class': 'btn cbi-button-action', 'click': ui.createHandlerFn(this, 'handleSSHRefresh') }, [ _('SSH refresh') ])
			])
		]);
	},

	renderInstalled: function(s, inst) {
		var vpn = s.vpn || {}, net = s.internet || {}, pki = s.pki || {}, n = s.network || {};
		var miss = [];
		if (!inst.IdentityOK) miss.push(_('device identity'));
		if (!inst.WGConfigured) miss.push(_('VPN config'));
		if (!inst.HostCert) miss.push(_('SSH enrollment'));
		var prov = !miss.length;
		/* installed but not enrolled yet: the normal state until provisioning */
		var notYet = !prov && inst.IdentityOK && inst.WGConfigured;
		var provSt = prov ? 'HEALTHY' : (notYet ? 'NOT CONFIGURED' : 'FAILED');
		var uplink = '-';
		if (n.EgressIface)
			uplink = (n.EgressIface == vpn.Interface) ? _('VPN (%s, via the Netmaker hub)').format(n.EgressIface) : _('LAN (%s)').format(n.EgressIface);
		var inet = net.DNS ? _('DNS %s, IP %s, HTTPS %s').format(net.DNS.Status, net.IP.Status, net.HTTPS.Status) : '';
		var cert = pki.HostIDStatus == 'HEALTHY' && !never(pki.HostCertValidTo) ? _('valid until %s').format(when(pki.HostCertValidTo)) : (pki.HostIDDetail || '');
		return panel(_('Installed'), worst(ok(!inst.ConfigErr), provSt, pki.HostIDStatus, vpn.Status, net.Overall), [
			[ _('Installed'), [ badge(ok(!inst.ConfigErr)), ' ', dash(inst.OS) + (inst.InstalledAt ? _(', installed %s').format(inst.InstalledAt) : '') ] ],
			[ _('Provisioned'), [ badge(provSt), ' ', prov ? _('identity, VPN and SSH enrollment present') : notYet ? _('not yet — SSH enrollment missing: run the provisioning deployment (or SSH refresh)') : _('missing: %s').format(miss.join(', ')) ] ],
			[ _('SSH certificate'), [ badge(pki.HostIDStatus), ' ', cert ] ],
			[ _('VPN'), [ badge(vpn.Status), ' ', vpn.Status == 'HEALTHY' ? _('tunnel up, last handshake %s').format(ago(vpn.LastHandshake)) : (vpn.Detail || '') ] ],
			[ _('Internet'), [ badge(net.Overall), ' ', inet ] ],
			[ _('Active uplink'), uplink ],
			inst.ConfigErr ? [ _('Note'), '/etc/config/iotgw: ' + inst.ConfigErr ] : null
		]);
	},

	renderAgent: function(inst, cfg, d) {
		if (!d)
			return panel(_('Self-healing agent'), 'FAILED', [
				[ _('Daemon'), _('NOT RUNNING — %s').format(dash(inst.DaemonErr)) ],
				[ _('Start it'), '/etc/init.d/iotgw start' ],
				[ _('Internet policy'), policyText(cfg) ]
			]);
		var st = inst.DaemonRunning ? (cfg.Hold ? 'WARNING' : 'HEALTHY') : 'FAILED';
		var ep = d.endpoint || {}, up = d.uplink || {};
		var route = !ep.ip ? _('no endpoint configured')
			: ep.route_ok ? _('via %s dev %s').format(ep.route_via, ep.route_dev)
			: _('WRONG: %s').format(((ep.route_dev || '') + ' ' + (ep.route_via || '')).trim());
		var rows = [
			[ _('Daemon'), inst.DaemonRunning ? _('running (pid %d), last check %s').format(d.pid, ago(d.updated_at)) : _('STOPPED — state last written %s').format(ago(d.updated_at)) ],
			[ _('Automatic repair'), cfg.Hold ? _('OFF — HOLD') : _('ON') ],
			[ _('Internet policy'), policyText(cfg) ],
			[ _('Egress now'), (d.egress || '-').toUpperCase() ],
			[ _('Uplink'), _('%s (%s) via %s').format(dash(up.device), dash(up.iface), dash(up.gateway)) ],
			[ _('Netmaker server'), dash(ep.host) + ':' + dash(ep.port) ],
			[ _('Netmaker route'), [ badge(ep.ip ? ok(ep.route_ok) : 'NOT CONFIGURED'), ' ', route ] ],
			[ _('LAN Internet'), probe(d.lan_internet) ],
			[ _('VPN Internet'), probe(d.vpn_internet) ],
			[ _('Tunnel'), probe(d.handshake) ]
		];
		if (!never(d.backoff_until) && new Date(d.backoff_until) > new Date())
			rows.push([ _('Backoff'), _('after %d failed change(s), until %s').format(d.fail_streak, when(d.backoff_until)) ]);
		if (d.last_error)
			rows.push([ _('Last error'), d.last_error ]);
		return panel(_('Self-healing agent'), st, rows);
	},

	renderVPN: function(v) {
		v = v || {};
		var via = v.InternetVia == 'vpn' ? _('VPN (everything via %s)').format(v.Interface)
			: v.InternetVia == 'lan' ? _('LAN (only %s via %s)').format(dash(v.NetworkCIDR), v.Interface) : '-';
		return panel(_('VPN (WireGuard / Netmaker)'), v.Status, [
			[ _('Internet via'), via ],
			[ _('Interface'), v.Interface ? v.Interface + ' ' + (v.Present ? (v.Up ? 'UP' : 'DOWN') : _('absent')) : '-' ],
			[ _('Address'), dash(v.Addresses) ],
			[ _('Endpoint'), dash(v.Endpoint) ],
			[ _('Last handshake'), ago(v.LastHandshake) ],
			[ _('Transfer'), _('rx %s / tx %s').format(bytes(v.RxBytes), bytes(v.TxBytes)) ],
			[ _('Routes'), dash(v.Routes) ],
			v.Detail ? [ _('Note'), v.Detail ] : null
		]);
	},

	renderReach: function(r) {
		r = r || {};
		return panel(_('VPN server reachability'), r.Status, [
			[ _('Server'), dash(r.Host) ],
			[ _('Resolved'), dash(r.ResolvedIPs) ],
			[ _('Port'), dash(r.Port) + ' ' + dash(r.Protocol) ],
			[ _('DNS'), check(r.DNS) ],
			[ _('Route'), check(r.Route) ],
			[ _('ICMP'), check(r.ICMP) ],
			[ _('WireGuard'), check(r.WireGuard) ],
			[ _('Tested'), ago(r.At) ]
		]);
	},

	renderInternet: function(i) {
		i = i || {};
		return panel(_('Internet'), i.Overall, [
			[ _('DNS'), check(i.DNS) ],
			[ _('IP connectivity'), check(i.IP) ],
			[ _('HTTPS'), check(i.HTTPS) ],
			[ _('Tested'), ago(i.At) ]
		]);
	},

	renderPKI: function(p) {
		p = p || {};
		var fp = function(a) { return (a && a.length) ? a[0] + (a.length > 1 ? ' (+' + (a.length - 1) + ')' : '') : '-'; };
		return panel(_('SSH PKI'), worst(p.UserCAStatus, p.HostCAStatus, p.HostIDStatus, p.SSHDStatus), [
			[ _('Trust domain'), dash(p.Zone) + (p.Domain ? ' (' + _('domain') + ' ' + p.Domain + ')' : '') ],
			[ _('User CA'), [ badge(p.UserCAStatus), ' ', fp(p.UserCAFPs), ' ', E('small', {}, [ p.UserCADetail || (p.UserCATrusted ? _('trusted by sshd') : '') ]) ] ],
			[ _('Principals'), dash(p.Principals) ],
			[ _('Host CA'), [ badge(p.HostCAStatus), ' ', fp(p.HostCAFPs), ' ', E('small', {}, [ p.HostCADetail || '' ]) ] ],
			[ _('Host identity'), [ badge(p.HostIDStatus), ' ', E('small', {}, [ p.HostIDDetail || '' ]) ] ],
			[ _('Host key'), dash(((p.HostKeyType || '') + ' ' + (p.HostKeyFP || '')).trim()) ],
			[ _('Host certificate'), p.HostCertPresent ? _('PRESENT, signed by %s').format(dash(p.HostCertSignedBy)) : _('ABSENT') ],
			[ _('Certificate names'), dash(p.HostPrincipals) ],
			[ _('Valid until'), when(p.HostCertValidTo) ],
			[ _('sshd'), [ badge(p.SSHDStatus), ' ', E('small', {}, [ p.SSHDDetail || '' ]) ] ]
		]);
	},

	renderNetwork: function(n) {
		n = n || {};
		var rows = (n.Ifaces || []).filter(function(i) { return i.Carrier || (i.IPv4 && i.IPv4.length); }).map(function(i) {
			return [ i.Name, [ (i.Carrier ? 'UP ' : 'DOWN ') + dash(i.IPv4) + ' ', E('small', {}, [ (i.MAC || '') + ' ' + (i.Kind || '') ]),
				i.Egress ? E('strong', {}, [ '  ← ' + _('Internet egress') ]) : '' ] ];
		});
		rows.push([ _('Default gateway'), dash(n.DefaultGateway) + (n.DefaultIface ? ' dev ' + n.DefaultIface : '') ]);
		rows.push([ _('Egress to Internet'), dash(((n.EgressIface || '') + ' ' + (n.EgressVia || '')).trim()) ]);
		rows.push([ _('DNS servers'), dash(n.DNS) ]);
		if (n.Detail) rows.push([ _('Note'), n.Detail ]);
		return panel(_('Network'), n.Status, rows);
	},

	renderHost: function(h, inst) {
		h = h || {};
		var disks = (h.Disks || []).map(function(d) { return d.Name + ' ' + bytes(d.SizeBytes) + ' ' + (d.Model || '') + (d.Removable ? ' (' + _('removable') + ')' : ''); });
		return panel(_('Host'), null, [
			[ _('Hostname'), dash(h.Hostname) ],
			[ _('Device'), dash(h.DeviceID) ],
			[ _('CPU'), _('%s (%s, %d CPUs)').format(dash(h.CPUModel), dash(h.Arch), h.CPUs || 0) ],
			[ _('RAM'), bytes(h.MemTotal) ],
			[ _('Kernel'), dash(h.Kernel) ],
			[ _('OS'), dash(h.ImageRelease) ],
			[ _('Storage'), dash(disks) ],
			[ _('API'), dash((inst.Config || {}).APIBase) ],
			[ _('Agent'), dash(h.ToolVersion) ]
		]);
	},

	renderHistory: function(d, jobs) {
		var rows = [];
		jobs.forEach(function(j) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'style': 'white-space:nowrap' }, [ when(j.started) ]),
				E('td', { 'class': 'td left' }, [ badge(j.running ? 'RUNNING' : (j.rc === 0 ? 'HEALTHY' : 'FAILED')) ]),
				E('td', { 'class': 'td left' }, [ E('strong', {}, [ _('manual') + ' ' + j.title + ': ' ]), (j.output || '').trim().split('\n').pop() ])
			]));
		});
		((d && d.events) || []).slice(-15).reverse().forEach(function(e) {
			var st = { 'ok': 'HEALTHY', 'failed': 'FAILED', 'skipped': 'WARNING', 'held': 'WARNING' }[e.result] || 'UNKNOWN';
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'style': 'white-space:nowrap' }, [ when(e.at) ]),
				E('td', { 'class': 'td left' }, [ badge(st) ]),
				E('td', { 'class': 'td left' }, [ E('strong', {}, [ e.kind + ': ' ]), e.text ])
			]));
		});
		var tbl = E('table', { 'class': 'table' }, [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th' }, [ _('When') ]), E('th', { 'class': 'th' }, [ _('Result') ]), E('th', { 'class': 'th' }, [ _('What') ])
			])
		].concat(rows.length ? rows : [ E('tr', { 'class': 'tr' }, [ E('td', { 'class': 'td', 'colspan': 3 }, [ E('em', {}, [ _('No entries yet') ]) ]) ]) ]));
		return E('div', { 'class': 'cbi-section' }, [ E('h3', {}, [ _('History (newest first)') ]), tbl,
			E('p', {}, [ E('small', {}, [ _('Full log: logread -e iotgw') ]) ]) ]);
	},

	render: function(st) {
		this.body = E('div', {});
		this.update(st);
		poll.add(L.bind(this.poll, this), 5);
		return E([], [
			E('h2', {}, [ _('IoGW NG') ]),
			E('div', { 'class': 'cbi-map-descr' }, [
				_('The iotgw gateway agent: management path (Netmaker VPN + route), Internet egress, SSH PKI. The same status as the console dashboard, published by the iotgw daemon; actions are verified and rolled back if the gateway gets worse.')
			]),
			this.body
		]);
	},

	handleSaveApply: null,
	handleSave: null,
	handleReset: null
});
