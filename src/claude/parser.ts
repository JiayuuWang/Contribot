import { logger } from "../utils/logger.js";

export interface AnalyzedIssue {
  number: number;
  title: string;
  feasibility: "easy" | "medium" | "hard" | "skip";
  reasoning: string;
  matchesFocus: boolean;
  suggestedApproach: string;
}

export interface CodeOpportunity {
  type: string;
  file: string;
  description: string;
  confidence: "high" | "medium" | "low";
}

export interface PRDescription {
  title: string;
  body: string;
}

export interface RepoAnalysis {
  issues: AnalyzedIssue[];
  opportunities: CodeOpportunity[];
}

/**
 * Parse the unified repo analysis output containing both issues and opportunities.
 */
export function parseRepoAnalysis(output: string): RepoAnalysis {
  try {
    const parsed = extractJson(output);

    const issues = Array.isArray(parsed?.issues)
      ? parsed.issues.filter(
          (item: any) =>
            item.number &&
            item.feasibility &&
            ["easy", "medium"].includes(item.feasibility)
        )
      : [];

    const opportunities = Array.isArray(parsed?.opportunities)
      ? parsed.opportunities.filter(
          (item: any) => item.type && item.description && item.confidence
        )
      : [];

    return { issues, opportunities };
  } catch (err) {
    logger.error({ err, output: output.slice(0, 200) }, "Failed to parse repo analysis");
    return { issues: [], opportunities: [] };
  }
}

// Legacy functions — kept for backward compatibility
export function parseIssueAnalysis(output: string): AnalyzedIssue[] {
  return parseRepoAnalysis(output).issues;
}

export function parseCodebaseScan(output: string): CodeOpportunity[] {
  return parseRepoAnalysis(output).opportunities;
}

export function parsePRDescription(output: string): PRDescription | null {
  try {
    const parsed = extractJson(output);
    if (parsed && parsed.title && parsed.body) {
      return { title: parsed.title, body: parsed.body };
    }
  } catch (err) {
    logger.error({ err, output: output.slice(0, 200) }, "Failed to parse PR description");
  }
  return null;
}

function extractJson(text: string): any {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try to find JSON in the text (between ``` or just brackets)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
      text.match(/(\[[\s\S]*\])/) ||
      text.match(/(\{[\s\S]*\})/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[1]);
    }

    throw new Error("No JSON found in output");
  }
}
