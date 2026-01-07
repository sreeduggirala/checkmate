# Checkmate - Dual-Agent Coding Assistant

A VSCode extension that uses two LLM agents (Builder and Reviewer) to implement code changes with built-in quality checks.

## What is Checkmate?

Checkmate is an AI-powered code assistant that brings the software engineering practice of **peer review** directly into your development workflow. Instead of relying on a single AI agent that might introduce bugs or overlook edge cases, Checkmate uses two specialized agents that work together:

- **The Builder Agent**: Implements your requested changes with surgical precision, focusing on minimal diffs, test-first development, and conservative dependency management.
- **The Reviewer Agent**: Acts as a paranoid quality gate, scrutinizing the Builder's work for edge cases, security vulnerabilities, test coverage gaps, and potential bugs.

### How It Works

When you make a coding request, Checkmate orchestrates an automated review cycle:

1. The Builder generates a patch (code changes) along with tests
2. The system applies the patch and runs your test suite
3. If tests fail, the Builder gets another chance to fix the issues
4. If tests pass, the Reviewer examines the implementation for quality, security, and correctness
5. The cycle continues until the Reviewer approves or a maximum iteration limit is reached

This event-driven process includes sophisticated features like:
- **Arbiter Mode**: Forces concrete test demonstrations when agents disagree
- **Diagnostic Mode**: Runs additional commands when the Reviewer needs more information
- **Oscillation Detection**: Stops infinite loops when agents can't reach consensus
- **Optional Moderator**: A third agent that can break ties in disagreements

### Why Checkmate?

Traditional single-agent coding assistants can be helpful, but they often:
- Miss edge cases and error handling
- Introduce security vulnerabilities
- Write incomplete tests
- Make unnecessary changes beyond what was requested

Checkmate's dual-agent architecture creates natural tension between implementation speed and code quality, resulting in:
- More robust, production-ready code
- Comprehensive test coverage
- Built-in security review
- Focused, minimal changes that don't over-engineer solutions

### Who Is It For?

Checkmate is ideal for developers who want AI assistance without sacrificing code quality. It's particularly useful for:
- Teams that value code review and quality standards
- Projects where bugs in production are costly
- Developers learning best practices through AI-generated examples
- Anyone who wants an extra pair of (AI) eyes on their code

## Architecture

### Components

1. **VSCode Extension** (`/extension`)
   - Provides webview UI with chat interface
   - Connects to daemon via WebSocket
   - Displays real-time updates from agents

2. **Orchestrator Daemon** (`/daemon`)
   - WebSocket server for extension communication
   - Coordinates Builder and Reviewer agents
   - Manages workspace operations (git, files, tests)
   - Enforces path allowlist for security

3. **Shared Types** (`/shared`)
   - Zod schemas for message validation
   - TypeScript types shared between extension and daemon

### Event-Driven Message Flow

The system uses **event-driven role switching** instead of fixed iteration patterns:

```
User Request (VSCode)
    ↓ WebSocket
Daemon receives "run_cycle"
    ↓
Build Shared State (goal, constraints, file tree, test output, open issues)
    ↓
Builder Agent: receives shared state → outputs PLAN, PATCH, TESTS, RUN, RISKS
    ↓
Daemon: validates paths → applies patch → runs commands from RUN
    ↓
EVENT: Tests Failed?
├─ YES → Back to Builder with test failures
└─ NO  → Continue to Reviewer
    ↓
Reviewer Agent: receives shared state + builder's work → outputs VERDICT, ISSUES
    ↓
EVENT: Reviewer Verdict?
├─ "approve" → ✅ Success! Done.
├─ "block" with "uncertainty" → Run diagnostics → Back to Reviewer with results
├─ "block" with "definite_bug" → Back to Builder with issues
├─ "block" with "needs_human" → ❌ Stop - human intervention needed
└─ "request_changes" → Check for stuck issues
    ├─ Same issue 2+ times? → ⚖️  ARBITER MODE:
    │   ├─ Force Builder to write test demonstrating bug
    │   ├─ Test fails? → Bug confirmed, Builder must fix
    │   └─ Test passes? → Bug refuted, remove from issues
    └─ New issue? → Back to Builder with feedback
```

### Structured Agent Messages

Both agents use structured output formats to stay on track:

**Shared State** (always included in prompts):
- GOAL: User's request
- CONSTRAINTS: Languages, style, dependencies, allowed paths
- FILE_TREE: Relevant file structure (optional)
- RECENT_DIFFS: Previous patches applied
- LAST_TEST_OUTPUT: Results from last test run
- OPEN_ISSUES: Problems flagged by reviewer

**Builder Output**:
```json
{
  "plan": ["Step 1", "Step 2", "Step 3"],
  "patch": "unified diff",
  "tests": ["Test case 1", "Test case 2"],
  "run": ["npm test", "npm run lint"],
  "risks": ["Potential issue 1", "Edge case X"]
}
```

**Reviewer Output**:
```json
{
  "verdict": "approve" | "request_changes" | "block",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "description": "What's wrong",
      "how_to_verify": "How to reproduce"
    }
  ],
  "suggested_patch": "optional fix",
  "extra_tests": ["Test for edge case Y"],
  "stopping": "Explanation of why to stop or continue"
}
```

**Benefits of Structured Messages**:
- **Clarity**: Agents must provide complete, organized output (no rambling)
- **On-rails**: Required fields ensure agents don't skip important steps
- **Actionable feedback**: Issues include severity + verification steps
- **Explicit stopping**: Reviewer must explain why to approve or continue
- **Self-documenting**: PLAN and RISKS make builder's thinking transparent
- **Better moderation**: Moderator gets structured context for tie-breaking

### Arbiter Mode (Forcing Test Demonstration)

When the reviewer flags the same issue (tracked by `issue_id`) for **2+ consecutive iterations**, the system enters **Arbiter Mode**:

1. **Builder is forced** to write a test that demonstrates the bug exactly as the reviewer describes
2. **If the test fails**: Bug is confirmed → Builder must fix the implementation
3. **If the test passes**: Bug is refuted → Issue is removed from the list (reviewer was wrong)
4. This prevents endless back-and-forth where agents can't agree

**Why this works**:
- Forces concrete evidence instead of subjective opinions
- Builder can't claim "it works" without proof
- Reviewer can't insist on a bug without reproducibility
- The test becomes permanent regression coverage

**Example**:
```
Iteration 1: Reviewer flags "null-check-validator" - severity: critical
Iteration 2: Builder claims to fix, Reviewer still sees "null-check-validator"
→ ARBITER MODE triggered
→ Builder writes test: validate(null) should throw error
→ Test PASSES (no error thrown) → Bug refuted, issue removed
```

### Diagnostic Mode (Handling Uncertainty)

When the reviewer is **uncertain** and needs more information, they can:

1. Set `verdict: "block"` with `block_reason: "uncertainty"`
2. Provide `diagnostics_needed: ["command1", "command2"]`
3. System runs those commands and feeds output back to reviewer
4. Reviewer re-evaluates with diagnostic results

**Use cases**:
- "I suspect a memory leak but need profiling data"
- "Not sure if async code has race conditions - need verbose logging"
- "Performance might be poor - need benchmark results"

**Example**:
```json
{
  "verdict": "block",
  "block_reason": "uncertainty",
  "diagnostics_needed": [
    "node --trace-warnings index.js",
    "npm run test:verbose",
    "time npm run build"
  ],
  "stopping": "Need diagnostic output to confirm suspected async issue"
}
```

System runs those commands, reviewer gets the output, and can make an informed decision.

## Agent Personalities

The agents have distinct personalities designed to create effective checks and balances:

### Builder Personality: MINIMAL, CONSERVATIVE, TEST-FIRST

The Builder is programmed to be surgical and cautious:

- **Minimal-change**: Makes the smallest possible change to satisfy requirements. Won't refactor unrelated code or "improve" things that weren't asked for.
- **Diff-first mindset**: Thinks in terms of precise diffs, not whole file rewrites. Each hunk has a clear purpose.
- **Test-first approach**: Writes tests BEFORE or ALONGSIDE implementation. Tests should fail without the fix and pass with it.
- **Conservative about dependencies**: Avoids adding new dependencies. Uses standard library when possible. Justifies any new deps in RISKS.

**Philosophy**: "Surgical precision - solve the problem with minimal disruption."

### Reviewer Personality: PARANOID, STRICT, PEDANTIC

The Reviewer is the "immune system" - intentionally thorough and uncompromising:

- **Paranoid about edge cases**: Always assumes inputs can be null, undefined, empty, huge, negative, malformed, Unicode, Infinity. Asks "what if?" constantly.
- **Strict about interfaces/invariants**: Function contracts must be honored. If a function promises non-null, it must deliver. Invariants must be maintained.
- **Sensitive to security & footguns**: Watches for:
  - File deletion without confirmation
  - Shell injection (exec/spawn with unsanitized input)
  - Path traversal (../../../etc/passwd)
  - SQL injection, XSS, unsafe deserialization
  - Hardcoded secrets/credentials
- **Pedantic about tests and reproducibility**: Every issue must be reproducible with concrete steps. Tests should cover realistic scenarios, not just happy paths.

**Philosophy**: "Catch bugs before production. Be thorough and uncompromising on critical issues."

### Why This Works

This personality split creates natural tension:
- Builder wants minimal changes → Reviewer forces comprehensive edge case handling
- Builder focuses on the happy path → Reviewer demands paranoid defensiveness
- Builder trusts inputs → Reviewer assumes everything is malicious
- Builder adds tests → Reviewer finds gaps in coverage

The result: Clean, focused implementations with robust error handling and comprehensive tests.

## Setup

### Prerequisites

- Node.js 20+
- Git (for patch application)
- API keys for OpenAI and/or Anthropic

### Installation

1. **Clone and install dependencies:**

```bash
cd brooklyn
npm install
```

2. **Build all packages:**

```bash
npm run build
```

3. **Set up environment variables:**

```bash
# For OpenAI
export OPENAI_API_KEY="sk-..."

# For Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

4. **Create workspace config:**

Create `.dualagent.json` in your workspace root:

**Basic configuration:**
```json
{
  "builder_provider": "openai",
  "builder_model": "gpt-4-turbo-preview",
  "reviewer_provider": "anthropic",
  "reviewer_model": "claude-3-opus-20240229",
  "test_command": "npm test",
  "allow_paths": [
    "src/**/*.ts",
    "src/**/*.js",
    "test/**/*.ts",
    "test/**/*.test.js"
  ],
  "max_iterations": 3
}
```

**Advanced configuration with all features:**
```json
{
  "builder_provider": "openai",
  "builder_model": "gpt-4-turbo-preview",
  "reviewer_provider": "anthropic",
  "reviewer_model": "claude-3-opus-20240229",
  "test_command": "npm test",
  "allow_paths": ["src/**/*.ts", "test/**/*.ts"],
  "max_iterations": 3,

  "review_mode": "selective",
  "review_on_test_pass": false,
  "review_strictness": "balanced",

  "enable_moderator": true,
  "moderator_provider": "anthropic",
  "moderator_model": "claude-3-5-sonnet-20241022",

  "context_summary_threshold": 2000
}
```

**Config Options:**

Core settings:
- `builder_provider`: `"openai"` or `"anthropic"`
- `reviewer_provider`: `"openai"` or `"anthropic"`
- `builder_model`: Model name for builder (e.g., `"gpt-4-turbo-preview"`, `"claude-3-sonnet-20240229"`)
- `reviewer_model`: Model name for reviewer
- `test_command`: Command to run tests (e.g., `"npm test"`, `"pytest"`)
- `allow_paths`: Array of glob patterns for allowed file paths
- `max_iterations`: Max retry attempts (default: 3)

Advanced settings:
- `review_mode`: `"always"` | `"selective"` | `"final_only"` (default: `"always"`)
  - `always`: Run reviewer after every implementation
  - `selective`: Skip review on first iteration if tests pass
  - `final_only`: Only review at max iterations
- `review_on_test_pass`: Boolean, skip review if tests pass (default: `true`)
- `enable_moderator`: Boolean, enable moderator for disagreement resolution (default: `false`)
- `moderator_provider`: `"openai"` or `"anthropic"` (required if moderator enabled)
- `moderator_model`: Model name for moderator (required if moderator enabled)
- `context_summary_threshold`: Token threshold for context summarization (default: `2000`)
- `review_strictness`: `"lenient"` | `"balanced"` | `"strict"` (default: `"balanced"`)
  - `lenient`: Only flag critical bugs and security issues
  - `balanced`: Standard review (style, bugs, tests)
  - `strict`: Rigorous standards (edge cases, performance, architecture)

### Running the Daemon

```bash
# From repo root
npm run daemon

# Or from daemon directory
cd daemon
npm run dev

# With custom workspace
WORKSPACE_ROOT=/path/to/your/project npm run daemon
```

The daemon will:
1. Load `.dualagent.json` from workspace root
2. Validate API keys
3. Start WebSocket server on `ws://localhost:9876`

### Installing the VSCode Extension

**Option 1: Development Mode**

1. Open the `extension` folder in VSCode
2. Press `F5` to launch Extension Development Host
3. In the new window, run command: `DualAgent: Open Panel`

**Option 2: Package and Install**

```bash
cd extension
npm install -g @vscode/vsce
vsce package
code --install-extension dualagent-0.1.0.vsix
```

## Usage

### Basic Workflow

1. **Start the daemon** in your workspace:
   ```bash
   cd /path/to/your/project
   npm run daemon  # from dualagent repo
   ```

2. **Open VSCode** in your project workspace

3. **Open DualAgent Panel**:
   - Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`)
   - Type: `DualAgent: Open Panel`

4. **Enter a request** in the input field:
   - Example: "Add a function to validate email addresses with tests"
   - Click "Run Cycle"

5. **Monitor progress**:
   - Builder generates implementation
   - Patch is applied
   - Tests run
   - Reviewer provides feedback
   - Loop continues until success or max iterations

### UI Controls

- **Run Cycle**: Start Builder → Test → Review loop with your request
- **Run Tests**: Manually run test command
- **Input Field**: Enter implementation requests

### Message Types

The panel displays color-coded messages:

- **User** (blue): Your requests
- **Status** (gray): System status updates
- **Builder** (green): Builder agent output
- **Reviewer** (purple): Reviewer agent feedback
- **Patch** (orange): Generated diffs
- **Tests** (blue): Test execution output
- **Review** (purple): Structured review (blockers, suggestions, test gaps)
- **Success** (green): Cycle completed successfully
- **Warning** (yellow): Max iterations reached
- **Error** (red): Errors

## Example Session

### Request

```
Add a function to src/math.ts that calculates factorial, with proper error handling and tests
```

### What Happens

1. **Iteration 1**:
   - Builder creates `factorial()` function and test file
   - Patch applied successfully
   - Tests run: ✅ Pass
   - Reviewer: 1 blocker - "Missing validation for negative numbers"

2. **Iteration 2**:
   - Builder adds negative number check
   - Patch applied
   - Tests run: ✅ Pass
   - Reviewer: 0 blockers, 1 suggestion - "Consider adding test for zero"

3. **Result**: ✅ Success! (Tests pass + 0 blockers)

## Security

### Path Allowlist

The `allow_paths` config restricts which files agents can modify:

```json
{
  "allow_paths": [
    "src/**/*.ts",
    "test/**/*.test.ts"
  ]
}
```

- Patches touching disallowed paths are rejected
- Prevents accidental modification of config, secrets, or system files

### Command Execution

- Only the configured `test_command` is executed
- No arbitrary commands from LLM responses (MVP limitation)
- Commands run in workspace directory only

## Testing

### Run Daemon Tests

```bash
cd daemon
npm test
```

Tests cover:
- Path allowlist validation
- Patch validation
- File reading with permissions
- Multi-file operations

## Troubleshooting

### "Config file not found"

Create `.dualagent.json` in your workspace root (where you run the daemon).

### "Missing OPENAI_API_KEY"

Export the required API key before starting daemon:
```bash
export OPENAI_API_KEY="sk-..."
```

### "WebSocket error: ECONNREFUSED"

Ensure daemon is running:
```bash
npm run daemon
```

Check it's listening on `ws://localhost:9876`.

### "Path is not in allowlist"

Update `.dualagent.json` to include the file paths you want to modify:
```json
{
  "allow_paths": ["src/**/*", "lib/**/*"]
}
```

### Extension not connecting

1. Check daemon is running
2. Look for "Connected to daemon" in panel
3. Restart extension: Reload Window in VSCode

## Development

### Project Structure

```
brooklyn/
├── shared/          # Shared types (Zod schemas)
│   └── src/
│       ├── types.ts
│       └── index.ts
├── daemon/          # Orchestrator daemon
│   └── src/
│       ├── index.ts          # Entry point
│       ├── server.ts         # WebSocket server
│       ├── orchestrator.ts   # Agent coordination
│       ├── llm-providers.ts  # OpenAI/Anthropic adapters
│       ├── tools.ts          # File/git/patch operations
│       ├── config.ts         # Config loading
│       └── tools.test.ts     # Unit tests
└── extension/       # VSCode extension
    └── src/
        ├── extension.ts      # Activation
        └── panel.ts          # Webview panel
```

### Watch Mode

For active development:

```bash
# Terminal 1: Watch shared types
cd shared && npm run watch

# Terminal 2: Watch daemon
cd daemon && npm run watch

# Terminal 3: Watch extension
cd extension && npm run watch

# Terminal 4: Run daemon
cd daemon && npm start
```

### Adding New LLM Providers

Implement the `LLMProvider` interface in `daemon/src/llm-providers.ts`:

```typescript
export class MyProvider implements LLMProvider {
  async complete(
    systemPrompt: string,
    userPrompt: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    // Implementation
  }
}
```

## Advanced Features

### Oscillation Detection

The system automatically detects when agents are stuck in an infinite loop:
- **Identical patches**: If the builder produces the exact same patch twice, the cycle stops
- **High similarity**: If patches are >95% similar across iterations, oscillation is detected
- **Stuck blockers**: If the reviewer flags the same blockers for multiple iterations

When oscillation is detected:
1. If moderator is enabled, it's called to resolve the disagreement
2. Otherwise, the cycle exits with an error message requiring human intervention

### Cost/Latency Optimization

Configure `review_mode` to reduce API calls:

```json
{
  "review_mode": "selective",
  "review_on_test_pass": false
}
```

This configuration:
- Skips review on first iteration if tests pass
- Only reviews when tests fail or at final iteration
- Can reduce costs by 30-50% for simple changes

### Context Window Management

Long cycles with many iterations can hit context limits. Enable automatic summarization:

```json
{
  "context_summary_threshold": 2000
}
```

When feedback history exceeds the token threshold:
- Previous iterations are summarized using the builder LLM
- Only key issues and patterns are preserved
- Prevents context overflow on long cycles

### Moderator Layer

Enable a third "moderator" agent to resolve disagreements:

```json
{
  "enable_moderator": true,
  "moderator_provider": "anthropic",
  "moderator_model": "claude-3-5-sonnet-20241022"
}
```

The moderator activates when:
- Oscillation is detected
- Blockers remain unchanged for multiple iterations
- Max iterations reached with unresolved issues

The moderator can:
- **Accept builder**: Override strict reviewer, approve implementation
- **Accept reviewer**: Side with reviewer, reject implementation
- **Reject both**: Recognize fundamental disagreement, request human intervention

### Review Strictness

Tune how aggressively the reviewer critiques code:

```json
{
  "review_strictness": "lenient"
}
```

- **lenient**: Only critical bugs, security issues, broken tests
- **balanced**: Standard review (default)
- **strict**: Rigorous standards, edge cases, performance, architecture

## Limitations (MVP)

- No code indexing or RAG (agents request files explicitly)
- Single workspace at a time
- No persistent conversation history
- Commands from LLM are ignored (only `test_command` runs)
- Basic git operations only (apply patch, diff, status)

## Future Enhancements

- [ ] Code indexing for better context
- [ ] Multi-workspace support
- [ ] Persistent chat history
- [ ] Custom agent prompts
- [ ] Approval workflow for patches
- [ ] Diff viewer in VSCode
- [ ] More granular file permissions
- [ ] Support for more LLM providers

## License

MIT
