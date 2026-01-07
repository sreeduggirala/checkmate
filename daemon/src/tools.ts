import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import simpleGit, { SimpleGit } from 'simple-git';

type ProcessResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const runProcess = (
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<ProcessResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', chunk => {
      stderr += chunk.toString();
    });

    child.on('error', err => {
      reject(err);
    });
    child.on('close', code => {
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });

const normalizePath = (value: string): string => value.replace(/\\/g, '/');

const globToRegExp = (pattern: string): RegExp => {
  let regex = '^';
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        while (pattern[i + 1] === '*') {
          i += 1;
        }
        if (pattern[i + 1] === '/') {
          i += 1;
          regex += '(?:.*/)?';
        } else {
          regex += '.*';
        }
      } else {
        regex += '[^/]*';
      }
      continue;
    }

    if (char === '?') {
      regex += '[^/]';
      continue;
    }

    if (/[.+^${}()|[\]\\]/.test(char)) {
      regex += `\\${char}`;
    } else {
      regex += char;
    }
  }
  regex += '$';
  return new RegExp(regex);
};

export class WorkspaceTools {
  private git: SimpleGit;

  constructor(private workspaceRoot: string, private allowPaths: string[]) {
    this.git = simpleGit(workspaceRoot);
  }

  /**
   * Check if a path is allowed by the allowlist
   */
  private isPathAllowed(filePath: string): boolean {
    const normalized = normalizePath(filePath);
    return this.allowPaths.some(allowed => {
      const allowedNormalized = normalizePath(allowed);
      if (allowedNormalized.includes('*')) {
        const regex = globToRegExp(allowedNormalized);
        return regex.test(normalized);
      }

      if (normalized === allowedNormalized) {
        return true;
      }

      const withSlash = allowedNormalized.endsWith('/')
        ? allowedNormalized
        : `${allowedNormalized}/`;
      return normalized.startsWith(withSlash);
    });
  }

  /**
   * Read a single file
   */
  readFile(filePath: string): string {
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`Path ${filePath} is not in allowlist`);
    }

    const fullPath = path.join(this.workspaceRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    return fs.readFileSync(fullPath, 'utf-8');
  }

  /**
   * Read multiple files
   */
  readFiles(filePaths: string[]): Record<string, string> {
    const result: Record<string, string> = {};

    for (const filePath of filePaths) {
      try {
        result[filePath] = this.readFile(filePath);
      } catch (err) {
        result[filePath] = `ERROR: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    return result;
  }

  /**
   * List files in workspace (shallow)
   */
  async listFiles(): Promise<string[]> {
    const files: string[] = [];

    const walk = (dir: string, depth: number = 0) => {
      if (depth > 2) return; // Limit depth to avoid huge listings

      const entries = fs.readdirSync(path.join(this.workspaceRoot, dir), {
        withFileTypes: true,
      });

      for (const entry of entries) {
        const relativePath = path.join(dir, entry.name);

        // Skip node_modules, .git, etc.
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue;
        }

        if (entry.isDirectory()) {
          walk(relativePath, depth + 1);
        } else {
          files.push(relativePath);
        }
      }
    };

    walk('');
    return files;
  }

  /**
   * Get git diff
   */
  async gitDiff(): Promise<string> {
    const diff = await this.git.diff();
    return diff;
  }

  /**
   * Get git status summary
   */
  async gitStatusSummary(): Promise<string> {
    const status = await this.git.status();
    const lines: string[] = [];

    if (status.modified.length > 0) {
      lines.push('Modified: ' + status.modified.join(', '));
    }
    if (status.created.length > 0) {
      lines.push('Created: ' + status.created.join(', '));
    }
    if (status.deleted.length > 0) {
      lines.push('Deleted: ' + status.deleted.join(', '));
    }
    if (status.not_added.length > 0) {
      lines.push('Untracked: ' + status.not_added.join(', '));
    }

    return lines.join('\n') || 'No changes';
  }

  /**
   * Validate that a patch only touches allowed paths
   */
  validatePatch(patch: string): { valid: boolean; error?: string } {
    // Extract file paths from unified diff
    const lines = patch.split('\n');
    const filePaths: string[] = [];

    for (const line of lines) {
      if (line.startsWith('--- ') || line.startsWith('+++ ')) {
        const match = line.match(/^[+-]{3} [ab]\/(.+)$/);
        if (match && match[1] !== '/dev/null') {
          filePaths.push(match[1]);
        }
      }
    }

    // Check all paths against allowlist
    for (const filePath of filePaths) {
      if (!this.isPathAllowed(filePath)) {
        return {
          valid: false,
          error: `Patch touches disallowed path: ${filePath}`,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Apply a unified diff patch
   */
  async applyPatch(patch: string): Promise<{ success: boolean; error?: string }> {
    // Validate first
    const validation = this.validatePatch(patch);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const tempPatchFile = path.join(this.workspaceRoot, '.dualagent-temp.patch');
    try {
      // Write patch to temp file
      fs.writeFileSync(tempPatchFile, patch);

      // Apply patch using git apply
      const result = await runProcess('git', ['apply', '--whitespace=nowarn', tempPatchFile], {
        cwd: this.workspaceRoot,
      });

      if (result.exitCode !== 0) {
        return {
          success: false,
          error: `Failed to apply patch: ${result.stderr || result.stdout || 'Unknown error'}`,
        };
      }

      return { success: true };
    } catch (err: any) {
      return {
        success: false,
        error: `Failed to apply patch: ${err.message}`,
      };
    } finally {
      if (fs.existsSync(tempPatchFile)) {
        fs.unlinkSync(tempPatchFile);
      }
    }
  }

  /**
   * Run a command in the workspace
   */
  async runCommand(
    command: string,
    args: string[] = []
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    try {
      const result = await runProcess(command, args, {
        cwd: this.workspaceRoot,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
      };
    } catch (err: any) {
      return {
        stdout: '',
        stderr: err.message,
        exitCode: 1,
      };
    }
  }
}
