import { build, transform } from 'esbuild';
import { ZipArchive } from 'archiver';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

// clean build/dist so every build starts from a deterministic empty state
function clean() {
  fs.rmSync('build', { recursive: true, force: true });
  fs.rmSync('dist', { recursive: true, force: true });
}

// copy static assets (no src/fonts or src/styles exist in this tree)
function copy() {
  fs.mkdirSync('build', { recursive: true });
  fs.cpSync('src/icons', 'build/icons', { recursive: true });
  fs.cpSync('src/_locales', 'build/_locales', { recursive: true });
  // legal notices required in the distributed package
  fs.copyFileSync('LICENSE', path.join('build', 'LICENSE'));
  fs.copyFileSync('NOTICE', path.join('build', 'NOTICE'));
}

// popup.html is copied verbatim (no HTML minification step)
function html() {
  fs.copyFileSync('src/popup.html', 'build/popup.html');
}

async function chromeScripts() {
  for (const file of fs.readdirSync('src/chrome', { recursive: true })) {
    if (!file.endsWith('.js') && !file.endsWith('.ts')) continue;
    const out = path.join('build/chrome', file.replace(/\.ts$/, '.js'));
    if (file.endsWith('.ts')) {
      // TS via the build API: unbundled iife (type-only imports are erased,
      // so no runtime import/export statements reach the output)
      const result = await build({
        stdin: {
          contents: read(path.join('src/chrome', file)),
          sourcefile: path.basename(file),
          resolveDir: path.dirname(path.join('src/chrome', file)),
          loader: 'ts'
        },
        bundle: false,
        format: 'iife',
        minify: true,
        write: false,
        target: 'es2017'
      });
      write(out, result.outputFiles[0].text);
    } else {
      const result = await transform(read(path.join('src/chrome', file)), {
        minify: true,
        target: 'es2017'
      });
      write(out, result.code);
    }
  }
}

// content script bundle: avim.js then the standalone-compiled extension.ts,
// concatenated and minified in ONE top-level scope (the extension reads engine
// globals at runtime, so esbuild cannot bundle the two together — each file
// would get its own module scope). Type-only imports are erased, so the
// compiled extension carries no runtime import/export statements.
async function contentBundle() {
  const ext = await build({
    stdin: {
      contents: read('src/scripts/extension.ts'),
      sourcefile: 'extension.ts',
      resolveDir: 'src/scripts',
      loader: 'ts'
    },
    bundle: false,
    format: 'iife',
    minify: false,
    write: false,
    target: 'es2017'
  });
  const combined = read('src/scripts/avim.js') + '\n' + ext.outputFiles[0].text;
  const min = await transform(combined, { minify: true, target: 'es2017' });
  write('build/scripts/avim.js', min.code);
}

// engine-only file for the popup demo
async function popupEngine() {
  const result = await transform(read('src/scripts/avim.js'), { minify: true });
  write('build/scripts/popup-avim.js', result.code);
}

// build manifest: keep every MV3 field, list only the content bundle
export function buildManifest(json) {
  json.content_scripts[0].js = ['scripts/avim.js'];
  return json;
}

function manifest() {
  const json = JSON.parse(read('src/manifest.json'));
  fs.writeFileSync('build/manifest.json', JSON.stringify(buildManifest(json)));
}

// one Store ZIP; source maps are build-only and excluded from the archive
function zip() {
  const version = JSON.parse(read('src/manifest.json')).version;
  const fileName = 'avim-vietnamese-ime-' + version + '.zip';
  fs.mkdirSync('dist', { recursive: true });
  const output = fs.createWriteStream(path.join('dist', fileName));
  const archive = new ZipArchive({ zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);
    archive.glob('**/*', {
      cwd: 'build',
      dot: true,
      ignore: ['**/*.map', '**/.DS_Store']
    });
    archive.finalize();
  });
}

async function main() {
  clean();
  copy();
  html();
  await chromeScripts();
  await contentBundle();
  await popupEngine();
  manifest();
  await zip();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
