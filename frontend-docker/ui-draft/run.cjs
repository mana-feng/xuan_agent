const path = require('node:path');
const { spawn } = require('node:child_process');

const build = process.argv.includes('build');
const cli = require.resolve('@dcloudio/vite-plugin-uni/bin/uni.js');
const child = spawn(process.execPath, [cli, build ? 'build' : 'dev', '-p', 'h5'], {
	cwd: __dirname,
	env: {
		...process.env,
		UNI_INPUT_DIR: path.join(__dirname, 'src'),
		UNI_OUTPUT_DIR: path.resolve(__dirname, '../dist/ui-draft', build ? 'build' : 'dev'),
	},
	stdio: 'inherit',
});
child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (error) => {
	console.error(error);
	process.exit(1);
});
