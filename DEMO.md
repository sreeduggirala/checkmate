# Checkmate Demo Guide

This guide shows you how to test the Checkmate dual-agent coding system using the included example project.

## Quick Start

### 1. Set Up Your API Key

Create a `.env` file in the repo root (already done for you):

```bash
echo 'ANTHROPIC_API_KEY="your-key-here"' > .env
```

### 2. Start the Daemon

From the repo root:

```bash
npm run daemon
```

You should see:
```
Config loaded from .dualagent.json
Daemon listening on ws://localhost:9876
```

### 3. Open VSCode

1. Open the Checkmate repo in VSCode
2. Press `F5` to launch the Extension Development Host
3. In the new VSCode window, open Command Palette (`Cmd+Shift+P`)
4. Run: `DualAgent: Open Panel`

### 4. Try a Coding Request

In the DualAgent panel, enter one of these example requests:

#### Example 1: Add a New Feature
```
Add a modulo operation to the calculator with comprehensive tests
```

**What happens:**
- Builder creates `modulo(a, b)` method
- Adds test cases for modulo operation
- Tests run automatically
- Reviewer checks: "What about modulo by zero?"
- Builder fixes edge case
- Iteration continues until approved

#### Example 2: Edge Case Handling
```
Add validation to all calculator methods to reject NaN inputs
```

**What happens:**
- Builder adds NaN checks to each method
- Reviewer verifies all edge cases are covered
- Might trigger Arbiter mode if they disagree on implementation

#### Example 3: Security-Sensitive Change
```
Add a function to evaluate mathematical expressions from strings
```

**What happens:**
- Builder might use `eval()` (dangerous!)
- Reviewer flags: "CRITICAL: eval() is a security vulnerability"
- Builder must use a safe parser instead
- Shows the security-paranoid reviewer in action

## What to Observe

### Builder Personality (MINIMAL, CONSERVATIVE, TEST-FIRST)
- Creates small, focused patches
- Writes tests alongside implementation
- Avoids adding unnecessary dependencies
- Lists potential risks/edge cases

### Reviewer Personality (PARANOID, STRICT, PEDANTIC)
- Catches edge cases (null, undefined, Infinity, empty arrays)
- Flags security issues (injection vulnerabilities, unsafe operations)
- Demands comprehensive test coverage
- Won't approve until quality standards are met

### Event-Driven Flow

Watch the cycle in action:

1. **Builder Phase**: Generates patch, tests, and risks
2. **Patch Applied**: System validates and applies changes
3. **Tests Run**: Automatic test execution
4. **Decision Point**:
   - ✅ Tests pass → Reviewer analyzes
   - ❌ Tests fail → Back to Builder with failure details
5. **Reviewer Phase**: Scrutinizes implementation
6. **Next Action**:
   - ✅ `approve` → Done!
   - 🔄 `request_changes` → Back to Builder
   - 🛑 `block` → Special handling (diagnostics, arbiter, or stop)

### Advanced Features You Might See

#### Arbiter Mode
If the Reviewer flags the same issue 2+ times:
- System forces Builder to write a test demonstrating the bug
- Test fails → Bug confirmed, Builder must fix
- Test passes → Bug refuted, issue removed

#### Diagnostic Mode
If Reviewer is uncertain about an issue:
- Requests diagnostic commands (profiling, verbose logs)
- System runs diagnostics
- Reviewer re-evaluates with evidence

#### Oscillation Detection
If Builder produces the same/similar patch repeatedly:
- System detects infinite loop
- Stops to prevent wasted API calls
- (Moderator can resolve if enabled)

## Example Session Walkthrough

Let's say you request: **"Add a square root function to the calculator"**

### Iteration 1

**Builder** (in `example/src/calculator.ts:19`):
```typescript
sqrt(a: number): number {
  return Math.sqrt(a);
}
```

**Tests run**: ✅ Pass

**Reviewer**:
```json
{
  "verdict": "request_changes",
  "issues": [
    {
      "severity": "major",
      "description": "sqrt() doesn't validate negative inputs - will return NaN",
      "how_to_verify": "Call sqrt(-4) and observe NaN result",
      "issue_id": "sqrt-negative-input"
    },
    {
      "severity": "minor",
      "description": "Missing test for negative numbers",
      "issue_id": "sqrt-test-coverage"
    }
  ]
}
```

### Iteration 2

**Builder** (fixing issues):
```typescript
sqrt(a: number): number {
  if (a < 0) {
    throw new Error('Cannot calculate square root of negative number');
  }
  return Math.sqrt(a);
}
```

Adds test:
```typescript
it('should throw error for negative input', () => {
  expect(() => calc.sqrt(-4)).toThrow('Cannot calculate square root of negative number');
});
```

**Tests run**: ✅ Pass

**Reviewer**:
```json
{
  "verdict": "approve",
  "issues": [],
  "stopping": "Implementation correctly handles negative inputs and has comprehensive test coverage. Edge cases are addressed."
}
```

✅ **Success!** Feature implemented with quality checks.

## Configuration Options

The `.dualagent.json` file controls the system:

```json
{
  "builder_provider": "anthropic",
  "builder_model": "claude-3-haiku-20240307",
  "reviewer_provider": "anthropic",
  "reviewer_model": "claude-3-haiku-20240307",
  "test_command": "cd example && npm test",
  "allow_paths": ["example/**/*"],
  "max_iterations": 3
}
```

**Tune for different scenarios:**
- `max_iterations`: Higher for complex features (try 5)
- `review_strictness`: "lenient" | "balanced" | "strict"
- `review_mode`: "always" | "selective" | "final_only"
- `enable_moderator`: true (for tie-breaking)

## Troubleshooting

### "Config file not found"
Make sure you're running the daemon from the repo root where `.dualagent.json` exists.

### "Tests failed"
Check that `example/` directory has all files and `npm install` was run in it.

### "WebSocket connection failed"
Ensure the daemon is running on ws://localhost:9876.

### "Invalid patch - path not in allowlist"
Update `allow_paths` in `.dualagent.json` to include the files you want to modify.

## Next Steps

After trying the demo:

1. **Experiment with different requests** - Try features that require security considerations, complex edge cases, or architectural decisions
2. **Test edge cases** - Request features involving async code, file operations, or error handling to see the Reviewer in action
3. **Tune the config** - Adjust strictness, models, and iteration limits
4. **Use with your own projects** - Point `.dualagent.json` at your codebase

## Architecture Highlights

This demo showcases:

- ✅ **Structured agent output** - JSON schemas keep agents on track
- ✅ **Event-driven orchestration** - No fixed loops, adapts to outcomes
- ✅ **Path allowlist security** - Prevents modification of unintended files
- ✅ **Git-based patching** - Clean, reviewable diffs
- ✅ **Stuck-issue resolution** - Arbiter mode breaks deadlocks
- ✅ **Personality-driven quality** - Builder's minimalism + Reviewer's paranoia = robust code

Happy testing! 🚀
