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
		} else if (entry.name.slice(-3) === '.js') {
			files.push(full);
		}
	});
	return files;
}

describe('source messaging (MV3)', function() {

	it('never uses chrome.extension or chrome.browserAction in src/**/*.js', function() {
		var offenders = listJsFiles(SRC_DIR).filter(function(file) {
			var source = fs.readFileSync(file, 'utf8');
			return FORBIDDEN.some(function(token) {
				return source.indexOf(token) !== -1;
			});
		});
		expect(offenders).toEqual([]);
	});
});
