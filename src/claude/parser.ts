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

export function parseIssueAnalysis(output: string): AnalyzedIssue[] {
  try {
    const parsed = extractJson(output);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) =>
          item.number &&
          item.feasibility &&
          ["easy", "medium"].includes(item.feasibility)
      );
    }
  } catch (err) {
    logger.error({ err, output: output.slice(0, 200) }, "Failed to parse issue analysis");
  }
  return [];
}

export function parseCodebaseScan(output: string): CodeOpportunity[] {
  try {
    const parsed = extractJson(output);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (item) => item.type && item.description && item.confidence
      );
    }
  } catch (err) {
    logger.error({ err, output: output.slice(0, 200) }, "Failed to parse codebase scan");
  }
  return [];
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
