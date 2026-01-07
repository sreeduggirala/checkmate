# Checkmate Example Project

This is a demo project for testing the Checkmate dual-agent coding assistant.

## What's This?

This simple calculator app demonstrates how Checkmate's Builder and Reviewer agents work together to implement features with quality checks.

## Structure

- `src/calculator.ts` - A basic Calculator class with arithmetic operations
- `test/calculator.test.ts` - Jest test suite with 6 passing tests

## Running Tests

```bash
npm test
```

## Try It With Checkmate

1. Start the daemon from the repo root:
   ```bash
   npm run daemon
   ```

2. Open the VSCode extension panel

3. Try requests like:
   - "Add a modulo operation to the calculator with tests"
   - "Add validation to prevent operations on NaN values"
   - "Add a power/exponent function"

The Builder will implement your request, tests will run, and the Reviewer will scrutinize the implementation for edge cases, security issues, and test coverage.

## What Checkmate Will Do

- ✅ Builder creates minimal, focused patches
- ✅ Automatically runs tests after each change
- ✅ Reviewer checks for edge cases (null, undefined, Infinity, etc.)
- ✅ Arbiter mode resolves disagreements with concrete test demonstrations
- ✅ Iterates until tests pass and code quality is approved
