import * as path from 'path';
import * as dotenv from 'dotenv';
import { DaemonServer } from './server';
import { loadConfig } from './config';

// Load .env file - try multiple locations
// Priority: repo root > workspace root > current directory
const repoRoot = path.resolve(__dirname, '../..');
const workspaceRoot = process.env.WORKSPACE_ROOT || process.cwd();

// Load from repo root first (most common location)
const repoEnvResult = dotenv.config({ path: path.join(repoRoot, '.env') });
// Load from workspace root
const workspaceEnvResult = dotenv.config({ path: path.join(workspaceRoot, '.env') });
// Fallback to current directory
dotenv.config();

const DEFAULT_PORT = 9876;

async function main() {
  console.log('=== Checkmate Daemon ===');
  console.log(`Workspace: ${workspaceRoot}`);

  // Load config
  let config;
  try {
    config = loadConfig(workspaceRoot);
    console.log(`Config loaded: builder=${config.builder_provider}/${config.builder_model}, reviewer=${config.reviewer_provider}/${config.reviewer_model}`);
  } catch (err) {
    console.error('Failed to load config:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Check API keys
  const builderEnvVar = config.builder_provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const reviewerEnvVar = config.reviewer_provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';

  if (!process.env[builderEnvVar]) {
    console.error(`Missing ${builderEnvVar} environment variable`);
    process.exit(1);
  }

  if (!process.env[reviewerEnvVar]) {
    console.error(`Missing ${reviewerEnvVar} environment variable`);
    process.exit(1);
  }

  // Start server
  const port = process.env.PORT ? parseInt(process.env.PORT) : DEFAULT_PORT;
  const server = new DaemonServer(port, config, workspaceRoot);

  console.log(`\nReady! Connect VSCode extension to: ws://localhost:${port}\n`);

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
