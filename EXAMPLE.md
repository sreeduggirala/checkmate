# Checkmate Example Walkthrough

This guide walks through a complete example of using Checkmate to add a new feature.

## Scenario

We have a simple calculator module (`example/src/calculator.ts`) with `add` and `subtract` functions. We want to add a `multiply` function with proper tests and error handling.

## Setup

1. **Install dependencies:**

```bash
npm install
npm run build
```

2. **Set API keys:**

```bash
export OPENAI_API_KEY="your-openai-api-key-here"
export ANTHROPIC_API_KEY="your-anthropic-api-key-here"
```

3. **Start the daemon:**

```bash
npm run daemon
```

You should see:
```
=== Checkmate Daemon ===
Workspace: /path/to/checkmate
Config loaded: builder=openai/gpt-4-turbo-preview, reviewer=anthropic/claude-3-opus-20240229
Daemon listening on ws://localhost:9876

Ready! Connect VSCode extension to: ws://localhost:9876
```

4. **Open VSCode:**

- Open the `checkmate` folder in VSCode
- Press F5 if running in development mode, or use the installed extension
- Run command: `Checkmate: Open Panel`

## Example Request

In the Checkmate panel input field, enter:

```
Add a multiply function to example/src/calculator.ts that takes two numbers and returns their product. Include proper TypeScript types and comprehensive tests in example/test/calculator.test.ts. Handle edge cases like multiplying by zero.
```

Click **Run Cycle**.

## What Happens

### Iteration 1: Initial Implementation

**Builder Phase:**
```
[BUILDER] Analyzing request...
[BUILDER] I'll add a multiply function with TypeScript types and tests.
```

The Builder generates a unified diff:

```diff
--- a/example/src/calculator.ts
+++ b/example/src/calculator.ts
@@ -6,0 +7,9 @@
+
+export function multiply(a: number, b: number): number {
+  if (!Number.isFinite(a) || !Number.isFinite(b)) {
+    throw new Error('Both arguments must be finite numbers');
+  }
+  return a * b;
+}
--- a/example/test/calculator.test.ts
+++ b/example/test/calculator.test.ts
@@ -1,4 +1,4 @@
-import { add, subtract } from '../src/calculator';
+import { add, subtract, multiply } from '../src/calculator';
@@ -15,0 +16,19 @@
+
+  describe('multiply', () => {
+    it('should multiply two positive numbers', () => {
+      expect(multiply(3, 4)).toBe(12);
+    });
+
+    it('should multiply by zero', () => {
+      expect(multiply(5, 0)).toBe(0);
+    });
+
+    it('should multiply negative numbers', () => {
+      expect(multiply(-3, -4)).toBe(12);
+    });
+
+    it('should throw error for non-finite numbers', () => {
+      expect(() => multiply(Infinity, 5)).toThrow('finite numbers');
+    });
+  });
```

**Apply Phase:**
```
[STATUS] Validating patch...
[STATUS] Applying patch...
[PATCH] Patch applied successfully
```

**Test Phase:**
```
[STATUS] Running tests...
[TESTS] Exit code: 0

PASS example/test/calculator.test.ts
  Calculator
    add
      ✓ should add two positive numbers (2 ms)
      ✓ should add negative numbers
    subtract
      ✓ should subtract two numbers (1 ms)
    multiply
      ✓ should multiply two positive numbers
      ✓ should multiply by zero
      ✓ should multiply negative numbers (1 ms)
      ✓ should throw error for non-finite numbers

Test Suites: 1 passed, 1 total
Tests:       7 passed, 7 total
```

**Reviewer Phase:**
```
[REVIEWER] Analyzing implementation...
[REVIEW]
Blockers: 0
Non-blocking:
  - Consider simplifying the finite check to just handle the common case
  - The error message could be more specific

Test gaps: 0
```

**Result:**
```
[SUCCESS] Implementation approved! Tests pass and no blockers. (1 iteration)
```

### Success!

The multiply function has been added with:
- ✅ Proper TypeScript types
- ✅ Input validation for non-finite numbers
- ✅ Comprehensive test coverage (positive, negative, zero, error cases)
- ✅ All tests passing
- ✅ No blocking issues from reviewer

## Example with Iteration

Let's say you make a request that needs refinement:

**Request:**
```
Add a divide function to example/src/calculator.ts
```

### Iteration 1

**Builder** creates divide function but forgets division by zero:

```typescript
export function divide(a: number, b: number): number {
  return a / b;
}
```

**Tests** pass (JavaScript returns `Infinity` for division by zero)

**Reviewer** finds issue:
```
Blockers:
  - Division by zero should throw an error, not return Infinity
  - Missing test case for division by zero

Test gaps:
  - No test for b = 0
```

### Iteration 2

**Builder** receives feedback and fixes:

```diff
export function divide(a: number, b: number): number {
+  if (b === 0) {
+    throw new Error('Division by zero');
+  }
  return a / b;
}
```

**Tests** updated with new test case

**Reviewer** approves:
```
Blockers: 0
Non-blocking: []
Test gaps: 0
```

**Result:** Success after 2 iterations!

## Manual Controls

### Run Tests Only

After the cycle completes, you can click **Run Tests** to manually verify:

```
[STATUS] Running tests...
[TESTS] Exit code: 0
All tests passing ✓
```

### Apply Custom Patch

If you have a diff you want to apply manually, use the panel to send it (advanced usage - requires modifying the webview).

## Tips for Best Results

1. **Be specific in requests:**
   - ✅ "Add a multiply function with error handling for non-numbers"
   - ❌ "Add multiplication"

2. **Mention tests explicitly:**
   - ✅ "Include tests for edge cases"
   - The agents will create comprehensive test coverage

3. **Specify file locations:**
   - ✅ "Add to example/src/calculator.ts"
   - Helps the builder target the right files

4. **Trust the iteration loop:**
   - The reviewer will catch issues
   - The builder will fix them in subsequent iterations

## Viewing Changes

After a successful cycle, check the files:

```bash
# See what changed
git diff example/src/calculator.ts
git diff example/test/calculator.test.ts

# Run tests yourself
cd example
npm test
```

## Next Steps

Try these exercises:

1. **Add validation:** "Add input validation to all calculator functions to ensure they receive numbers"

2. **New feature:** "Add a power function that raises a to the power of b, with tests"

3. **Refactoring:** "Extract error messages into constants at the top of calculator.ts"

4. **Bug fix:** "Fix the subtract function to handle very large numbers correctly"

Each request will go through the Builder → Test → Review cycle, with the reviewer ensuring quality and the builder addressing feedback.
