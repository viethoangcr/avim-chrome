/*
 * Service-worker contract for Task 4: the background script is an MV3
 * classic service worker whose preferences live in chrome.storage.local.
 *
 * The script is loaded in a Node `vm` sandbox with a small chrome mock that
 * records listener registration, storage, badge calls, tab fan-out and
 * per-tab runtime.lastError reads. No browser automation, no dependencies.
 */

'use strict';

var fs = require('fs');
var vm = require('vm');

var BACKGROUND_PATH = './src/chrome/background.js';

var DEFAULT_PREFS = { method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 };

var TAB_IDS = [1, 2];

// Load background.js against a fresh chrome mock. Every storage get merges
// defaults, mirroring chrome.storage.local.get(defaults, callback).
function loadBackground() {
	var listeners = { installed: [], started: [], message: [] };
	var storage = {};
	var badge = { text: null, color: null };
	var queryArg;
	var tabMessages = [];
	var sentErrors = [];
	var lastError = null;
	var lastErrorReads = 0;

	var chrome = {
		storage: { local: {
			get: function(defaults, callback) {
				var result = {};
				Object.keys(defaults).forEach(function(key) {
					result[key] = Object.prototype.hasOwnProperty.call(storage, key) ?
						storage[key] : defaults[key];
				});
				callback(result);
			},
			set: function(values, callback) {
				Object.keys(values).forEach(function(key) {
					storage[key] = values[key];
				});
				if (callback) { callback(); }
			}
		}},
		action: {
			setBadgeText: function(details) { badge.text = details.text; },
			setBadgeBackgroundColor: function(details) { badge.color = details.color; }
		},
		runtime: {
			onInstalled: { addListener: function(fn) { listeners.installed.push(fn); } },
			onStartup: { addListener: function(fn) { listeners.started.push(fn); } },
			onMessage: { addListener: function(fn) { listeners.message.push(fn); } }
		},
		tabs: {
			query: function(queryInfo, callback) {
				queryArg = queryInfo;
				// tabs expose only their id; touching any other property fails
				callback(TAB_IDS.map(function(id) {
					return new Proxy({ id: id }, {
						get: function(target, prop) {
							if (prop !== 'id') {
								throw new Error('tabs.query result accessed non-ID property: ' + String(prop));
							}
							return target[prop];
						}
					});
				}));
			},
			sendMessage: function(tabId, message, callback) {
				tabMessages.push({ tabId: tabId, message: message });
				if (sentErrors.indexOf(tabId) !== -1) {
					lastError = { message: 'Receiving end does not exist.' };
				}
				if (callback) { callback(); }
				lastError = null;
			}
		}
	};

	Object.defineProperty(chrome.runtime, 'lastError', {
		get: function() {
			if (lastError) { lastErrorReads++; }
			return lastError;
		},
		configurable: true
	});

	vm.runInNewContext(fs.readFileSync(BACKGROUND_PATH, 'utf8'), { chrome: chrome });

	return {
		storage: storage,
		badge: badge,
		queryArg: function() { return queryArg; },
		tabMessages: tabMessages,
		sentErrors: sentErrors,
		lastErrorReads: function() { return lastErrorReads; },
		onInstalled: function(reason) {
			listeners.installed.forEach(function(fn) { fn({ reason: reason }); });
		},
		onStartup: function() {
			listeners.started.forEach(function(fn) { fn(); });
		},
		onMessage: function(request) {
			var result = { returned: undefined, response: undefined, responseCount: 0 };
			listeners.message.forEach(function(fn) {
				result.returned = fn(request, {}, function(value) {
					result.response = value;
					result.responseCount++;
				});
			});
			return result;
		},
		_assertListeners: function() {
			expect(listeners.installed.length).toBe(1);
			expect(listeners.started.length).toBe(1);
			expect(listeners.message.length).toBe(1);
		}
	};
}

describe('background service worker (MV3)', function() {

	var env;

	beforeEach(function() {
		env = loadBackground();
	});

	it('registers onInstalled, onStartup and onMessage synchronously', function() {
		env._assertListeners();
	});

	it('writes exactly the four defaults on install', function() {
		env.onInstalled('install');
		expect(env.storage).toEqual(DEFAULT_PREFS);
	});

	it('sets the on badge with green background on install', function() {
		env.onInstalled('install');
		expect(env.badge).toEqual({ text: 'on', color: [0, 255, 0, 255] });
	});

	it('never overwrites stored prefs on update and restores the badge', function() {
		env.storage.method = 3;
		env.storage.onOff = 0;
		env.storage.ckSpell = 0;
		env.storage.oldAccent = 0;
		env.onInstalled('update');
		expect(env.storage).toEqual({ method: 3, onOff: 0, ckSpell: 0, oldAccent: 0 });
		expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
	});

	it('restores the badge from storage on startup, merging defaults', function() {
		env.storage.onOff = 0;
		env.onStartup();
		expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
	});

	it('answers get_prefs with canonical prefs, merging defaults on read', function() {
		env.storage.method = 2;
		var result = env.onMessage({ get_prefs: 'all' });
		expect(result.returned).toBe(true);
		expect(result.responseCount).toBe(1);
		expect(result.response).toEqual({ method: 2, onOff: 1, ckSpell: 1, oldAccent: 1 });
		expect(env.tabMessages.length).toBe(0);
	});

	it('partial save canonicalizes the response and keeps untouched prefs', function() {
		env.onInstalled('install');
		var result = env.onMessage({ save_prefs: 'all', method: 4 });
		expect(result.returned).toBe(true);
		expect(result.responseCount).toBe(1);
		expect(result.response).toEqual({ method: 4, onOff: 1, ckSpell: 1, oldAccent: 1 });
		expect(env.storage).toEqual({ method: 4, onOff: 1, ckSpell: 1, oldAccent: 1 });
	});

	it('rejects malformed field values and answers with the stored prefs', function() {
		var result = env.onMessage({ save_prefs: 'all', method: 9, onOff: 2, ckSpell: 'x', oldAccent: 1.5 });
		expect(result.returned).toBe(true);
		expect(result.response).toEqual(DEFAULT_PREFS);
		expect(env.storage).toEqual({});
	});

	it('accepts only known fields and ignores the rest', function() {
		var result = env.onMessage({ save_prefs: 'all', method: 3, junk: 'x' });
		expect(result.response).toEqual({ method: 3, onOff: 1, ckSpell: 1, oldAccent: 1 });
		expect(Object.keys(env.storage)).toEqual(['method']);
	});

	it('toggle flips onOff, answers canonical prefs and updates the badge', function() {
		env.onInstalled('install');
		var result = env.onMessage({ turn_avim: 'onOff' });
		expect(result.returned).toBe(true);
		expect(result.responseCount).toBe(1);
		expect(result.response).toEqual({ method: 0, onOff: 0, ckSpell: 1, oldAccent: 1 });
		expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
		var again = env.onMessage({ turn_avim: 'onOff' });
		expect(again.response.onOff).toBe(1);
		expect(env.badge).toEqual({ text: 'on', color: [0, 255, 0, 255] });
	});

	it('fan-out queries only tab ids and pushes prefs to every tab', function() {
		env.onInstalled('install');
		var result = env.onMessage({ save_prefs: 'all', onOff: 0 });
		expect(env.queryArg()).toEqual({});
		expect(env.tabMessages.length).toBe(2);
		expect(env.tabMessages[0].tabId).toBe(1);
		expect(env.tabMessages[1].tabId).toBe(2);
		expect(env.tabMessages[0].message).toEqual(result.response);
		expect(env.tabMessages[1].message).toEqual(result.response);
	});

	it('consumes runtime.lastError for every tab delivery', function() {
		env.onInstalled('install');
		env.sentErrors.push(1, 2);
		env.onMessage({ save_prefs: 'all', onOff: 0 });
		expect(env.lastErrorReads()).toBe(2);
	});

	it('leaves unrecognized messages unhandled', function() {
		var result = env.onMessage({ hello: 'world' });
		expect(result.returned).toBeUndefined();
		expect(result.responseCount).toBe(0);
		expect(env.storage).toEqual({});
		expect(env.tabMessages.length).toBe(0);
		expect(env.badge).toEqual({ text: null, color: null });
	});
});
