/*
 * Identity and release contract for Task 6: the fork's metadata, NOTICE,
 * locales and README carry the new identity (AVIM Vietnamese IME) and no
 * old-store/upstream claims, and the distributed ZIP ships both LICENSE and
 * NOTICE. The archive spec runs the real Gulp build so it asserts the
 * shipped artifact, not a copy of the source glob.
 */

'use strict';

var fs = require('fs');
var path = require('path');
var execSync = require('child_process').execSync;

var ROOT = path.resolve(__dirname, '..');
var MANIFEST_PATH = 'src/manifest.json';

// Tokens that claim an old identity, an upstream distribution channel, or
// an endorsement/best-choice claim. Applied to every release-facing file.
var PROHIBITED = [
	'kimkha/avim-chrome',
	'opgbbffpdglhkpglnlkiclakjlpiedoh',
	'travis-ci.org',
	'best choice',
	'addons.opera.com',
	'chrome.google.com/webstore'
];

function read(file) {
	return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function assertAbsent(file, token) {
	if (read(file).indexOf(token) !== -1) {
		throw new Error(file + ' must not contain "' + token + '"');
	}
}

describe('fork identity (Task 6)', function() {

	var LANG_FILES = ['en', 'vi'].map(function(lang) {
		return 'src/_locales/' + lang + '/messages.json';
	});

	LANG_FILES.forEach(function(file) {
		describe(file, function() {
			var messages;

			beforeAll(function() {
				messages = JSON.parse(read(file));
			});

			it('names the extension exactly AVIM Vietnamese IME', function() {
				expect(messages.extName.message).toBe('AVIM Vietnamese IME');
			});

			it('has a factual, non-empty description', function() {
				expect(messages.extDescription.message.length).toBeGreaterThan(0);
			});

			it('keeps the action title for the options popup', function() {
				expect(messages.extAction.message.length).toBeGreaterThan(0);
			});

			it('carries no old-identity or best-choice claims', function() {
				PROHIBITED.forEach(function(token) {
					assertAbsent(file, token);
				});
			});
		});
	});

	it('points package repository, bugs and homepage at the canonical fork', function() {
		var pkg = JSON.parse(read('package.json'));
		expect(pkg.repository.url).toBe('https://github.com/viethoangcr/avim-chrome');
		expect(pkg.bugs.url).toBe('https://github.com/viethoangcr/avim-chrome/issues');
		expect(pkg.homepage).toBe('https://github.com/viethoangcr/avim-chrome');
	});

	it('has a factual package description instead of the legacy placeholder', function() {
		var pkg = JSON.parse(read('package.json'));
		expect(pkg.description).not.toMatch(/^avim-chrome/);
		expect(pkg.description.length).toBeGreaterThan(10);
	});

	describe('NOTICE', function() {
		var notice;

		beforeAll(function() {
			notice = read('NOTICE');
		});

		it('identifies the fork name, date, repository and license', function() {
			expect(notice).toContain('AVIM Vietnamese IME');
			expect(notice).toContain('2026-08-06');
			expect(notice).toContain('GPLv3');
			expect(notice).toContain('viethoangcr/avim-chrome');
		});

		it('retains credit to the upstream authors', function() {
			expect(notice).toContain('Hieu Tran Dang');
			expect(notice).toContain('Nguyen Kim Kha');
		});

		it('states upstream authors do not maintain or endorse this release', function() {
			expect(notice).toMatch(/do not (maintain|endorse)/);
		});

		it('carries no old-identity or upstream-distribution claims', function() {
			PROHIBITED.forEach(function(token) {
				assertAbsent('NOTICE', token);
			});
		});
	});

	it('preserves the GPLv3 license text verbatim', function() {
		var license = read('LICENSE');
		expect(license).toContain('GNU GENERAL PUBLIC LICENSE');
		expect(license).toContain('Version 3, 29 June 2007');
		expect(license).toContain('Free Software Foundation');
	});

	describe('README', function() {
		var readme;

		beforeAll(function() {
			readme = read('README.md');
		});

		it('carries no old-identity, Opera, Travis or best-choice claims', function() {
			PROHIBITED.forEach(function(token) {
				assertAbsent('README.md', token);
			});
		});

		it('documents the fork, build/test commands and install path', function() {
			expect(readme).toContain('AVIM Vietnamese IME');
			expect(readme).toContain('viethoangcr/avim-chrome');
			expect(readme).toContain('npm ci');
			expect(readme).toContain('npm run build');
			expect(readme).toContain('build/');
		});

		it('retains upstream credit and states no endorsement', function() {
			expect(readme).toContain('Hieu Tran Dang');
			expect(readme).toContain('Nguyen Kim Kha');
			expect(readme).toContain('do not');
			expect(readme).toContain('endorse');
		});

		it('documents the TypeScript chrome layer and the esbuild toolchain', function() {
			expect(readme).toContain('TypeScript');
			expect(readme).toContain('esbuild');
			expect(readme).toContain('avim.js');
		});
	});

	describe('built archive', function() {
		var entries;

		beforeAll(function() {
			execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
			var manifest = JSON.parse(read(MANIFEST_PATH));
			var listing = execSync(
				'unzip -l ' + path.join(ROOT, 'dist/avim-vietnamese-ime-' + manifest.version + '.zip'),
				{ encoding: 'utf8' }
			);
			entries = listing.split('\n').map(function(line) {
				return line.trim().split(/\s+/).pop();
			});
		});

		it('contains NOTICE and LICENSE', function() {
			expect(entries).toContain('NOTICE');
			expect(entries).toContain('LICENSE');
		});

		it('contains the manifest, locales, worker and popup assets', function() {
			expect(entries).toContain('manifest.json');
			expect(entries).toContain('_locales/en/messages.json');
			expect(entries).toContain('_locales/vi/messages.json');
			expect(entries).toContain('chrome/background.js');
			expect(entries).toContain('popup.html');
			expect(entries).toContain('scripts/avim.js');
			expect(entries).toContain('scripts/popup-avim.js');
		});
	});
});
