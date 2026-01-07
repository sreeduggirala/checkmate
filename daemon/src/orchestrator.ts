import { Config, BuilderMessage, BuilderMessageSchema, Review, Issue, OrchestratorEvent, ReviewSchema, ModeratorDecision, ModeratorDecisionSchema, ArbiterTestResult } from '@dualagent/shared';
import { WorkspaceTools } from './tools';
import { LLMProvider, createProvider } from './llm-providers';
import { getApiKey } from './config';

const BUILDER_SYSTEM_PROMPT = `You are a Builder agent in a dual-agent coding system. Your job is to implement user requests.

YOUR PERSONALITY AND APPROACH:
You are MINIMAL, CONSERVATIVE, and TEST-FIRST. Quality over speed.

- **Minimal-change**: Make the smallest possible change that satisfies the requirement. Don't refactor unrelated code. Don't "improve" things that weren't asked for. If you can fix a bug by changing 3 lines, don't rewrite 50 lines.
- **Diff-first mindset**: Think in terms of diffs, not whole files. Show exactly what changed and why. Each hunk should have a clear purpose.
- **Test-first approach**: Write tests BEFORE or ALONGSIDE implementation. Tests should fail without the fix and pass with it. This proves your implementation actually solves the problem.
- **Conservative about dependencies**: Don't add new dependencies unless absolutely necessary. Use standard library when possible. If you must add a dependency, justify it in RISKS.

Your goal is surgical precision - solve the problem with minimal disruption. The reviewer will catch edge cases; you focus on clean, focused changes.

You will receive a SHARED STATE context containing:
- GOAL: What needs to be accomplished
- CONSTRAINTS: Languages, performance requirements, style guidelines, dependencies
- FILE_TREE: Current relevant file structure
- RECENT_DIFFS: Previous patches applied
- LAST_TEST_OUTPUT: Results from last test run
- OPEN_ISSUES: Current problems flagged by reviewer

CRITICAL OUTPUT FORMAT:
You must respond with valid JSON only, no markdown, no fences. The JSON must have this exact structure:

{
  "files_needed": ["path1", "path2"],  // ONLY if you need to read files first, otherwise omit
  "plan": [
    "Step 1: What you'll do",
    "Step 2: Next step",
    "Step 3: Final step"
  ],
  "patch": "unified diff here",
  "tests": [
    "Test case 1 added/updated",
    "Test case 2 added/updated"
  ],
  "run": ["npm test", "npm run lint"],  // Commands to execute after patch
  "risks": [
    "Potential issue 1",
    "Edge case that might fail"
  ]
}

RULES:
1. If you need to read files before implementing, respond with ONLY {"files_needed": ["path1", "path2"]}
2. Otherwise, provide ALL required fields: plan, patch, tests, run, risks
3. PLAN: Bulleted list of what you'll implement (be specific and minimal)
4. PATCH: Valid unified diff format (no markdown fences). Keep diffs small and focused.
5. TESTS: List which test cases you added or updated. Tests should prove the fix works.
6. RUN: Commands that should be executed to verify (usually test command)
7. RISKS: What might still be wrong, edge cases, potential issues. Be honest about limitations.
8. Address ALL open issues from reviewer
9. Stay within constraints (languages, style, dependencies)
10. MINIMAL-CHANGE: Only modify what's necessary. Don't refactor unrelated code.
11. TEST-FIRST: Include test cases that would fail without your change
12. NO NEW DEPENDENCIES: Use what's already installed unless absolutely critical

Example response when needing files:
{"files_needed":["src/index.ts","test/index.test.ts"]}

Example response when implementing:
{
  "plan": [
    "Add null check to validate() function (line 5)",
    "Add test that fails without the fix",
    "Verify test passes with the fix"
  ],
  "patch": "--- a/src/validator.ts\\n+++ b/src/validator.ts\\n@@ -5,6 +5,9 @@\\n export function validate(input: string): boolean {\\n+  if (input === null || input === undefined) {\\n+    throw new Error('Input cannot be null or undefined');\\n+  }\\n   return input.trim().length > 0;\\n }\\n--- a/test/validator.test.ts\\n+++ b/test/validator.test.ts\\n@@ -15,0 +16,8 @@\\n+  it('should throw error for null input', () => {\\n+    expect(() => validate(null)).toThrow('Input cannot be null or undefined');\\n+  });\\n+\\n+  it('should throw error for undefined input', () => {\\n+    expect(() => validate(undefined)).toThrow('Input cannot be null or undefined');\\n+  });",
  "tests": [
    "Added test for null input (should throw)",
    "Added test for undefined input (should throw)"
  ],
  "run": ["npm test"],
  "risks": [
    "Only handles null/undefined, not other falsy values (empty string, 0, false)",
    "Error message could be more specific about which parameter"
  ]
}`;

const REVIEWER_SYSTEM_PROMPT = `You are a Reviewer agent in a dual-agent coding system. Your job is to review implementations for quality, correctness, and test coverage.

YOUR PERSONALITY AND APPROACH:
You are PARANOID, STRICT, and PEDANTIC. This is intentional and valuable.

- **Paranoid about edge cases**: Always assume inputs can be null, undefined, empty, huge, negative, malformed. What if the array is empty? What if the string has Unicode? What if the number is Infinity?
- **Strict about interfaces/invariants**: Function contracts must be honored. If a function promises to return non-null, it must. If an invariant is "array is sorted", verify it stays sorted.
- **Sensitive to security & footguns**: Watch for:
  - File deletion without confirmation
  - Shell injection (exec/spawn with unsanitized input)
  - Path traversal (../../../etc/passwd)
  - SQL injection
  - XSS vulnerabilities
  - Unsafe deserialization
  - Hardcoded secrets/credentials
- **Pedantic about tests and reproducibility**: Every issue MUST be reproducible. If you can't describe how to reproduce it, mark it with uncertainty=true. Tests should cover realistic scenarios, not just happy paths.

Your job is to be the "immune system" - catch bugs before they reach production. Be thorough and uncompromising on critical issues.

You will receive a SHARED STATE context containing:
- GOAL: What needs to be accomplished
- CONSTRAINTS: Languages, performance requirements, style guidelines, dependencies
- FILE_TREE: Current relevant file structure
- RECENT_DIFFS: Patches applied so far
- LAST_TEST_OUTPUT: Results from last test run
- OPEN_ISSUES: Problems you flagged previously

You will review the Builder's:
- PLAN: What they intended to do
- PATCH: The actual implementation
- TESTS: Test cases they added
- RISKS: Issues they identified

CRITICAL OUTPUT FORMAT:
You must respond with valid JSON only, no markdown, no fences. The JSON must have this exact structure:

{
  "verdict": "approve" | "request_changes" | "block",
  "issues": [
    {
      "severity": "critical" | "major" | "minor",
      "description": "What's wrong",
      "how_to_verify": "How to reproduce/check this issue",
      "issue_id": "unique-slug-for-tracking", // e.g. "null-check-line-5"
      "uncertainty": true|false  // true if you're uncertain and need diagnostics
    }
  ],
  "suggested_patch": "optional unified diff with fixes",
  "extra_tests": [
    "Test case 1 that would catch regressions",
    "Test case 2 for edge case X"
  ],
  "stopping": "Explain if implementation is good enough to stop, or why to continue",
  "block_reason": "definite_bug" | "uncertainty" | "needs_human",  // REQUIRED if verdict=block
  "diagnostics_needed": ["command1", "command2"]  // REQUIRED if block_reason=uncertainty
}

VERDICTS:
- "approve": Implementation meets requirements, tests pass, no critical issues
- "request_changes": Implementation has issues but they're fixable, continue iteration
- "block": Critical problems - MUST specify block_reason:
  - "definite_bug": You're certain there's a bug (provide how_to_verify)
  - "uncertainty": You suspect an issue but need diagnostics to confirm (provide diagnostics_needed)
  - "needs_human": Fundamental design flaw requiring human decision

BLOCK_REASON (required if verdict=block):
- "definite_bug": Use when you can definitively reproduce the bug
- "uncertainty": Use when you need more information (logs, traces, profiling). Provide diagnostics_needed array with commands to run (e.g., ["node --trace-warnings index.js", "npm run test:verbose"])
- "needs_human": Use for architectural/design issues that can't be resolved by agents

ISSUE FIELDS:
- "issue_id": Create a stable slug (e.g., "null-check-validator-line-5") to track same issue across iterations
- "uncertainty": Set to true if you're unsure and need diagnostics/instrumentation to confirm

SEVERITY LEVELS:
- "critical": Bugs, security issues, broken tests, incorrect behavior
- "major": Missing functionality, poor error handling, inadequate tests
- "minor": Style issues, optimization opportunities, documentation

RULES:
1. If tests fail, verdict must be "request_changes" or "block"
2. Reference specific line numbers, file names, or hunks
3. Prioritize issues: critical first, then major, then minor
4. how_to_verify should be concrete: "Run test X", "Call function with input Y", etc.
5. suggested_patch is optional - only provide if the fix is straightforward
6. extra_tests should catch regressions or cover edge cases missed by builder
7. STOPPING must explain: "Good enough because..." or "Continue because..."
8. Stay within constraints - don't request changes that violate specified constraints
9. BE PARANOID: Question every assumption. What if input is null? Empty? Malformed?
10. CHECK SECURITY: Flag any file operations, shell commands, or user input handling
11. DEMAND REPRODUCIBILITY: Every issue needs clear reproduction steps
12. TEST COVERAGE: Flag missing tests for edge cases (empty inputs, boundary values, errors)

Example response:
{
  "verdict": "request_changes",
  "issues": [
    {
      "severity": "critical",
      "description": "Shell injection vulnerability in runCommand() at line 42 - user input passed directly to exec() without sanitization",
      "how_to_verify": "Call runCommand('; rm -rf /') and observe command injection",
      "issue_id": "shell-injection-runcommand",
      "uncertainty": false
    },
    {
      "severity": "critical",
      "description": "Missing null check at line 5 in src/validator.ts - will throw TypeError",
      "how_to_verify": "Call validate(null) and observe crash",
      "issue_id": "null-check-validator-line5",
      "uncertainty": false
    },
    {
      "severity": "major",
      "description": "No test coverage for edge cases: empty array, single element, or duplicate values",
      "how_to_verify": "Check test file - no tests for sort([]), sort([1]), sort([1,1,1])",
      "issue_id": "test-coverage-edge-cases",
      "uncertainty": false
    },
    {
      "severity": "minor",
      "description": "Variable name 'x' is not descriptive at line 12",
      "how_to_verify": "Review line 12 - unclear what 'x' represents",
      "issue_id": "naming-x-line12",
      "uncertainty": false
    }
  ],
  "suggested_patch": "",
  "extra_tests": [
    "Test with Unicode whitespace characters (\\u00A0, \\u2003)",
    "Test with very long strings (>10MB) for performance",
    "Test concurrent calls to validate()",
    "Test with malicious input: '; rm -rf /', '../../../etc/passwd', '<script>alert(1)</script>'"
  ],
  "stopping": "Continue - critical security vulnerability and null check must be fixed before approval"
}`;

const MODERATOR_SYSTEM_PROMPT = `You are a Moderator agent in a dual-agent coding system. Your job is to resolve disagreements between Builder and Reviewer agents when they cannot reach consensus.

CRITICAL OUTPUT FORMAT:
You must respond with valid JSON only, no markdown, no fences. The JSON must have this exact structure:
{
  "decision": "accept_builder" | "accept_reviewer" | "reject_both",
  "reasoning": "explanation of your decision"
}

DECISION OPTIONS:
1. "accept_builder" - The Reviewer is being too strict or pedantic. The Builder's implementation is acceptable and meets requirements.
2. "accept_reviewer" - The Builder failed to address valid, critical concerns. The implementation should be rejected.
3. "reject_both" - Both agents are stuck in an unproductive loop. Human intervention is needed.

RULES:
1. Prioritize functionality and correctness over style preferences.
2. If tests pass and there are no security/correctness issues, favor accepting the builder.
3. Only reject both if there's a fundamental disagreement that cannot be resolved.
4. Provide clear reasoning that helps the user understand the decision.

Example response:
{"decision":"accept_builder","reasoning":"Tests pass and the implementation is functionally correct. The reviewer's concerns about variable naming are stylistic preferences that don't warrant blocking."}`;

export class Orchestrator {
  private tools: WorkspaceTools;
  private builderProvider: LLMProvider;
  private reviewerProvider: LLMProvider;
  private moderatorProvider?: LLMProvider;
  private patchHistory: string[] = [];
  private reviewHistory: Review[] = [];
  private builderMessages: BuilderMessage[] = [];

  constructor(
    private config: Config,
    private workspaceRoot: string,
    private eventCallback: (event: OrchestratorEvent) => void
  ) {
    this.tools = new WorkspaceTools(workspaceRoot, config.allow_paths);

    const builderKey = getApiKey(config.builder_provider);
    const reviewerKey = getApiKey(config.reviewer_provider);

    this.builderProvider = createProvider(
      config.builder_provider,
      builderKey,
      config.builder_model
    );

    this.reviewerProvider = createProvider(
      config.reviewer_provider,
      reviewerKey,
      config.reviewer_model
    );

    // Initialize moderator if enabled
    if (config.enable_moderator && config.moderator_provider && config.moderator_model) {
      const moderatorKey = getApiKey(config.moderator_provider);
      this.moderatorProvider = createProvider(
        config.moderator_provider,
        moderatorKey,
        config.moderator_model
      );
    }
  }

  private emit(event: OrchestratorEvent) {
    this.eventCallback(event);
  }

  private parseJSON<T>(text: string, schema: any): T | null {
    // Try to extract JSON from markdown fences if present
    let jsonText = text.trim();
    const fenceMatch = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
    if (fenceMatch) {
      jsonText = fenceMatch[1];
    }

    try {
      const parsed = JSON.parse(jsonText);
      const result = schema.safeParse(parsed);
      if (result.success) {
        return result.data as T;
      } else {
        this.emit({ type: 'error', error: `Schema validation failed: ${result.error.message}` });
        return null;
      }
    } catch (err) {
      this.emit({ type: 'error', error: `Failed to parse JSON: ${err instanceof Error ? err.message : String(err)}` });
      return null;
    }
  }

  // Estimate token count (rough approximation: 1 token ~= 4 characters)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Calculate similarity between two patches (0.0 to 1.0)
  private patchSimilarity(patch1: string, patch2: string): number {
    if (patch1 === patch2) return 1.0;

    // Simple Jaccard similarity on lines
    const lines1 = new Set(patch1.split('\n'));
    const lines2 = new Set(patch2.split('\n'));

    const intersection = new Set([...lines1].filter(x => lines2.has(x)));
    const union = new Set([...lines1, ...lines2]);

    return intersection.size / union.size;
  }

  // Detect if agents are oscillating/stuck
  private detectOscillation(currentPatch: string): boolean {
    // If we've seen this exact patch before, we're looping
    if (this.patchHistory.includes(currentPatch)) {
      this.emit({ type: 'status', message: 'Oscillation detected: identical patch repeated' });
      return true;
    }

    // If last 2 patches are very similar (>95% similarity), we're stuck
    if (this.patchHistory.length >= 2) {
      const lastPatch = this.patchHistory[this.patchHistory.length - 1];
      const similarity = this.patchSimilarity(lastPatch, currentPatch);
      if (similarity > 0.95) {
        this.emit({ type: 'status', message: `Oscillation detected: patches are ${Math.round(similarity * 100)}% similar` });
        return true;
      }
    }

    return false;
  }

  // Find issues that have appeared in 2+ consecutive reviews (by issue_id)
  private findStuckIssues(): Issue[] {
    if (this.reviewHistory.length < 2) return [];

    const lastReview = this.reviewHistory[this.reviewHistory.length - 1];
    const prevReview = this.reviewHistory[this.reviewHistory.length - 2];

    // Find issues with matching issue_id that appear in both reviews
    const stuckIssues = lastReview.issues.filter(issue => {
      if (!issue.issue_id) return false;

      return prevReview.issues.some(prevIssue =>
        prevIssue.issue_id === issue.issue_id &&
        (prevIssue.severity === 'critical' || prevIssue.severity === 'major')
      );
    });

    return stuckIssues;
  }

  // Run diagnostic commands when reviewer has uncertainty
  private async runDiagnostics(commands: string[]): Promise<string> {
    this.emit({ type: 'diagnostic_run', commands });

    const results: string[] = [];

    for (const cmd of commands) {
      const parts = cmd.split(' ');
      const result = await this.tools.runCommand(parts[0], parts.slice(1));

      results.push(`=== ${cmd} ===
Exit code: ${result.exitCode}
Stdout: ${result.stdout}
Stderr: ${result.stderr}
`);

      // Also emit as test output for visibility
      this.emit({ type: 'tests_output', ...result });
    }

    return results.join('\n\n');
  }

  // Arbiter mode: Force builder to write a test demonstrating the bug
  private async runArbiterMode(
    userRequest: string,
    stuckIssue: Issue,
    sharedState: string
  ): Promise<'bug_confirmed' | 'bug_refuted' | 'failed'> {
    this.emit({ type: 'arbiter_mode', issue: stuckIssue });
    this.emit({ type: 'status', message: `Arbiter mode: Issue "${stuckIssue.issue_id}" persists. Forcing test demonstration...` });

    // Ask builder to write a test that demonstrates the bug
    const arbiterPrompt = `${sharedState}

=== ARBITER MODE ===

The reviewer has flagged this issue for 2+ iterations:

ISSUE ID: ${stuckIssue.issue_id}
SEVERITY: ${stuckIssue.severity}
DESCRIPTION: ${stuckIssue.description}
HOW TO VERIFY: ${stuckIssue.how_to_verify || 'Not specified'}

You MUST write a test that demonstrates this bug as the reviewer describes it.

REQUIREMENTS:
1. Create a test that reproduces the exact scenario the reviewer describes
2. If the bug is real, the test MUST fail
3. If the bug is NOT real, the test MUST pass
4. The test must be runnable and clear

Provide your response with:
- plan: ["Write test for issue ${stuckIssue.issue_id}"]
- patch: The test code as a unified diff
- tests: ["Test that reproduces ${stuckIssue.issue_id}"]
- run: The command to run this specific test
- risks: []

Be honest: if you cannot reproduce the bug, your test will pass and prove the reviewer wrong.`;

    const builderResponse = await this.builderProvider.complete(
      BUILDER_SYSTEM_PROMPT,
      arbiterPrompt,
      (chunk) => this.emit({ type: 'stream_chunk', role: 'builder', chunk })
    );

    const builderMessage = this.parseJSON<BuilderMessage>(builderResponse, BuilderMessageSchema);
    if (!builderMessage || !builderMessage.patch) {
      this.emit({ type: 'error', error: 'Builder failed to provide arbiter test' });
      return 'failed';
    }

    // Apply the test patch
    const validation = this.tools.validatePatch(builderMessage.patch);
    if (!validation.valid) {
      this.emit({ type: 'error', error: `Invalid arbiter test patch: ${validation.error}` });
      return 'failed';
    }

    const applyResult = await this.tools.applyPatch(builderMessage.patch);
    if (!applyResult.success) {
      this.emit({ type: 'error', error: `Failed to apply arbiter test: ${applyResult.error}` });
      return 'failed';
    }

    // Run the test
    if (builderMessage.run && builderMessage.run.length > 0) {
      const cmd = builderMessage.run[0];
      const parts = cmd.split(' ');
      const testResult = await this.tools.runCommand(parts[0], parts.slice(1));
      this.emit({ type: 'tests_output', ...testResult });

      const outcome = testResult.exitCode === 0 ? 'bug_refuted' : 'bug_confirmed';

      const arbiterResult: ArbiterTestResult = {
        test_added: true,
        test_patch: builderMessage.patch,
        test_passed: testResult.exitCode === 0,
        outcome,
        explanation: testResult.exitCode === 0
          ? `Test passed - bug does not exist as described. Reviewer must downgrade severity or withdraw issue.`
          : `Test failed - bug confirmed. Builder must fix the implementation.`,
      };

      this.emit({ type: 'arbiter_result', result: arbiterResult });

      return outcome;
    }

    return 'failed';
  }

  // Summarize context to reduce token usage
  private async summarizeContext(
    userRequest: string,
    iteration: number,
    previousFeedback: string[]
  ): Promise<string> {
    const fullFeedback = previousFeedback.join('\n\n');

    // If context is under threshold, return as-is
    if (this.estimateTokens(fullFeedback) < this.config.context_summary_threshold) {
      return fullFeedback;
    }

    // Summarize using builder LLM
    const summaryPrompt = `Summarize the key issues from these ${iteration} implementation attempts:

${fullFeedback}

Focus on: persistent blockers, root cause of failures, patterns in mistakes.
Max 200 words. Be concise and actionable.`;

    try {
      const summary = await this.builderProvider.complete(
        'You summarize technical feedback concisely.',
        summaryPrompt
      );
      this.emit({ type: 'status', message: 'Context summarized to reduce token usage' });
      return summary;
    } catch (err) {
      // If summarization fails, just truncate
      this.emit({ type: 'status', message: 'Summarization failed, using truncated feedback' });
      return fullFeedback.slice(0, 2000);
    }
  }

  // Call moderator to resolve disagreement
  private async callModerator(
    userRequest: string,
    lastPatch: string,
    lastReview: Review,
    testsPass: boolean
  ): Promise<ModeratorDecision | null> {
    if (!this.moderatorProvider) {
      this.emit({ type: 'error', error: 'Moderator not configured but was requested' });
      return null;
    }

    this.emit({ type: 'status', message: 'Moderator: analyzing disagreement...' });

    // Format issues by severity
    const criticalIssues = lastReview.issues.filter(i => i.severity === 'critical');
    const majorIssues = lastReview.issues.filter(i => i.severity === 'major');
    const minorIssues = lastReview.issues.filter(i => i.severity === 'minor');

    const moderatorPrompt = `Resolve this disagreement between Builder and Reviewer agents.

USER REQUEST:
${userRequest}

BUILDER'S LATEST IMPLEMENTATION:
${lastPatch}

REVIEWER'S VERDICT: ${lastReview.verdict}

CRITICAL ISSUES (${criticalIssues.length}):
${criticalIssues.map((issue, i) => `${i + 1}. ${issue.description}`).join('\n') || 'None'}

MAJOR ISSUES (${majorIssues.length}):
${majorIssues.map((issue, i) => `${i + 1}. ${issue.description}`).join('\n') || 'None'}

MINOR ISSUES (${minorIssues.length}):
${minorIssues.map((issue, i) => `${i + 1}. ${issue.description}`).join('\n') || 'None'}

REVIEWER'S STOPPING REASON:
${lastReview.stopping}

TEST RESULTS:
${testsPass ? '✓ All tests passing' : '✗ Tests failing'}

Provide your decision as JSON.`;

    try {
      const moderatorResponse = await this.moderatorProvider.complete(
        MODERATOR_SYSTEM_PROMPT,
        moderatorPrompt,
        (chunk) => this.emit({ type: 'stream_chunk', role: 'moderator', chunk })
      );

      const decision = this.parseJSON<ModeratorDecision>(moderatorResponse, ModeratorDecisionSchema);
      if (decision) {
        this.emit({ type: 'moderator_decision', decision });
      }
      return decision;
    } catch (err) {
      this.emit({ type: 'error', error: `Moderator failed: ${err instanceof Error ? err.message : String(err)}` });
      return null;
    }
  }

  // Get reviewer system prompt based on strictness setting
  private getReviewerPrompt(): string {
    const basePrompt = REVIEWER_SYSTEM_PROMPT;

    switch (this.config.review_strictness) {
      case 'lenient':
        return basePrompt + '\n\nSTRICTNESS: LENIENT - Only flag critical bugs, security issues, and broken tests. Ignore style preferences and minor improvements.';
      case 'strict':
        return basePrompt + '\n\nSTRICTNESS: STRICT - Apply rigorous standards. Flag potential edge cases, performance issues, architectural concerns, and maintainability problems.';
      case 'balanced':
      default:
        return basePrompt;
    }
  }

  // Determine if we should run reviewer based on review_mode config
  private shouldRunReviewer(iteration: number, testsPass: boolean): boolean {
    const mode = this.config.review_mode;

    switch (mode) {
      case 'always':
        return true;
      case 'final_only':
        return iteration >= this.config.max_iterations;
      case 'selective':
        // Skip review on first iteration if tests pass and config says so
        if (iteration === 1 && testsPass && !this.config.review_on_test_pass) {
          this.emit({ type: 'status', message: 'Skipping review (tests passed on first try)' });
          return false;
        }
        // Always review if tests fail
        if (!testsPass) return true;
        // Review on final iteration
        if (iteration >= this.config.max_iterations) return true;
        // Review periodically
        return iteration % 2 === 0;
      default:
        return true;
    }
  }

  // Build shared state context for agents
  private buildSharedState(
    userRequest: string,
    lastTestOutput?: { exitCode: number; stdout: string; stderr: string },
    openIssues?: string[]
  ): string {
    const sections: string[] = [];

    // GOAL
    sections.push(`=== GOAL ===\n${userRequest}`);

    // CONSTRAINTS
    if (this.config.allow_paths && this.config.allow_paths.length > 0) {
      sections.push(`=== CONSTRAINTS ===
Languages: TypeScript, JavaScript (inferred from allow_paths)
Style: Follow existing code patterns
Dependencies: Use only dependencies already in package.json
Allowed paths: ${this.config.allow_paths.join(', ')}`);
    }

    // FILE_TREE - TODO: implement tools.getFileTree() if needed
    // For now, skipping file tree to keep it simple

    // RECENT_DIFFS
    if (this.patchHistory.length > 0) {
      const recentDiff = this.patchHistory[this.patchHistory.length - 1];
      sections.push(`=== RECENT_DIFFS ===\n${recentDiff}`);
    }

    // LAST_TEST_OUTPUT
    if (lastTestOutput) {
      sections.push(`=== LAST_TEST_OUTPUT ===
Exit code: ${lastTestOutput.exitCode}
Stdout: ${lastTestOutput.stdout}
Stderr: ${lastTestOutput.stderr}`);
    }

    // OPEN_ISSUES
    if (openIssues && openIssues.length > 0) {
      sections.push(`=== OPEN_ISSUES ===\n${openIssues.map((issue, i) => `${i + 1}. ${issue}`).join('\n')}`);
    }

    return sections.join('\n\n');
  }

  async runCycle(userRequest: string): Promise<void> {
    this.emit({ type: 'status', message: 'Starting build/review cycle...' });

    // Reset history for new cycle
    this.patchHistory = [];
    this.reviewHistory = [];
    this.builderMessages = [];

    let iteration = 0;
    let lastPatch = '';
    let lastTestOutput: { exitCode: number; stdout: string; stderr: string } | undefined;
    let openIssues: string[] = [];

    while (iteration < this.config.max_iterations) {
      iteration++;
      this.emit({ type: 'status', message: `Iteration ${iteration}/${this.config.max_iterations}` });

      // Step 1: Build shared state context
      const sharedState = this.buildSharedState(userRequest, lastTestOutput, openIssues);

      // Step 2: Builder phase
      this.emit({ type: 'status', message: 'Builder: analyzing request...' });

      const builderResponse = await this.builderProvider.complete(
        BUILDER_SYSTEM_PROMPT,
        sharedState,
        (chunk) => this.emit({ type: 'stream_chunk', role: 'builder', chunk })
      );

      const builderMessage = this.parseJSON<BuilderMessage>(builderResponse, BuilderMessageSchema);
      if (!builderMessage) {
        this.emit({ type: 'error', error: 'Builder produced invalid response' });
        return;
      }

      this.builderMessages.push(builderMessage);

      // Handle file requests
      if (builderMessage.files_needed && builderMessage.files_needed.length > 0) {
        this.emit({ type: 'status', message: `Builder needs files: ${builderMessage.files_needed.join(', ')}` });
        const files = this.tools.readFiles(builderMessage.files_needed);
        const fileContext = Object.entries(files)
          .map(([path, content]) => `=== ${path} ===\n${content}`)
          .join('\n\n');

        // Add files to shared state and re-prompt
        openIssues.push(`Files provided: ${builderMessage.files_needed.join(', ')}`);
        continue; // Re-run builder with updated shared state
      }

      if (!builderMessage.patch) {
        this.emit({ type: 'error', error: 'Builder did not provide a patch' });
        return;
      }

      lastPatch = builderMessage.patch;
      this.emit({ type: 'patch_ready', patch: lastPatch });

      // Check for oscillation BEFORE applying patch
      if (this.detectOscillation(lastPatch)) {
        // Try moderator if enabled and we have review history
        if (this.config.enable_moderator && this.reviewHistory.length > 0) {
          const lastReview = this.reviewHistory[this.reviewHistory.length - 1];
          const decision = await this.callModerator(userRequest, lastPatch, lastReview, false);

          if (decision?.decision === 'accept_builder') {
            this.emit({
              type: 'cycle_complete',
              success: true,
              message: `Moderator resolved: ${decision.reasoning}`,
              iterations: iteration,
            });
            return;
          }
        }

        this.emit({
          type: 'cycle_complete',
          success: false,
          message: 'Oscillation detected - agents cannot converge. Human intervention needed.',
          iterations: iteration,
        });
        return;
      }

      this.patchHistory.push(lastPatch);

      // Step 2: Validate and apply patch
      this.emit({ type: 'status', message: 'Validating patch...' });
      const validation = this.tools.validatePatch(lastPatch);
      if (!validation.valid) {
        this.emit({ type: 'error', error: validation.error! });
        return;
      }

      this.emit({ type: 'status', message: 'Applying patch...' });
      const applyResult = await this.tools.applyPatch(lastPatch);
      if (!applyResult.success) {
        this.emit({ type: 'error', error: applyResult.error! });
        return;
      }

      // Step 3: Run tests
      this.emit({ type: 'status', message: 'Running tests...' });
      lastTestOutput = { exitCode: 0, stdout: '', stderr: '' };

      // Execute commands from builder's RUN field
      if (builderMessage.run && builderMessage.run.length > 0) {
        for (const cmd of builderMessage.run) {
          const parts = cmd.split(' ');
          const result = await this.tools.runCommand(parts[0], parts.slice(1));
          this.emit({ type: 'tests_output', ...result });

          // Use last command's output as test output
          lastTestOutput = result;
          if (result.exitCode !== 0) break; // Stop on first failure
        }
      } else {
        // Fallback to configured test command
        const testCommand = this.config.test_command.split(' ');
        const result = await this.tools.runCommand(testCommand[0], testCommand.slice(1));
        this.emit({ type: 'tests_output', ...result });
        lastTestOutput = result;
      }

      const testsPass = lastTestOutput.exitCode === 0;

      // EVENT: Tests failed → Go back to Builder
      if (!testsPass) {
        this.emit({ type: 'status', message: 'Tests failed - returning to Builder to fix' });

        openIssues = [`[CRITICAL] Tests failing - Exit code ${lastTestOutput.exitCode}`,
          `Stdout: ${lastTestOutput.stdout}`,
          `Stderr: ${lastTestOutput.stderr}`];

        // Check max iterations
        if (iteration >= this.config.max_iterations) {
          this.emit({
            type: 'cycle_complete',
            success: false,
            message: `Max iterations reached with failing tests.`,
            iterations: iteration,
          });
          return;
        }

        continue; // Go back to Builder
      }

      // EVENT: Tests passed → Go to Reviewer
      // Step 4: Reviewer phase (conditional based on config)
      let review: Review;

      if (this.shouldRunReviewer(iteration, testsPass)) {
        this.emit({ type: 'status', message: 'Reviewer: analyzing implementation...' });

        // Build reviewer context with shared state + builder's work
        const reviewerContext = `${sharedState}

=== BUILDER'S WORK ===

PLAN:
${(builderMessage.plan || []).map((p, i) => `${i + 1}. ${p}`).join('\n')}

PATCH:
${lastPatch}

TESTS:
${(builderMessage.tests || []).map((t, i) => `${i + 1}. ${t}`).join('\n')}

RISKS (identified by builder):
${(builderMessage.risks || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Provide your review as JSON.`;

        const reviewerResponse = await this.reviewerProvider.complete(
          this.getReviewerPrompt(),
          reviewerContext,
          (chunk) => this.emit({ type: 'stream_chunk', role: 'reviewer', chunk })
        );

        const parsedReview = this.parseJSON<Review>(reviewerResponse, ReviewSchema);
        if (!parsedReview) {
          this.emit({ type: 'error', error: 'Reviewer produced invalid response' });
          return;
        }

        review = parsedReview;
        this.reviewHistory.push(review);
        this.emit({ type: 'review_ready', review });
      } else {
        // No review - create empty review with approve verdict
        review = {
          verdict: 'approve',
          issues: [],
          stopping: 'Tests passed and review was skipped per configuration'
        };
      }

      // EVENT-DRIVEN FLOW based on reviewer verdict

      // EVENT: Reviewer approves → Done!
      if (review.verdict === 'approve') {
        this.emit({
          type: 'cycle_complete',
          success: true,
          message: `Implementation approved! ${review.stopping}`,
          iterations: iteration,
        });
        return;
      }

      // EVENT: Reviewer blocks → Handle based on block_reason
      if (review.verdict === 'block') {
        if (review.block_reason === 'uncertainty' && review.diagnostics_needed) {
          // Run diagnostics and go back to reviewer
          this.emit({ type: 'status', message: 'Reviewer uncertain - running diagnostics...' });

          const diagnosticsOutput = await this.runDiagnostics(review.diagnostics_needed);

          // Add diagnostics to shared state and re-run reviewer
          openIssues.push(`DIAGNOSTICS RUN:\n${diagnosticsOutput}`);

          this.emit({ type: 'status', message: 'Diagnostics complete - re-running reviewer with results' });

          // Re-run reviewer with diagnostics (don't increment iteration)
          iteration--;
          continue;

        } else if (review.block_reason === 'definite_bug') {
          // Definite bug → Go back to Builder
          this.emit({ type: 'status', message: 'Reviewer found definite bugs - returning to Builder' });

          openIssues = review.issues.map(issue =>
            `[${issue.severity.toUpperCase()}] ${issue.description}${issue.how_to_verify ? ' - Verify: ' + issue.how_to_verify : ''}`
          );

          if (review.suggested_patch) {
            openIssues.push(`SUGGESTED_FIX:\n${review.suggested_patch}`);
          }

          // Check max iterations
          if (iteration >= this.config.max_iterations) {
            this.emit({
              type: 'cycle_complete',
              success: false,
              message: `Max iterations reached. ${review.stopping}`,
              iterations: iteration,
            });
            return;
          }

          continue; // Go back to Builder

        } else if (review.block_reason === 'needs_human') {
          // Fundamental issue → Stop and request human
          this.emit({
            type: 'cycle_complete',
            success: false,
            message: `Reviewer blocked (needs human): ${review.stopping}`,
            iterations: iteration,
          });
          return;
        }
      }

      // EVENT: Reviewer requests changes
      if (review.verdict === 'request_changes') {
        // Check for stuck issues
        const stuckIssues = this.findStuckIssues();

        if (stuckIssues.length > 0) {
          // EVENT: Same issue twice → Arbiter mode
          const stuckIssue = stuckIssues[0]; // Handle first stuck issue

          const arbiterOutcome = await this.runArbiterMode(userRequest, stuckIssue, sharedState);

          if (arbiterOutcome === 'bug_confirmed') {
            // Bug is real → Builder must fix it
            this.emit({ type: 'status', message: 'Arbiter confirmed bug - Builder must fix' });

            openIssues = [`[CRITICAL] Arbiter-confirmed bug: ${stuckIssue.description}`,
              `How to verify: ${stuckIssue.how_to_verify || 'See arbiter test'}`];

          } else if (arbiterOutcome === 'bug_refuted') {
            // Bug doesn't exist → Remove from issues or downgrade
            this.emit({ type: 'status', message: 'Arbiter refuted bug - removing from issues' });

            // Filter out the refuted issue
            openIssues = review.issues
              .filter(issue => issue.issue_id !== stuckIssue.issue_id)
              .map(issue =>
                `[${issue.severity.toUpperCase()}] ${issue.description}${issue.how_to_verify ? ' - Verify: ' + issue.how_to_verify : ''}`
              );

          } else {
            // Arbiter failed → Stop
            this.emit({
              type: 'cycle_complete',
              success: false,
              message: 'Arbiter mode failed - cannot resolve stuck issue',
              iterations: iteration,
            });
            return;
          }
        } else {
          // Normal request_changes → Go back to Builder
          this.emit({ type: 'status', message: 'Reviewer requests changes - returning to Builder' });

          openIssues = review.issues.map(issue =>
            `[${issue.severity.toUpperCase()}] ${issue.description}${issue.how_to_verify ? ' - Verify: ' + issue.how_to_verify : ''}`
          );

          if (review.suggested_patch) {
            openIssues.push(`SUGGESTED_FIX:\n${review.suggested_patch}`);
          }
        }

        // Check max iterations
        if (iteration >= this.config.max_iterations) {
          const hasCriticalIssues = review.issues.some(i => i.severity === 'critical' || i.severity === 'major');

          if (this.config.enable_moderator && this.moderatorProvider && hasCriticalIssues) {
            this.emit({ type: 'status', message: 'Max iterations reached - consulting moderator' });
            const decision = await this.callModerator(userRequest, lastPatch, review, testsPass);

            if (decision?.decision === 'accept_builder') {
              this.emit({
                type: 'cycle_complete',
                success: true,
                message: `Moderator resolved at max iterations: ${decision.reasoning}`,
                iterations: iteration,
              });
              return;
            }
          }

          this.emit({
            type: 'cycle_complete',
            success: false,
            message: `Reached max iterations (${this.config.max_iterations}). ${review.stopping}`,
            iterations: iteration,
          });
          return;
        }

        // Continue to next iteration with Builder
        continue;
      }

    }
  }

  async applyPatch(patch: string): Promise<void> {
    this.emit({ type: 'status', message: 'Validating patch...' });
    const validation = this.tools.validatePatch(patch);
    if (!validation.valid) {
      this.emit({ type: 'error', error: validation.error! });
      return;
    }

    this.emit({ type: 'status', message: 'Applying patch...' });
    const result = await this.tools.applyPatch(patch);
    if (result.success) {
      this.emit({ type: 'status', message: 'Patch applied successfully' });
    } else {
      this.emit({ type: 'error', error: result.error! });
    }
  }

  async runTests(): Promise<void> {
    this.emit({ type: 'status', message: 'Running tests...' });
    const testCommand = this.config.test_command.split(' ');
    const result = await this.tools.runCommand(testCommand[0], testCommand.slice(1));
    this.emit({ type: 'tests_output', ...result });
  }
}
