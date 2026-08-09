/*
 * Service-worker contract for Task 3.3: the background script is an MV3
 * classic service worker whose preferences live in chrome.storage.local.
 *
 * The COMPILED script (build/chrome/background.js, esbuild output of the
 * TypeScript source) is loaded in a Node `vm` sandbox against a
 * promise-returning chrome mock that records listener registration, storage,
 * badge calls and tab fan-out. No browser automation, no dependencies.
 */

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.resolve(__dirname, '..');
var BACKGROUND_PATH = path.join('build', 'chrome', 'background.js');

var DEFAULT_PREFS = { method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 };

var TAB_IDS = [1, 2];

var unhandledRejections = [];

function recordUnhandled(reason) {
	unhandledRejections.push(reason);
}

// Flush the microtask queue (and a macrotask) so promise-based handlers and
// sendResponse callbacks have run.
function flush() {
	return new Promise(function(resolve) { setTimeout(resolve, 0); });
}

// Load the compiled worker against a fresh chrome mock. Every storage get
// merges defaults, mirroring chrome.storage.local.get(defaults).
function loadBackground() {
	var listeners = { installed: [], started: [], message: [] };
	var storage = {};
	var badge = { text: null, color: null };
	var queryArg;
	var tabMessages = [];
	var sentErrors = [];

	var chrome = {
		storage: { local: {
			get: function(defaults) {
				var result = {};
				Object.keys(defaults).forEach(function(key) {
					result[key] = Object.prototype.hasOwnProperty.call(storage, key) ?
						storage[key] : defaults[key];
				});
				return Promise.resolve(result);
			},
			set: function(values) {
				Object.keys(values).forEach(function(key) {
					storage[key] = values[key];
				});
				return Promise.resolve();
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
			query: function(queryInfo) {
				queryArg = queryInfo;
				// tabs expose only their id; touching any other property fails
				return Promise.resolve(TAB_IDS.map(function(id) {
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
			sendMessage: function(tabId, message) {
				tabMessages.push({ tabId: tabId, message: message });
				if (sentErrors.indexOf(tabId) !== -1) {
					return Promise.reject(new Error('Receiving end does not exist.'));
				}
				return Promise.resolve();
			}
		}
	};

	vm.runInNewContext(fs.readFileSync(path.join(ROOT, BACKGROUND_PATH), 'utf8'), { chrome: chrome });

	return {
		storage: storage,
		badge: badge,
		queryArg: function() { return queryArg; },
		tabMessages: tabMessages,
		sentErrors: sentErrors,
		onInstalled: function(reason) {
			listeners.installed.forEach(function(fn) { fn({ reason: reason }); });
			return flush();
		},
		onStartup: function() {
			listeners.started.forEach(function(fn) { fn(); });
			return flush();
		},
		onMessage: function(request) {
			var result = { returned: undefined, response: undefined, responseCount: 0 };
			listeners.message.forEach(function(fn) {
				result.returned = fn(request, {}, function(value) {
					result.response = value;
					result.responseCount++;
				});
			});
			return flush().then(function() { return result; });
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

	beforeAll(function() {
		execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
		process.on('unhandledRejection', recordUnhandled);
	});

	afterAll(function() {
		process.removeListener('unhandledRejection', recordUnhandled);
	});

	beforeEach(function() {
		env = loadBackground();
	});

	it('registers onInstalled, onStartup and onMessage synchronously', function() {
		env._assertListeners();
	});

	it('writes exactly the four defaults on install', function() {
		return env.onInstalled('install').then(function() {
			expect(env.storage).toEqual(DEFAULT_PREFS);
		});
	});

	it('sets the on badge with green background on install', function() {
		return env.onInstalled('install').then(function() {
			expect(env.badge).toEqual({ text: 'on', color: [0, 255, 0, 255] });
		});
	});

	it('never overwrites stored prefs on update and restores the badge', function() {
		env.storage.method = 3;
		env.storage.onOff = 0;
		env.storage.ckSpell = 0;
		env.storage.oldAccent = 0;
		return env.onInstalled('update').then(function() {
			expect(env.storage).toEqual({ method: 3, onOff: 0, ckSpell: 0, oldAccent: 0 });
			expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
		});
	});

	it('restores the badge from storage on startup, merging defaults', function() {
		env.storage.onOff = 0;
		return env.onStartup().then(function() {
			expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
		});
	});

	it('answers get_prefs with canonical prefs, merging defaults on read', function() {
		env.storage.method = 2;
		return env.onMessage({ type: 'get_prefs' }).then(function(result) {
			expect(result.returned).toBe(true);
			expect(result.responseCount).toBe(1);
			expect(result.response).toEqual({ method: 2, onOff: 1, ckSpell: 1, oldAccent: 1 });
			expect(env.tabMessages.length).toBe(0);
		});
	});

	it('partial save canonicalizes the response and keeps untouched prefs', function() {
		return env.onInstalled('install').then(function() {
			return env.onMessage({ type: 'save_prefs', prefs: { method: 4 } }).then(function(result) {
				expect(result.returned).toBe(true);
				expect(result.responseCount).toBe(1);
				expect(result.response).toEqual({ method: 4, onOff: 1, ckSpell: 1, oldAccent: 1 });
				expect(env.storage).toEqual({ method: 4, onOff: 1, ckSpell: 1, oldAccent: 1 });
			});
		});
	});

	it('rejects malformed field values and answers with the stored prefs', function() {
		return env.onMessage({
			type: 'save_prefs',
			prefs: { method: 9, onOff: 2, ckSpell: 'x', oldAccent: 1.5 }
		}).then(function(result) {
			expect(result.returned).toBe(true);
			expect(result.response).toEqual(DEFAULT_PREFS);
			expect(env.storage).toEqual({});
		});
	});

	it('accepts only known fields and ignores the rest', function() {
		return env.onMessage({ type: 'save_prefs', prefs: { method: 3, junk: 'x' } }).then(function(result) {
			expect(result.response).toEqual({ method: 3, onOff: 1, ckSpell: 1, oldAccent: 1 });
			expect(Object.keys(env.storage)).toEqual(['method']);
		});
	});

	it('toggle flips onOff, answers canonical prefs and updates the badge', function() {
		return env.onInstalled('install').then(function() {
			return env.onMessage({ type: 'turn_avim' }).then(function(result) {
				expect(result.returned).toBe(true);
				expect(result.responseCount).toBe(1);
				expect(result.response).toEqual({ method: 0, onOff: 0, ckSpell: 1, oldAccent: 1 });
				expect(env.badge).toEqual({ text: 'off', color: [255, 0, 0, 255] });
				return env.onMessage({ type: 'turn_avim' }).then(function(again) {
					expect(again.response.onOff).toBe(1);
					expect(env.badge).toEqual({ text: 'on', color: [0, 255, 0, 255] });
				});
			});
		});
	});

	it('fan-out queries only tab ids and pushes prefs to every tab', function() {
		return env.onInstalled('install').then(function() {
			return env.onMessage({ type: 'save_prefs', prefs: { onOff: 0 } }).then(function(result) {
				expect(env.queryArg()).toEqual({});
				expect(env.tabMessages.length).toBe(2);
				expect(env.tabMessages[0].tabId).toBe(1);
				expect(env.tabMessages[1].tabId).toBe(2);
				expect(env.tabMessages[0].message).toEqual({ type: 'prefs', prefs: result.response });
				expect(env.tabMessages[1].message).toEqual({ type: 'prefs', prefs: result.response });
			});
		});
	});

	it('swallows per-tab delivery errors without an unhandled rejection', function() {
		unhandledRejections.length = 0;
		return env.onInstalled('install').then(function() {
			env.sentErrors.push(1, 2);
			return env.onMessage({ type: 'save_prefs', prefs: { onOff: 0 } }).then(function(result) {
				expect(env.tabMessages.length).toBe(2);
				expect(result.response).toEqual({ method: 0, onOff: 0, ckSpell: 1, oldAccent: 1 });
				expect(unhandledRejections.length).toBe(0);
			});
		});
	});

	it('leaves unrecognized messages unhandled', function() {
		return env.onMessage({ hello: 'world' }).then(function(result) {
			expect(result.returned).toBeUndefined();
			expect(result.responseCount).toBe(0);
			expect(env.storage).toEqual({});
			expect(env.tabMessages.length).toBe(0);
			expect(env.badge).toEqual({ text: null, color: null });
		});
	});
});
