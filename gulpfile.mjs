import gulp from 'gulp';
import fs from 'node:fs';
import cleanhtml from 'gulp-cleanhtml';
import concat from 'gulp-concat-util';
import jasmine from 'gulp-jasmine';
import jeditor from 'gulp-json-editor';
import stripdebug from 'gulp-strip-debug';
import uglify from 'gulp-uglify';
import zip from 'gulp-zip';

const { src, dest, series, parallel } = gulp;

const UGLIFY_OPTIONS = {
	mangle: {
		toplevel: true,
		eval: true,
		reserved: ['chrome']
	}
};

// clean build/dist so every build starts from a deterministic empty state
function clean(cb) {
	fs.rmSync('build', { recursive: true, force: true });
	fs.rmSync('dist', { recursive: true, force: true });
	cb();
}

// copy static assets (no src/fonts or src/styles exist in this tree)
function copyIcons() {
	return src('src/icons/**')
		.pipe(dest('build/icons'));
}

function copyLocales() {
	return src('src/_locales/**')
		.pipe(dest('build/_locales'));
}

// legal notices required in the distributed package
function copyLegal() {
	return src(['LICENSE', 'NOTICE'])
		.pipe(dest('build'));
}

const copy = parallel(copyIcons, copyLocales, copyLegal);

// minify HTML
function html() {
	return src('src/*.html')
		.pipe(cleanhtml())
		.pipe(dest('build'));
}

// build/popup.html must load the engine alone, not the content bundle.
// Source popup.html keeps referencing source scripts/avim.js unchanged.
function rewritePopup(cb) {
	fs.readFile('build/popup.html', 'utf8', (err, html) => {
		if (err) return cb(err);
		fs.writeFile('build/popup.html', html.replace('scripts/avim.js', 'scripts/popup-avim.js'), cb);
	});
}

// content script bundle: avim.js then extension.js, in that order
function scriptsContent() {
	return src(['src/scripts/avim.js', 'src/scripts/extension.js'])
		.pipe(concat('avim.js'))
		.pipe(stripdebug())
		.pipe(uglify(UGLIFY_OPTIONS))
		.pipe(dest('build/scripts'));
}

// engine-only file for the popup demo
function scriptsPopup() {
	return src('src/scripts/avim.js')
		.pipe(concat('popup-avim.js'))
		.pipe(stripdebug())
		.pipe(uglify(UGLIFY_OPTIONS))
		.pipe(dest('build/scripts'));
}

function scriptsChrome() {
	return src('src/chrome/**/*.js')
		.pipe(stripdebug())
		.pipe(uglify(UGLIFY_OPTIONS))
		.pipe(dest('build/chrome'));
}

const scripts = parallel(scriptsContent, scriptsPopup, scriptsChrome);

// build manifest: keep every MV3 field, list only the content bundle
export function buildManifest(json) {
	json.content_scripts[0].js = ['scripts/avim.js'];
	return json;
}

// never copy the source manifest alongside it (runs after the content bundle exists)
function manifest() {
	return src('src/manifest.json')
		.pipe(jeditor(buildManifest))
		.pipe(dest('build'));
}

// one Store ZIP; source maps are build-only and excluded from the archive
function zipTask() {
	const manifestJson = JSON.parse(fs.readFileSync('src/manifest.json', 'utf8'));
	const distFileName = 'avim-vietnamese-ime-' + manifestJson.version + '.zip';
	return src(['build/**', '!build/**/*.map', '!**/.DS_Store'], { dot: true })
		.pipe(zip(distFileName))
		.pipe(dest('dist'));
}

export function test() {
	return src('test/*.test.js')
		.pipe(jasmine());
}

export default series(
	clean,
	parallel(copy, series(html, rewritePopup), scripts),
	manifest,
	zipTask
);
