// =============================================================================
// SEED CONFIG LOADING — find + parse the YAML config
// =============================================================================

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { SeedConfig } from './types';

/**
 * Resolve the YAML config file path.
 * Priority: seed.config.yaml (user copy) > seed.config.example.yaml (template)
 */
export function resolveConfigPath(): string | null {
  const dir = process.cwd(); // Root directory
  const candidates = ['seed.config.yaml', 'seed.config.example.yaml'];

  for (const file of candidates) {
    const filePath = path.join(dir, file);
    // Must be a regular FILE, not a directory. Docker bind-mounts of a
    // non-existent host path create an empty directory at that path; ignoring
    // non-files lets us correctly fall through to the committed template.
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      return filePath;
    }
  }

  return null;
}

/**
 * Load and parse the YAML config file.
 */
export function loadConfig(filePath: string): SeedConfig {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const config = yaml.load(raw) as SeedConfig;

  if (!config || typeof config !== 'object') {
    throw new Error(`Invalid YAML config: expected an object, got ${typeof config}`);
  }

  return config;
}
