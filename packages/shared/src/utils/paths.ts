import fs from 'fs';
import path from 'path';

/**
 * Get project root based on context
 * - In development: finds monorepo root
 * - In production: uses current working directory
 */
export function getProjectRoot(): string {
  // 1. In development/monorepo: find monorepo root
  if (isDevelopmentEnvironment()) {
    const monorepoRoot = findMonorepoRoot();
    if (monorepoRoot) return monorepoRoot;
  }

  // 2. In production: use current working directory
  //    or find nearest directory with config files
  return findConfigurationRoot(process.cwd());
}

/**
 * Get the path to the .env file
 */
export function getEnvFilePath(): string {
  return path.join(getProjectRoot(), '.env');
}

/**
 * Check if running in development environment
 */
function isDevelopmentEnvironment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Find monorepo root by looking for workspace config
 */
function findMonorepoRoot(): string | null {
  let currentDir = process.cwd();

  while (currentDir !== path.parse(currentDir).root) {
    // Check for monorepo indicators
    if (fs.existsSync(path.join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        if (packageJson.workspaces) {
          return currentDir;
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Find root directory with configuration
 * Looks for .env file or data directory
 */
function findConfigurationRoot(startDir: string): string {
  let currentDir = startDir;

  // Check up to 3 levels up for existing config
  for (let i = 0; i < 3; i++) {
    if (fs.existsSync(path.join(currentDir, '.env')) ||
        fs.existsSync(path.join(currentDir, 'data'))) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  // Default to current working directory
  return process.cwd();
}

/**
 * Resolve a path that might be relative to project root
 */
export function resolveFromRoot(relativePath: string): string {
  if (path.isAbsolute(relativePath)) {
    return relativePath;
  }

  return path.join(getProjectRoot(), relativePath);
}
