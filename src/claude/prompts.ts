import type { Issue } from "../github/issues.js";

export function issueAnalysisPrompt(issues: Issue[], repoFullName: string, focus: string[]): string {
  const issueList = issues
    .map(
      (i) =>
        `### Issue #${i.number}: ${i.title}\n${i.body?.slice(0, 500) ?? "(no description)"}\nLabels: ${i.labels.map((l) => l.name).join(", ")}\nComments: ${i.comments}`
    )
    .join("\n\n");

  const focusDescription = focus.length > 0
    ? `The contributor is interested in: ${focus.join(", ")}`
    : "The contributor is open to all types of contributions (bug fixes, tests, documentation, refactoring, features)";

  return `You are analyzing open issues from the GitHub repository "${repoFullName}" to find ones suitable for contribution.

${focusDescription}

Here are the open issues:

${issueList}

For each issue, evaluate:
1. Is it feasible to fix without deep domain knowledge?
2. Is there a clear, actionable solution?
3. Does it match the focus areas?
4. Is it already being worked on (check comments count)?

Respond with a JSON array. Each element should have:
- "number": issue number
- "title": issue title
- "feasibility": "easy" | "medium" | "hard" | "skip"
- "reasoning": brief explanation
- "matchesFocus": true/false
- "suggestedApproach": brief plan (1-2 sentences)

Only include issues with feasibility "easy" or "medium". Skip issues that need extensive discussion or domain expertise.

Respond with ONLY the JSON array, no other text.`;
}

export function codebaseScanPrompt(repoFullName: string, focus: string[]): string {
  const focusDescription = focus.length > 0
    ? `Focus on these areas: ${focus.join(", ")}`
    : "Look at all areas: tests, documentation, bug fixes, and refactoring";

  return `You are scanning the codebase of "${repoFullName}" to find improvement opportunities.

${focusDescription}

Look for:
${focus.includes("tests") ? "- Missing test coverage for critical functions" : ""}
${focus.includes("documentation") ? "- Missing or outdated documentation, incomplete READMEs" : ""}
${focus.includes("bug-fixes") ? "- Obvious bugs, edge cases not handled, error handling gaps" : ""}
${focus.includes("refactoring") ? "- Code duplication, overly complex functions, dead code" : ""}

Scan the project structure and key files. For each opportunity found, provide:
- "type": the category (tests/documentation/bug-fixes/refactoring)
- "file": relative file path
- "description": what could be improved
- "confidence": "high" | "medium" | "low"

Respond with ONLY a JSON array of opportunities, sorted by confidence (high first). Maximum 10 items.`;
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
