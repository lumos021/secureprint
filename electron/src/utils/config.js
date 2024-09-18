const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
const path = require('path');
const fs = require('fs');

// Try to load a local config file if it exists
let localConfig = {};
const localConfigPath = path.join(__dirname, 'config.local.json');
if (fs.existsSync(localConfigPath)) {
  localConfig = JSON.parse(fs.readFileSync(localConfigPath, 'utf8'));
}

const argv = yargs(hideBin(process.argv))
  .option('ws-url', {
    description: 'WebSocket server URL',
    default: localConfig.wsUrl || 'ws://secureprint-backend-266910210082.us-central1.run.app:5553'
  })
  .option('debug', {
    description: 'Enable debug mode',
    type: 'boolean',
    default: localConfig.debug || false
  })
  .option('api-url', {
    description: 'API server URL',
    default: localConfig.apiUrl || 'https://secureprint-backend-266910210082.us-central1.run.app/'
  })
  .option('max-retries', {
    description: 'Maximum number of WebSocket reconnection attempts',
    type: 'number',
    default: localConfig.maxRetries || 5
  })
  .argv;

const config = {
  wsUrl: argv.wsUrl,
  debug: argv.debug,
  apiUrl: argv.apiUrl,
  maxRetries: argv.maxRetries,
  tempDir: path.join(process.env.APPDATA || process.env.HOME, '.pdf-printer-app'),
  logFile: path.join(process.env.APPDATA || process.env.HOME, '.pdf-printer-app', 'application.log'),
  clientInfoFile: path.join(process.env.APPDATA || process.env.HOME, '.pdf-printer-app', 'clientInfo.json'),
};

module.exports = config;