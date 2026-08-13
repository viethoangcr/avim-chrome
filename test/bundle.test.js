/*
 * Content-bundle contract pin (Tasks 1.4 + 3.5): the BUILT content bundle must
 * preserve ONE shared top-level scope. avim.js + the compiled extension are
 * concatenated before minification, so `new AVIM()` inside the bundle must
 * resolve to the engine constructor and the initial get_prefs request must
 * fire during load. A broken scope (per-file module wrappers, mangling with
 * separate scopes) throws ReferenceError at load and fails these specs.
 *
 * Task 3.5 pins the typed-envelope contract: the initial request is
 * `{ type: 'get_prefs' }`, a prefs push re-initializes the engine, unrelated
 * messages do NOT (the old any-message listener bug), and double-Ctrl sends
 * `{ type: 'turn_avim' }`. The prefs response lands on a microtask (the chrome
 * mock returns a promise), so engine initialization completes after a flush.
 */

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.resolve(__dirname, '..');
var CONTENT_BUNDLE = 'build/scripts/avim.js';
var POPUP_ENGINE = 'build/scripts/popup-avim.js';

var PREFS = { method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 };

// Flush the microtask queue so promise-chained engine init has finished.
function flush() {
	return new Promise(function(resolve) { setTimeout(resolve, 0); });
}

// Load a built script in a fresh sandbox against a chrome/document mock and
// return the sandbox context plus the recorded mock activity. With
// opts.modern the documentMock exposes onbeforeinput (feature detect for the
// modern transport); without it the legacy keypress path is exercised.
function loadScript(file, opts) {
	var messages = [];
	var documentEvents = [];
	var messageListeners = [];

	var chrome = {
		runtime: {
			// Promise style for the TS content script; the callback form is
			// kept so the legacy bundle the red-first specs run against works.
			sendMessage: function(message, callback) {
				messages.push(message);
				if (callback) { callback(PREFS); }
				return Promise.resolve(PREFS);
			},
			onMessage: {
				addListener: function(fn) { messageListeners.push(fn); }
			}
		}
	};

	Object.defineProperty(chrome.runtime, 'lastError', {
		get: function() { return undefined; },
		configurable: true
	});

	var observerInstances = [];
	var iframes = [];
	var documentMock = {
		addEventListener: function(evt, handler, capture) {
			documentEvents.push({ evt: evt, handler: handler, capture: capture });
		},
		removeEventListener: function() {},
		getElementsByTagName: function() { return iframes; },
		documentElement: {}
	};

	if (opts && opts.modern) {
		documentMock.onbeforeinput = null;
	}

	var context = {
		chrome: chrome,
		window: { document: documentMock },
		setTimeout: setTimeout,
		MutationObserver: function(callback) {
			var instance = {
				callback: callback,
				observeCalls: [],
				disconnected: false,
				observe: function(target, options) {
					instance.observeCalls.push({ target: target, options: options });
				},
				disconnect: function() {
					instance.disconnected = true;
				}
			};
			observerInstances.push(instance);
			return instance;
		}
	};

	vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);

	return {
		context: context,
		messages: messages,
		documentEvents: documentEvents,
		messageListeners: messageListeners,
		observerInstances: observerInstances,
		iframes: iframes,
		documentElement: documentMock.documentElement
	};
}

function docListener(env, evt) {
	var found;
	env.documentEvents.forEach(function(entry) {
		if (entry.evt === evt) { found = entry.handler; }
	});
	return found;
}

describe('built content bundle (shared top-level scope)', function() {

	beforeAll(function() {
		execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
	});

	it('loads without throwing and fires the initial get_prefs request', function() {
		var env = loadScript(CONTENT_BUNDLE);
		expect(env.messages.length).toBe(1);
		expect(env.messages[0]).toEqual({ type: 'get_prefs' });
	});

	it('initializes the engine after the prefs callback', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			expect(typeof env.context.AVIMObj).toBe('object');
			expect(env.documentEvents.length).toBeGreaterThanOrEqual(2);
			var types = env.documentEvents.map(function(entry) { return entry.evt; });
			expect(types).not.toContain('keydown');
			expect(types).toContain('keyup');
			expect(types).toContain('keypress');
		});
	});

	it('does not attach a mouseup polling handler', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			var types = env.documentEvents.map(function(entry) { return entry.evt; });
			expect(types).not.toContain('mouseup');
		});
	});

	it('observes the document element for added iframes', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			expect(env.observerInstances.length).toBe(1);
			var instance = env.observerInstances[0];
			expect(instance.observeCalls.length).toBe(1);
			expect(instance.observeCalls[0].target).toBe(env.documentElement);
			expect(instance.observeCalls[0].options).toEqual({ childList: true, subtree: true });
		});
	});

	it('re-initializes when an iframe is added to the DOM', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			var iframeEvents = [];
			var fakeIframe = {
				tagName: 'IFRAME',
				contentWindow: {
					document: {
						designMode: 'ON',
						wi: null,
						addEventListener: function(evt, handler, capture) {
							iframeEvents.push({ evt: evt, handler: handler, capture: capture });
						}
					}
				}
			};
			env.iframes.push(fakeIframe);
			env.observerInstances[0].callback([{ addedNodes: [fakeIframe] }]);
			var types = iframeEvents.map(function(entry) { return entry.evt; });
			expect(types).toContain('keypress');
		});
	});

	it('re-initializes the engine on a prefs push', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			var before = env.context.AVIMObj;
			var countBefore = env.documentEvents.length;
			env.messageListeners[0]({ type: 'prefs', prefs: { method: 3 } });
			expect(env.context.AVIMObj).not.toBe(before);
			expect(env.documentEvents.length).toBeGreaterThan(countBefore);
		});
	});

	it('ignores unrelated messages (any-message re-init bug is fixed)', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			var before = env.context.AVIMObj;
			var countBefore = env.documentEvents.length;
			env.messageListeners[0]({ hello: 'world' });
			expect(env.context.AVIMObj).toBe(before);
			expect(env.documentEvents.length).toBe(countBefore);
		});
	});

	it('double-Ctrl keyup sends turn_avim', function() {
		var env = loadScript(CONTENT_BUNDLE);
		return flush().then(function() {
			var keyup = docListener(env, 'keyup');
			expect(keyup).toBeDefined();
			keyup({ which: 17 });
			keyup({ which: 17 });
			expect(env.messages[1]).toEqual({ type: 'turn_avim' });
		});
	});

	it('attaches the modern transport and gates legacy keypress when beforeinput is supported', function() {
		var env = loadScript(CONTENT_BUNDLE, { modern: true });
		return flush().then(function() {
			expect(docListener(env, 'beforeinput')).toBe(env.context.AVIMTransport.handleBeforeInput);
			expect(docListener(env, 'input')).toBe(env.context.AVIMTransport.handleInput);
			env.documentEvents.forEach(function(entry) {
				if (entry.evt === 'beforeinput' || entry.evt === 'input') {
					expect(entry.capture).toBe(true);
				}
			});
			var types = env.documentEvents.map(function(entry) { return entry.evt; });
			expect(types).not.toContain('keypress');
			expect(types).toContain('keyup');
			expect(env.messages[0]).toEqual({ type: 'get_prefs' });
		});
	});

	it('keeps the modern transport attached after a prefs push', function() {
		var env = loadScript(CONTENT_BUNDLE, { modern: true });
		return flush().then(function() {
			var before = env.context.AVIMObj;
			env.messageListeners[0]({ type: 'prefs', prefs: { method: 3 } });
			expect(env.context.AVIMObj).not.toBe(before);
			expect(docListener(env, 'beforeinput')).toBe(env.context.AVIMTransport.handleBeforeInput);
			expect(docListener(env, 'input')).toBe(env.context.AVIMTransport.handleInput);
			var types = env.documentEvents.map(function(entry) { return entry.evt; });
			expect(types).not.toContain('keypress');
		});
	});

	it('popup engine loads without throwing and exposes the AVIM constructor', function() {
		var env = loadScript(POPUP_ENGINE);
		expect(typeof env.context.AVIM).toBe('function');
	});
});
