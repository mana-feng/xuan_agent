#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createSimulationServer } = require('./server.cjs');

const args = process.argv.slice(2);
function portArgument(name, fallback, allowZero = false) {
  const flag = args.find(arg => arg.startsWith(`--${name}=`));
  const value = flag ? Number(flag.slice(name.length + 3)) : fallback;
  if (!Number.isInteger(value) || value < (allowZero ? 0 : 1) || value > 65535) throw new Error(`Invalid --${name}`);
  return value;
}

async function main() {
  const apiOnly = args.includes('--api-only');
  const apiPort = portArgument('api-port', 4318, apiOnly);
  const frontendPort = portArgument('frontend-port', 4174);
  const frontend = path.resolve(__dirname, '../..');
  const uni = path.join(frontend, 'node_modules/@dcloudio/vite-plugin-uni/bin/uni.js');
  if (!apiOnly && !fs.existsSync(uni)) throw new Error('Install frontend-docker dependencies before starting the production H5 frontend.');

  const server = createSimulationServer({ frontendPort });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(apiPort, '127.0.0.1', resolve);
  });
  const apiOrigin = `http://127.0.0.1:${server.address().port}`;
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  console.log(`[ui-simulation] API ${apiOrigin}`);
  console.log(`[ui-simulation] Control panel ${apiOrigin}/`);
  console.log('[ui-simulation] Synthetic data only; no real model, email or production database.');
  console.log('[ui-simulation] demo@example.test / Demo123!; verification code 123456.');

  let child;
  let stopping = false;
  function stop(code = 0) {
    if (stopping) return;
    stopping = true;
    if (child && child.exitCode === null) child.kill();
    server.closeAllConnections();
    server.close(() => { process.exitCode = code; });
  }
  process.once('SIGINT', () => stop());
  process.once('SIGTERM', () => stop());
  if (!apiOnly) {
    console.log(`[ui-simulation] Production uni-app H5 ${frontendOrigin}/#/pages/agent/index`);
    // Child-only overrides; no .env, config, fixture or production-data files are written.
    child = spawn(process.execPath, [uni, 'dev', '-p', 'h5', '--host', '127.0.0.1'], {
      cwd: frontend,
      windowsHide: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_DEV_PORT: String(frontendPort),
        VITE_API_PROXY_TARGET: apiOrigin,
        VITE_API_BASE_URL: frontendOrigin,
        VUE_APP_API_BASE_URL: frontendOrigin,
        VITE_API_SIGNATURE_SECRET: 'ui-simulation-only-not-a-production-secret',
        VITE_CSP_CONNECT_SRC: apiOrigin,
        VITE_CSP_ALLOW_UNSAFE_STYLE_INLINE: 'true',
        VITE_CACHE_DIR: path.join(frontend, '.local-dev/vite-ui-simulation'),
      },
    });
    child.once('error', error => { console.error(`[ui-simulation] ${error.message}`); stop(1); });
    child.once('exit', code => stop(code || 0));
  }
}

main().catch(error => {
  if (error.code === 'EADDRINUSE') console.error('[ui-simulation] API port is occupied. Stop the existing listener or select another --api-port.');
  else console.error(`[ui-simulation] ${error.message}`);
  process.exitCode = 1;
});
