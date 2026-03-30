import type { Issue } from "../github/issues.js";

/**
 * Unified repo analysis prompt — single Claude call that:
 * 1. Analyzes issues (if any provided)
 * 2. Scans codebase for improvement opportunities
 */
export function repoAnalysisPrompt(
  repoFullName: string,
  focus: string[],
  reasons: string,
  issues: Issue[],
): string {
  const unrestricted = focus.length === 0;

  const focusDescription = unrestricted
    ? "You are open to all types of contributions: bug fixes, tests, documentation, refactoring, features."
    : `Focus on these areas: ${focus.join(", ")}.`;

  const reasonsBlock = reasons
    ? `\nContext from the repo owner: ${reasons}\n`
    : "";

  // Issue section — only if issues are available
  let issueSection = "";
  if (issues.length > 0) {
    const issueList = issues
      .map(
        (i) =>
          `### Issue #${i.number}: ${i.title}\n${i.body?.slice(0, 500) ?? "(no description)"}\nLabels: ${i.labels.map((l) => l.name).join(", ")}\nComments: ${i.comments}`
      )
      .join("\n\n");

    issueSection = `
## Open Issues

The following open issues are available. Evaluate which ones are feasible to fix:

${issueList}

For each actionable issue, include it in the "issues" array with:
- "number": issue number
- "title": issue title
- "feasibility": "easy" | "medium" (skip hard/unclear ones)
- "reasoning": brief explanation
- "matchesFocus": true if it matches the focus areas
- "suggestedApproach": brief plan (1-2 sentences)
`;
  }

  // Determine which codebase areas to scan
  const allAreas = ["tests", "documentation", "bug-fixes", "refactoring"];
  const scanAreas = unrestricted ? allAreas : focus.filter((f) => allAreas.includes(f));

  let codeSection = "";
  if (scanAreas.length > 0 || unrestricted) {
    codeSection = `
## Codebase Analysis

Scan the project structure and code to find improvement opportunities.
${unrestricted ? "Look at all areas: tests, documentation, bug fixes, and refactoring." : `Focus on: ${scanAreas.join(", ")}.`}

Look for:
${scanAreas.includes("tests") || unrestricted ? "- Missing test coverage for critical functions" : ""}
${scanAreas.includes("documentation") || unrestricted ? "- Missing or outdated documentation, incomplete READMEs" : ""}
${scanAreas.includes("bug-fixes") || unrestricted ? "- Obvious bugs, edge cases not handled, error handling gaps" : ""}
${scanAreas.includes("refactoring") || unrestricted ? "- Code duplication, overly complex functions, dead code" : ""}

For each opportunity, include it in the "opportunities" array with:
- "type": the category (tests/documentation/bug-fixes/refactoring)
- "file": relative file path
- "description": what could be improved and how
- "confidence": "high" | "medium" | "low"
`;
  }

  return `You are analyzing the repository "${repoFullName}" to find contribution opportunities.

${focusDescription}
${reasonsBlock}
${issueSection}
${codeSection}

Respond with a JSON object containing two arrays:
{
  "issues": [ ... ],        // analyzed issues (empty array if no issues provided or none actionable)
  "opportunities": [ ... ]  // codebase improvements found (sorted by confidence, max 10)
}

Respond with ONLY the JSON object, no other text.`;
}

export function contributionPrompt(
  repoFullName: string,
  task: { type: string; description: string; issueNumber?: number; file?: string }
): string {
  const issueRef = task.issueNumber ? `\n\nThis addresses issue #${task.issueNumber}.` : "";

  return `You are contributing to the open-source repository "${repoFullName}".

Your task: ${task.description}${issueRef}
${task.file ? `\nRelevant file: ${task.file}` : ""}

Guidelines:
- Make minimal, focused changes. Do not refactor unrelated code.
- Follow the project's existing code style and conventions.
- If adding tests, follow the existing test patterns.
- If fixing a bug, add a test that would have caught it.
- Do NOT modify CI/CD configs, build files, or project settings.
- Do NOT add new dependencies unless absolutely necessary.

Make your changes now. Edit the files directly.`;
}

export function prDescriptionPrompt(diff: string, task: { type: string; description: string; issueNumber?: number }): string {
  const issueRef = task.issueNumber ? `\nCloses #${task.issueNumber}` : "";

  return `Based on the following diff, write a PR title and description for the repository.

The task was: ${task.description}

Diff:
\`\`\`
${diff.slice(0, 5000)}
\`\`\`

Respond with a JSON object:
{
  "title": "concise PR title (under 70 chars, imperative mood)",
  "body": "## Summary\\n<description of changes>\\n\\n## Changes\\n<bullet list of changes>\\n${issueRef}\\n\\n---\\n*This PR was generated with the assistance of AI.*"
}

Respond with ONLY the JSON object, no other text.`;
}

// Legacy aliases for backward compatibility
export const issueAnalysisPrompt = repoAnalysisPrompt;
export const codebaseScanPrompt = repoAnalysisPrompt;
