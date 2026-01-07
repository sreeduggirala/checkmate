# Contributing to Checkmate

## Development Setup

1. **Clone the repository:**
```bash
git clone <repo-url>
cd checkmate
```

2. **Install dependencies:**
```bash
npm install
```

3. **Build all packages:**
```bash
npm run build
```

## Project Structure

This is a monorepo with three packages:

- **shared/** - Shared types and schemas (Zod)
- **daemon/** - Orchestrator server (WebSocket, LLM coordination)
- **extension/** - VSCode extension (UI, WebSocket client)

## Development Workflow

### Watch Mode

For active development, run these in separate terminals:

```bash
# Terminal 1: Watch shared types
cd shared
npm run watch

# Terminal 2: Watch daemon
cd daemon
npm run watch

# Terminal 3: Watch extension
cd extension
npm run watch
```

### Running the Daemon

```bash
# Terminal 4: Run daemon with auto-reload
cd daemon
npm run dev
```

### Testing the Extension

**Option 1: Development Host**
1. Open `extension/` folder in VSCode
2. Press `F5` to launch Extension Development Host
3. In the new window, run: `Checkmate: Open Panel`

**Option 2: Package and Install**
```bash
cd extension
vsce package
code --install-extension checkmate-0.1.0.vsix
```

## Testing

### Unit Tests

```bash
# Run daemon tests
cd daemon
npm test

# Watch mode
npm test -- --watch

# Coverage
npm test -- --coverage
```

### Integration Testing

1. Start daemon: `npm run daemon`
2. Open VSCode with extension
3. Try example request in the panel
4. Monitor both daemon logs and panel output

## Code Style

- **TypeScript**: Strict mode enabled
- **Formatting**: Use Prettier (2 spaces, single quotes)
- **Naming**:
  - camelCase for functions/variables
  - PascalCase for classes/types
  - UPPER_CASE for constants

## Adding Features

### New LLM Provider

1. Add provider interface implementation in `daemon/src/llm-providers.ts`:

```typescript
export class NewProvider implements LLMProvider {
  async complete(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    // Implementation
  }
}
```

2. Update `createProvider()` function
3. Add provider type to config schema in `shared/src/types.ts`
4. Update README with new provider option

### New Orchestrator Event

1. Add event type to `OrchestratorEvent` union in `shared/src/types.ts`:

```typescript
| { type: 'new_event'; data: string }
```

2. Handle in daemon's `orchestrator.ts` (emit the event)
3. Handle in extension's `panel.ts` (`_handleDaemonEvent`)
4. Update webview UI if needed

### New Workspace Tool

1. Add method to `WorkspaceTools` class in `daemon/src/tools.ts`:

```typescript
async newTool(): Promise<Result> {
  // Implementation
}
```

2. Add tests in `daemon/src/tools.test.ts`
3. Use in orchestrator loop if needed

## Architecture Notes

### Message Flow

```
VSCode Extension
  ↓ (WebSocket)
Daemon Server
  ↓
Orchestrator
  ├─→ Builder (LLM Provider)
  ├─→ Workspace Tools
  └─→ Reviewer (LLM Provider)
  ↓
Events back to Extension
```

### Type Safety

- All messages validated with Zod schemas
- Shared types ensure extension and daemon stay in sync
- Runtime validation catches errors early

### Security Model

- **Path allowlist**: Only configured paths can be modified
- **Command restriction**: Only test_command executes
- **No eval**: No arbitrary code execution from LLM
- **Workspace-scoped**: All operations within workspace root

## Common Tasks

### Update Dependencies

```bash
npm install <package> -w shared
npm install <package> -w daemon
npm install <package> -w extension
```

### Debug Daemon

Add breakpoints in daemon code, then:
```bash
node --inspect dist/index.js
```

Attach debugger from VSCode or Chrome DevTools.

### Debug Extension

Set breakpoints in extension code, press `F5`, and debug in Extension Development Host.

### View WebSocket Messages

In extension's `panel.ts`, add logging:
```typescript
this.ws.on('message', (data: Buffer) => {
  console.log('Received:', data.toString());
  // ...
});
```

Check Debug Console in VSCode.

## Pull Request Guidelines

1. **Branch naming**: `feature/description` or `fix/description`
2. **Commits**: Clear, descriptive messages
3. **Tests**: Add tests for new features
4. **Documentation**: Update README if adding user-facing features
5. **Type safety**: Ensure no TypeScript errors (`npm run build`)

## Issue Reporting

Include:
- Checkmate version
- VSCode version
- Node.js version
- Steps to reproduce
- Expected vs actual behavior
- Daemon logs (if applicable)
- Extension console output (if applicable)

## Questions?

Open an issue or discussion on GitHub.
