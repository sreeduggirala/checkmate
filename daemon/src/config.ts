import * as fs from 'fs';
import * as path from 'path';
import { Config, ConfigSchema } from '@dualagent/shared';

export function loadConfig(workspaceRoot: string): Config {
  const configPath = path.join(workspaceRoot, '.dualagent.json');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `Config file not found at ${configPath}. Please create .dualagent.json in workspace root.`
    );
  }

  const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const parseResult = ConfigSchema.safeParse(rawConfig);

  if (!parseResult.success) {
    throw new Error(
      `Invalid config file: ${parseResult.error.message}`
    );
  }

  return parseResult.data;
}

export function getApiKey(provider: 'openai' | 'anthropic'): string {
  const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';
  const key = process.env[envVar];

  if (!key) {
    throw new Error(
      `Missing ${envVar} environment variable. Please set it before running the daemon.`
    );
  }

  return key;
}
