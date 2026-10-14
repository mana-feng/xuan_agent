const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('../../frontend-docker/node_modules/esbuild');
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'engines.ts')], bundle: true,
  alias: { 'qimen-engine': path.join(__dirname, '../../frontend-docker/vendor/qfdk-qimen/lib/qimen.js') },
  outfile: path.join(__dirname, 'engines.js'), format: 'iife', globalName: 'ChartAlgorithms',
  platform: 'browser', target: 'es2020', minify: true, legalComments: 'linked',
});
// Retain the vendored engine's full license in browser distributions too.
fs.appendFileSync(path.join(__dirname, 'engines.js.LEGAL.txt'), '\nqfdk/qimen (pinned source; local patches xuan-1)\n' + fs.readFileSync(path.join(__dirname, '../../frontend-docker/vendor/qfdk-qimen/LICENSE'), 'utf8'));
console.log('Built real Ziwei and Qimen engines for http://127.0.0.1:4175/');
