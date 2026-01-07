# DualAgent Quickstart

Get up and running in 5 minutes.

## 1. Install & Build

```bash
./setup.sh
# or manually:
# npm install && npm run build
```

## 2. Set API Keys

Pick one or both providers:

```bash
# OpenAI
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

## 3. Configure Your Workspace

The repo includes a sample config (`.dualagent.json`) that works with the example project. For your own project, create:

```json
{
  "builder_provider": "openai",
  "builder_model": "gpt-4-turbo-preview",
  "reviewer_provider": "anthropic",
  "reviewer_model": "claude-3-opus-20240229",
  "test_command": "npm test",
  "allow_paths": ["src/**/*", "test/**/*"]
}
```

## 4. Start Daemon

```bash
npm run daemon
```

You should see:
```
Daemon listening on ws://localhost:9876
Ready! Connect VSCode extension...
```

## 5. Open VSCode

### Development Mode (Recommended for First Try)

1. Open this repo in VSCode
2. Press `F5` (launches Extension Development Host)
3. In the new window: `Cmd+Shift+P` → `DualAgent: Open Panel`

### Installed Extension

```bash
cd extension
npx vsce package
code --install-extension dualagent-0.1.0.vsix
```

Then in any workspace: `Cmd+Shift+P` → `DualAgent: Open Panel`

## 6. Try It!

In the DualAgent panel:

```
Add a multiply function to example/src/calculator.ts with tests
```

Click **Run Cycle** and watch:
1. Builder creates implementation
2. Patch is applied
3. Tests run
4. Reviewer checks quality
5. Loop repeats if issues found

## Troubleshooting

**"Config file not found"**
- Make sure `.dualagent.json` exists in the workspace where the daemon runs

**"Missing API key"**
- Check your exports: `echo $OPENAI_API_KEY`
- Re-export in the terminal where you run the daemon

**"WebSocket error"**
- Confirm daemon is running
- Check it shows `ws://localhost:9876`

**Extension not connecting**
- Look for "Connected to daemon" message in panel
- Check daemon logs for connection

**"Path not in allowlist"**
- Update `allow_paths` in `.dualagent.json`

## What's Next?

- Read [EXAMPLE.md](EXAMPLE.md) for a detailed walkthrough
- See [README.md](README.md) for full documentation
- Check [CONTRIBUTING.md](CONTRIBUTING.md) if you want to develop

## Quick Commands Reference

```bash
# Build everything
npm run build

# Start daemon
npm run daemon

# Run tests
cd daemon && npm test

# Watch mode (development)
cd shared && npm run watch
cd daemon && npm run watch
cd extension && npm run watch
```

## Example Requests to Try

1. **New feature:**
   ```
   Add a power function to example/src/calculator.ts that raises a to the power of b, with tests
   ```

2. **Refactoring:**
   ```
   Extract all error messages in calculator.ts into constants
   ```

3. **Bug fix:**
   ```
   Add validation to calculator functions to reject non-number inputs
   ```

4. **Tests:**
   ```
   Add tests for edge cases in the add function (Infinity, NaN, very large numbers)
   ```

Each request will:
- Generate implementation (Builder)
- Apply changes
- Run tests
- Get quality review (Reviewer)
- Iterate if needed (max 3 times)

Enjoy! 🚀
