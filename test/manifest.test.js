/*
 * Manifest MV3 contract for Task 3: the source manifest is MV3 and the
 * build-time rewrite keeps every MV3 field while listing only the content
 * bundle. The build-manifest assertions run the real build-script rewrite over
 * the source manifest, so they test the shipped build/ contract, not a copy.
 */

'use strict';

var fs = require('fs');

var SOURCE_PATH = './src/manifest.json';
var PACKAGE_PATH = './package.json';

var CONTENT_MATCHES = ['http://*/*', 'https://*/*'];

function readManifest() {
	return JSON.parse(fs.readFileSync(SOURCE_PATH, 'utf8'));
}

describe('manifest (MV3)', function() {

	var manifest;

	beforeEach(function() {
		manifest = readManifest();
	});

	it('declares manifest_version 3', function() {
		expect(manifest.manifest_version).toBe(3);
	});

	it('requires Chrome 116 or newer', function() {
		expect(manifest.minimum_chrome_version).toBe('116');
	});

	it('uses action with the same icon, title and popup as browser_action', function() {
		expect(manifest.action).toEqual({
			default_icon: 'icons/icon19.png',
			default_title: '__MSG_extAction__',
			default_popup: 'popup.html'
		});
	});

	it('declares a classic (non-module) background service worker', function() {
		expect(manifest.background).toEqual({
			service_worker: 'chrome/background.js'
		});
	});

	it('requests exactly the storage permission and no host permissions', function() {
		expect(manifest.permissions).toEqual(['storage']);
		expect(manifest.host_permissions).toBeUndefined();
	});

	it('removes MV2-only fields', function() {
		expect(manifest.browser_action).toBeUndefined();
		expect(manifest.background.scripts).toBeUndefined();
		expect(manifest.offline_enabled).toBeUndefined();
	});

	it('keeps the static content scripts unchanged', function() {
		expect(manifest.content_scripts).toEqual([{
			js: ['scripts/avim.js', 'scripts/extension.js'],
			matches: CONTENT_MATCHES,
			run_at: 'document_idle',
			all_frames: true
		}]);
	});

	it('is version 0.2.0', function() {
		expect(manifest.version).toBe('0.2.0');
	});

	it('package.json version matches the manifest version', function() {
		var pkg = JSON.parse(fs.readFileSync(PACKAGE_PATH, 'utf8'));
		expect(pkg.version).toBe(manifest.version);
	});

	describe('build manifest', function() {

		var buildManifest;

		beforeAll(async function() {
			var build = await import('../scripts/build.mjs');
			buildManifest = build.buildManifest(JSON.parse(JSON.stringify(readManifest())));
		});

		it('is MV3 and lists only the content bundle', function() {
			expect(buildManifest.manifest_version).toBe(3);
			expect(buildManifest.content_scripts[0].js).toEqual(['scripts/avim.js']);
			expect(buildManifest.content_scripts[0].matches).toEqual(CONTENT_MATCHES);
			expect(buildManifest.content_scripts[0].run_at).toBe('document_idle');
			expect(buildManifest.content_scripts[0].all_frames).toBe(true);
		});

		it('preserves action, service worker, permissions and version', function() {
			expect(buildManifest.action).toEqual({
				default_icon: 'icons/icon19.png',
				default_title: '__MSG_extAction__',
				default_popup: 'popup.html'
			});
			expect(buildManifest.background).toEqual({
				service_worker: 'chrome/background.js'
			});
			expect(buildManifest.permissions).toEqual(['storage']);
			expect(buildManifest.version).toBe('0.2.0');
			expect(buildManifest.minimum_chrome_version).toBe('116');
			expect(buildManifest.browser_action).toBeUndefined();
			expect(buildManifest.background.scripts).toBeUndefined();
			expect(buildManifest.offline_enabled).toBeUndefined();
			expect(buildManifest.host_permissions).toBeUndefined();
		});
	});
});
