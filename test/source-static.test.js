/*
 * Source-messaging contract for Task 5: every extension context talks through
 * chrome.runtime. The MV2 namespaces chrome.extension and chrome.browserAction
 * are forbidden in shipped source; AVIM engine behavior is preserved untouched.
 */

'use strict';

var fs = require('fs');
var path = require('path');

var SRC_DIR = './src';
var FORBIDDEN = ['chrome.extension', 'chrome.browserAction'];

function listJsFiles(dir) {
	var files = [];
	fs.readdirSync(dir, { withFileTypes: true }).forEach(function(entry) {
		var full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files = files.concat(listJsFiles(full));
		} else if (['.js', '.ts'].some(function(ext) { return entry.name.endsWith(ext); })) {
			files.push(full);
		}
	});
	return files;
}

describe('source messaging (MV3)', function() {

	it('never uses chrome.extension or chrome.browserAction in src/**/*.{js,ts}', function() {
		var offenders = listJsFiles(SRC_DIR).filter(function(file) {
			var source = fs.readFileSync(file, 'utf8');
			return FORBIDDEN.some(function(token) {
				return source.indexOf(token) !== -1;
			});
		});
		expect(offenders).toEqual([]);
	});
});

describe('source logging', function() {

	it('never calls console.* in src/scripts/extension.ts', function() {
		var source = fs.readFileSync(path.join(SRC_DIR, 'scripts/extension.ts'), 'utf8');
		expect(source.indexOf('console.')).toBe(-1);
	});
});

describe('source dead code', function() {

	it('removes vestiges from extension.ts and avim.js', function() {
		var extensionSource = fs.readFileSync(path.join(SRC_DIR, 'scripts/extension.ts'), 'utf8');
		['findFrame', '_keyDownHandler', 'keyDownHandler'].forEach(function(token) {
			expect(extensionSource.indexOf(token)).toBe(-1);
		});
		var avimSource = fs.readFileSync(path.join(SRC_DIR, 'scripts/avim.js'), 'utf8');
		expect(avimSource.indexOf('useCookie')).toBe(-1);
	});
});

describe('popup.html script references', function() {

	it('loads popup-avim.js and not the raw avim.js bundle', function() {
		var source = fs.readFileSync(path.join(SRC_DIR, 'popup.html'), 'utf8');
		expect(source).toContain('src="scripts/popup-avim.js"');
		expect(source).not.toContain('src="scripts/avim.js"');
	});
});
