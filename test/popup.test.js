/*
 * Popup contract (Task 3.4): the COMPILED popup (build/chrome/popup.js,
 * esbuild output of the TypeScript source) is loaded in a Node `vm` sandbox
 * together with the engine (build/scripts/popup-avim.js — its `new AVIM()`
 * must resolve, so the engine loads first) against a promise-returning chrome
 * mock, a per-id DOM stub and a window/location stub.
 *
 * The popup wraps its work in `init()`, an async function: the get_prefs
 * response lands on a microtask, so every spec flushes before asserting.
 */

'use strict';

var fs = require('fs');
var vm = require('vm');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.resolve(__dirname, '..');
var POPUP_ENGINE = 'build/scripts/popup-avim.js';
var POPUP_SCRIPT = 'build/chrome/popup.js';

// Flush the microtask queue (and a macrotask) so the async init has finished.
function flush() {
	return new Promise(function(resolve) { setTimeout(resolve, 0); });
}

// IDs for which document.getElementById must return an element stub.
var ELEMENT_IDS = [
	'txtSel', 'txtAuto', 'txtTelex', 'txtVni', 'txtViqr', 'txtViqrStar',
	'txtOff', 'txtTips', 'txtTipsCtrl', 'txtDemo', 'txtDemoCopy',
	'inputDemo', 'demoCopy',
	'off', 'auto', 'telex', 'vni', 'viqr', 'viqrStar'
];

function makeElement(id) {
	var el = {
		id: id,
		innerHTML: '',
		checked: false,
		value: '',
		innerText: '',
		selectionStart: 0,
		selectionEnd: 0,
		scrollTop: 0,
		listeners: [],
		focus: function() {},
		select: function() {},
		setSelectionRange: function() {},
		addEventListener: function(evt, fn) { el.listeners.push({ evt: evt, fn: fn }); }
	};
	return el;
}

// Load the engine, then the popup, in a fresh sandbox. Every sendMessage
// resolves with the given prefs response; location.reload is recorded.
function loadPopup(prefs) {
	var messages = [];
	var reloads = 0;
	var elements = {};
	ELEMENT_IDS.forEach(function(id) { elements[id] = makeElement(id); });

	var chrome = {
		runtime: {
			sendMessage: function(message) {
				messages.push(message);
				return Promise.resolve(prefs);
			}
		},
		i18n: { getMessage: function(key) { return key; } }
	};

	var context = {
		chrome: chrome,
		document: { getElementById: function(id) { return elements[id] || null; } },
		window: { location: { reload: function() { reloads++; } } }
	};

	vm.runInNewContext(fs.readFileSync(path.join(ROOT, POPUP_ENGINE), 'utf8'), context);
	vm.runInNewContext(fs.readFileSync(path.join(ROOT, POPUP_SCRIPT), 'utf8'), context);

	return {
		context: context,
		messages: messages,
		reloads: function() { return reloads; },
		element: function(id) { return elements[id]; },
		listener: function(id, evt) {
			var found;
			elements[id].listeners.forEach(function(entry) {
				if (entry.evt === evt) { found = entry.fn; }
			});
			return found;
		}
	};
}

function click(env, id) {
	env.listener(id, 'click')();
	return flush();
}

describe('popup options (compiled, engine wired)', function() {

	beforeAll(function() {
		execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
	});

	it('sends get_prefs on init and checks the radio matching the response', function() {
		var vni = loadPopup({ method: 2, onOff: 1, ckSpell: 1, oldAccent: 1 });
		var off = loadPopup({ method: 2, onOff: 0, ckSpell: 1, oldAccent: 1 });
		return flush().then(function() {
			expect(vni.messages.length).toBe(1);
			expect(vni.messages[0]).toEqual({ type: 'get_prefs' });
			expect(vni.element('vni').checked).toBe(true);
			expect(vni.element('off').checked).toBe(false);
			expect(off.element('off').checked).toBe(true);
			expect(off.element('vni').checked).toBe(false);
		});
	});

	it('clicking a method radio saves {method, onOff: 1} and reloads', function() {
		var env = loadPopup({ method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 });
		return click(env, 'viqr').then(function() {
			expect(env.messages[1]).toEqual({ type: 'save_prefs', prefs: { method: 3, onOff: 1 } });
			expect(env.reloads()).toBe(1);
		});
	});

	it('clicking off saves {onOff: 0} and reloads', function() {
		var env = loadPopup({ method: 2, onOff: 1, ckSpell: 1, oldAccent: 1 });
		return click(env, 'off').then(function() {
			expect(env.messages[1]).toEqual({ type: 'save_prefs', prefs: { onOff: 0 } });
			expect(env.reloads()).toBe(1);
		});
	});

	it('wires the demo engine: keypress listener attached, AVIMObj instance, lone d inert', function() {
		var env = loadPopup({ method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 });
		return flush().then(function() {
			expect(env.listener('inputDemo', 'keypress')).toBeDefined();
			expect(typeof env.context.AVIMObj).toBe('object');

			var preventDefaults = 0;
			var event = {
				which: 68,
				ctrlKey: false,
				altKey: false,
				preventDefault: function() { preventDefaults++; }
			};
			expect(function() { env.listener('inputDemo', 'keypress')(event); }).not.toThrow();
			// 'd' on an empty word is inert: no change, no default prevented
			expect(env.context.AVIMObj.sk).toBe('D');
			expect(env.context.AVIMObj.changed).toBe(false);
			expect(preventDefaults).toBe(0);
		});
	});
});
