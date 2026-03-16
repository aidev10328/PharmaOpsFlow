import { Injectable } from '@nestjs/common';

export interface StructuredReport {
  title: string;
  summary: string;
  stepsToReproduce: string[];
  expectedResult: string;
  actualResult: string;
  severity: string;
  category: string;
  confidence: number;
  notes: string;
}

export interface StructuringInput {
  issueType: string;
  businessImpact: string;
  userTitle?: string;
  userDescription: string;
  voiceTranscript?: string;
  pageUrl?: string;
  pageRoute?: string;
  pageTitle?: string;
  consoleErrors?: any;
  failedApiRequests?: any;
}

/**
 * Abstract interface for issue structuring.
 * Current: deterministic implementation.
 * Future: AI-powered implementation.
 */
export interface IIssueStructuringService {
  generateReport(input: StructuringInput): Promise<StructuredReport>;
}

export const ISSUE_STRUCTURING_SERVICE = 'ISSUE_STRUCTURING_SERVICE';

@Injectable()
export class DeterministicStructuringService implements IIssueStructuringService {
  async generateReport(input: StructuringInput): Promise<StructuredReport> {
    const title = this.generateTitle(input);
    const summary = this.generateSummary(input);
    const steps = this.generateSteps(input);
    const severity = this.inferSeverity(input);
    const category = this.inferCategory(input);

    return {
      title,
      summary,
      stepsToReproduce: steps,
      expectedResult: this.inferExpectedResult(input),
      actualResult: this.inferActualResult(input),
      severity,
      category,
      confidence: 0.6,
      notes: 'Generated via deterministic analysis. Review and refine as needed.',
    };
  }

  private generateTitle(input: StructuringInput): string {
    if (input.userTitle) return input.userTitle;

    const typeLabels: Record<string, string> = {
      BUG: 'Bug',
      FUNCTIONAL_ISSUE: 'Functional Issue',
      PERFORMANCE_ISSUE: 'Performance Issue',
      UI_UX_ISSUE: 'UI/UX Issue',
      DATA_ISSUE: 'Data Issue',
      QUESTION: 'Question',
      FEATURE_REQUEST: 'Feature Request',
    };

    const typeLabel = typeLabels[input.issueType] || input.issueType;
    const pageContext = input.pageTitle || this.extractPageName(input.pageRoute);

    // Extract first meaningful sentence from description
    const firstSentence = input.userDescription
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 5)[0] || input.userDescription.substring(0, 80);

    const truncated = firstSentence.length > 70
      ? firstSentence.substring(0, 67) + '...'
      : firstSentence;

    return pageContext
      ? `[${typeLabel}] ${pageContext}: ${truncated}`
      : `[${typeLabel}] ${truncated}`;
  }

  private generateSummary(input: StructuringInput): string {
    const parts: string[] = [];

    parts.push(input.userDescription);

    if (input.voiceTranscript) {
      parts.push(`\n\nVoice transcript: ${input.voiceTranscript}`);
    }

    if (input.consoleErrors && Array.isArray(input.consoleErrors) && input.consoleErrors.length > 0) {
      parts.push(`\n\nConsole errors captured:\n${input.consoleErrors.map((e: string) => `- ${e}`).join('\n')}`);
    }

    if (input.failedApiRequests && Array.isArray(input.failedApiRequests) && input.failedApiRequests.length > 0) {
      const apiErrors = input.failedApiRequests.map((r: any) =>
        `- ${r.method || 'GET'} ${r.url || 'unknown'} → ${r.status || 'failed'}`
      ).join('\n');
      parts.push(`\n\nRecent failed API requests:\n${apiErrors}`);
    }

    return parts.join('');
  }

  private generateSteps(input: StructuringInput): string[] {
    const steps: string[] = [];

    // Step 1: Navigation context
    if (input.pageUrl || input.pageRoute) {
      steps.push(`Navigate to ${input.pageTitle || input.pageRoute || input.pageUrl}`);
    } else {
      steps.push('Open the application');
    }

    // Step 2-N: Parse description for action-oriented sentences
    const description = input.userDescription;
    const sentences = description
      .split(/[.!?\n]/)
      .map(s => s.trim())
      .filter(s => s.length > 5);

    const actionPatterns = /^(click|tap|select|enter|type|submit|open|go|navigate|scroll|drag|press|try|when|after|before|if)/i;

    let addedFromDescription = false;
    for (const sentence of sentences) {
      if (actionPatterns.test(sentence)) {
        steps.push(sentence);
        addedFromDescription = true;
      }
    }

    if (!addedFromDescription && sentences.length > 0) {
      // Use description as context for a generic step
      steps.push(`Perform the action described: "${sentences[0]}"`);
    }

    steps.push('Observe the result');

    return steps;
  }

  private inferSeverity(input: StructuringInput): string {
    const impactMap: Record<string, string> = {
      BLOCKING: 'CRITICAL',
      MAJOR: 'HIGH',
      MINOR: 'MEDIUM',
      COSMETIC: 'LOW',
      SUGGESTION: 'INFO',
    };
    return impactMap[input.businessImpact] || 'MEDIUM';
  }

  private inferCategory(input: StructuringInput): string {
    const route = input.pageRoute || input.pageUrl || '';

    if (route.includes('/invoice')) return 'Invoices';
    if (route.includes('/pharmacy')) return 'Pharmacy';
    if (route.includes('/admin')) return 'Administration';
    if (route.includes('/oversight') || route.includes('/sla')) return 'SLA & Compliance';
    if (route.includes('/extraction')) return 'AI Extraction';
    if (route.includes('/chat')) return 'AI Chat';
    if (route.includes('/dashboard')) return 'Dashboard';
    if (route.includes('/login') || route.includes('/auth')) return 'Authentication';
    if (route.includes('/requirement')) return 'Requirements';

    return 'General';
  }

  private inferExpectedResult(input: StructuringInput): string {
    const desc = input.userDescription.toLowerCase();

    if (input.issueType === 'BUG' || input.issueType === 'FUNCTIONAL_ISSUE') {
      return 'The feature should work as designed without errors.';
    }
    if (input.issueType === 'PERFORMANCE_ISSUE') {
      return 'The page/action should respond within acceptable time limits.';
    }
    if (input.issueType === 'UI_UX_ISSUE') {
      return 'The UI should display correctly and be user-friendly.';
    }
    if (input.issueType === 'DATA_ISSUE') {
      return 'Data should be accurate, complete, and consistent.';
    }
    return 'The system should work as expected.';
  }

  private inferActualResult(input: StructuringInput): string {
    // Try to extract what actually happened from description
    const desc = input.userDescription;
    const patterns = [
      /(?:instead|but|however|actually)[,:]?\s*(.+?)(?:\.|$)/i,
      /(?:error|fail|broken|wrong|incorrect|missing|not working)[:\s]*(.+?)(?:\.|$)/i,
    ];

    for (const pattern of patterns) {
      const match = desc.match(pattern);
      if (match && match[1] && match[1].trim().length > 10) {
        return match[1].trim();
      }
    }

    return `Issue reported: ${desc.substring(0, 150)}${desc.length > 150 ? '...' : ''}`;
  }

  private extractPageName(route?: string): string {
    if (!route) return '';
    const parts = route.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return last
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }
}
