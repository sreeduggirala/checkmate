import { z } from 'zod';

// Config schema
export const ConfigSchema = z.object({
  builder_provider: z.enum(['openai', 'anthropic']),
  reviewer_provider: z.enum(['openai', 'anthropic']),
  builder_model: z.string(),
  reviewer_model: z.string(),
  test_command: z.string(),
  allow_paths: z.array(z.string()),
  max_iterations: z.number().default(3),

  // Review mode options
  review_mode: z.enum(['always', 'selective', 'final_only']).default('always'),
  review_on_test_pass: z.boolean().default(true),

  // Moderator options
  enable_moderator: z.boolean().default(false),
  moderator_provider: z.enum(['openai', 'anthropic']).optional(),
  moderator_model: z.string().optional(),

  // Context management
  context_summary_threshold: z.number().default(2000), // tokens

  // Review strictness
  review_strictness: z.enum(['lenient', 'balanced', 'strict']).default('balanced'),
});

export type Config = z.infer<typeof ConfigSchema>;

// Shared state context (always included in agent prompts)
export const SharedStateSchema = z.object({
  goal: z.string(),
  constraints: z.object({
    languages: z.array(z.string()).optional(),
    performance: z.string().optional(),
    style: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
  }).optional(),
  file_tree: z.string().optional(),
  recent_diffs: z.string().optional(),
  last_test_output: z.string().optional(),
  open_issues: z.array(z.string()).optional(),
});

export type SharedState = z.infer<typeof SharedStateSchema>;

// Builder output schema
export const BuilderMessageSchema = z.object({
  files_needed: z.array(z.string()).optional(), // If builder needs to read files first
  plan: z.array(z.string()).optional(), // Bulleted list of what will be done
  patch: z.string().optional(), // Unified diff or file edits
  tests: z.array(z.string()).optional(), // Tests added or updated
  run: z.array(z.string()).optional(), // Commands to execute
  risks: z.array(z.string()).optional(), // What might still be wrong
});

export type BuilderMessage = z.infer<typeof BuilderMessageSchema>;

// Legacy agent message schema (for backward compatibility during migration)
export const AgentMessageSchema = BuilderMessageSchema;
export type AgentMessage = BuilderMessage;

// Issue schema for reviewer
export const IssueSchema = z.object({
  severity: z.enum(['critical', 'major', 'minor']),
  description: z.string(),
  how_to_verify: z.string().optional(),
  issue_id: z.string().optional(), // Unique ID to track same issue across iterations
  uncertainty: z.boolean().optional(), // True if reviewer is uncertain and needs diagnostics
});

export type Issue = z.infer<typeof IssueSchema>;

// Review schema
export const ReviewSchema = z.object({
  verdict: z.enum(['approve', 'request_changes', 'block']),
  issues: z.array(IssueSchema),
  suggested_patch: z.string().optional(),
  extra_tests: z.array(z.string()).optional(), // Test cases to catch regressions
  stopping: z.string(), // Explanation of why to stop or continue
  block_reason: z.enum(['definite_bug', 'uncertainty', 'needs_human']).optional(), // Why blocking (only if verdict=block)
  diagnostics_needed: z.array(z.string()).optional(), // Specific diagnostics to run if uncertain
});

export type Review = z.infer<typeof ReviewSchema>;

// Legacy compatibility - map old format to new
export const LegacyReviewSchema = z.object({
  blockers: z.array(z.string()),
  non_blocking: z.array(z.string()),
  test_gaps: z.array(z.string()),
  patch: z.string().optional(),
});

// Moderator decision schema
export const ModeratorDecisionSchema = z.object({
  decision: z.enum(['accept_builder', 'accept_reviewer', 'reject_both']),
  reasoning: z.string(),
});

export type ModeratorDecision = z.infer<typeof ModeratorDecisionSchema>;

// Arbiter test result (forces builder to demonstrate bug)
export const ArbiterTestResultSchema = z.object({
  test_added: z.boolean(), // Did builder add the test?
  test_patch: z.string().optional(), // The test code
  test_passed: z.boolean().optional(), // Did the test pass?
  outcome: z.enum(['bug_confirmed', 'bug_refuted', 'test_invalid']),
  explanation: z.string(),
});

export type ArbiterTestResult = z.infer<typeof ArbiterTestResultSchema>;

// Orchestrator event types
export type OrchestratorEvent =
  | { type: 'status'; message: string }
  | { type: 'stream_chunk'; role: 'builder' | 'reviewer' | 'moderator'; chunk: string }
  | { type: 'patch_ready'; patch: string }
  | { type: 'tests_output'; stdout: string; stderr: string; exitCode: number }
  | { type: 'review_ready'; review: Review }
  | { type: 'moderator_decision'; decision: ModeratorDecision }
  | { type: 'arbiter_mode'; issue: Issue }
  | { type: 'arbiter_result'; result: ArbiterTestResult }
  | { type: 'diagnostic_run'; commands: string[] }
  | { type: 'cycle_complete'; success: boolean; message: string; iterations: number }
  | { type: 'error'; error: string };

// WebSocket message schemas
export const ClientMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('run_cycle'),
    request: z.string(),
  }),
  z.object({
    type: z.literal('apply_patch'),
    patch: z.string(),
  }),
  z.object({
    type: z.literal('run_tests'),
  }),
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

// Server sends OrchestratorEvents as JSON
export const ServerMessageSchema = z.object({
  event: z.custom<OrchestratorEvent>(),
});

export type ServerMessage = z.infer<typeof ServerMessageSchema>;
