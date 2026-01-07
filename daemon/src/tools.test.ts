import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceTools } from './tools';

describe('WorkspaceTools', () => {
  let tempDir: string;
  let tools: WorkspaceTools;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkmate-test-'));
    tools = new WorkspaceTools(tempDir, ['src/**/*.ts', 'test/**/*.ts']);
  });

  afterEach(() => {
    // Clean up temp directory
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validatePatch', () => {
    it('should accept patches for allowed paths', () => {
      const patch = `--- a/src/index.ts
+++ b/src/index.ts
@@ -1,0 +2,3 @@
+export function hello() {
+  return 'world';
+}`;

      const result = tools.validatePatch(patch);
      expect(result.valid).toBe(true);
    });

    it('should reject patches for disallowed paths', () => {
      const patch = `--- a/config/secret.ts
+++ b/config/secret.ts
@@ -1,0 +2,1 @@
+const secret = 'example';`;

      const result = tools.validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('config/secret.ts');
    });

    it('should handle patches with multiple files', () => {
      const patch = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,0 +2,1 @@
+export const foo = 1;
--- a/test/foo.test.ts
+++ b/test/foo.test.ts
@@ -1,0 +2,1 @@
+test('foo', () => {});`;

      const result = tools.validatePatch(patch);
      expect(result.valid).toBe(true);
    });

    it('should reject if any file in patch is disallowed', () => {
      const patch = `--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,0 +2,1 @@
+export const foo = 1;
--- a/secrets/api.ts
+++ b/secrets/api.ts
@@ -1,0 +2,1 @@
+const key = 'secret';`;

      const result = tools.validatePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('secrets/api.ts');
    });
  });

  describe('readFile', () => {
    it('should read allowed files', () => {
      const filePath = 'src/test.ts';
      const fullPath = path.join(tempDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'export const x = 1;');

      const content = tools.readFile(filePath);
      expect(content).toBe('export const x = 1;');
    });

    it('should throw for disallowed files', () => {
      const filePath = 'secrets/key.txt';
      const fullPath = path.join(tempDir, filePath);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, 'secret');

      expect(() => tools.readFile(filePath)).toThrow('not in allowlist');
    });

    it('should throw for non-existent files', () => {
      expect(() => tools.readFile('src/nonexistent.ts')).toThrow('File not found');
    });
  });

  describe('readFiles', () => {
    it('should read multiple files', () => {
      // Create test files
      const file1 = 'src/a.ts';
      const file2 = 'src/b.ts';
      fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, file1), 'content A');
      fs.writeFileSync(path.join(tempDir, file2), 'content B');

      const result = tools.readFiles([file1, file2]);
      expect(result[file1]).toBe('content A');
      expect(result[file2]).toBe('content B');
    });

    it('should include error messages for failed reads', () => {
      const result = tools.readFiles(['src/exists.ts', 'src/missing.ts']);
      expect(result['src/missing.ts']).toContain('ERROR');
    });
  });
});
