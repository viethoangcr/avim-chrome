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
// return the sandbox context plus the recorded mock activity.
function loadScript(file) {
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

	var documentMock = {
		addEventListener: function(evt, handler, capture) {
			documentEvents.push({ evt: evt, handler: handler, capture: capture });
		},
		removeEventListener: function() {},
		getElementsByTagName: function() { return []; }
	};

	var context = {
		chrome: chrome,
		window: { document: documentMock },
		setTimeout: setTimeout
	};

	vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), context);

	return {
		context: context,
		messages: messages,
		documentEvents: documentEvents,
		messageListeners: messageListeners
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
			expect(env.documentEvents.length).toBeGreaterThanOrEqual(3);
			var types = env.documentEvents.map(function(entry) { return entry.evt; });
			expect(types).toContain('keydown');
			expect(types).toContain('keyup');
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

	it('popup engine loads without throwing and exposes the AVIM constructor', function() {
		var env = loadScript(POPUP_ENGINE);
		expect(typeof env.context.AVIM).toBe('function');
	});
});
