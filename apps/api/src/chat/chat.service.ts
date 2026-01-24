import {
  Injectable,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { InvoiceQueryService } from '../query/invoice-query.service';
import {
  QueryPlanDto,
  FilterChip,
  QueryIntent,
  GroupByType,
} from '../query/dto/query.dto';
import {
  ChatPlanRequestDto,
  ChatExecuteRequestDto,
  QueryPlanResponse,
  ChatExecuteResponse,
} from './dto/chat.dto';
import { v4 as uuidv4 } from 'uuid';

const QUERY_PLANNER_PROMPT = `You are a query planner for an invoice management system. Your job is to convert natural language questions into structured query plans.

IMPORTANT: Return ONLY valid JSON, no additional text or markdown.

Current context:
- Current date: {{CURRENT_DATE}}
- Organization timezone: {{ORG_TIMEZONE}}
- Allowed invoice statuses: DRAFT, SUBMITTED, NEEDS_INFO, APPROVED, SCHEDULED, PAID, REJECTED
- Known invoice types: {{INVOICE_TYPES}}
- Pharmacy codes: {{PHARMACY_CODES}}

Query plan format:
{
  "intent": "invoice_search" | "invoice_summary" | "sla_summary" | "invoice_detail",
  "filters": {
    "month": "YYYY-MM",
    "pharmacyId": "uuid",
    "pharmacyCode": "string",
    "invoiceType": "string",
    "statusIn": ["STATUS1", "STATUS2"],
    "needsReview": boolean,
    "overdueOnly": boolean,
    "dueDateRange": {"from": "YYYY-MM-DD", "to": "YYYY-MM-DD"},
    "amountRange": {"min": number, "max": number},
    "vendorNameContains": "string",
    "invoiceId": "uuid"
  },
  "groupBy": "pharmacy" | "invoiceType" | "status" | "vendor" | null,
  "sort": [{"field": "dueDate" | "amount" | "createdAt", "direction": "asc" | "desc"}],
  "limit": number
}

Rules:
1. For "unpaid invoices", use statusIn: ["SUBMITTED", "APPROVED", "SCHEDULED"]
2. For "overdue", use overdueOnly: true
3. For "due this week", calculate date range from current date
4. For "missed the 5th" or SLA questions, use intent: "sla_summary"
5. For aggregate questions like "total amount by X", use intent: "invoice_summary" with groupBy
6. For specific invoice questions, use intent: "invoice_detail" with filters.invoiceId
7. Default limit is 20, max is 100
8. If month not specified for SLA, use current month

User question: {{USER_MESSAGE}}

Return the JSON query plan:`;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private prisma: PrismaService,
    private queryService: InvoiceQueryService,
  ) {}

  /**
   * Plan a query from natural language using LLM
   */
  async planQuery(
    dto: ChatPlanRequestDto,
    userId: string,
    orgId: string,
  ): Promise<QueryPlanResponse> {
    // Check if AI is enabled
    if (!this.isAiEnabled()) {
      throw new BadRequestException(
        'AI chat is not enabled. Set AI_ENABLED=true and configure OPENAI_API_KEY.',
      );
    }

    // Get context for the prompt
    const [invoiceTypes, pharmacies] = await Promise.all([
      this.queryService.getInvoiceTypes(),
      this.queryService.getPharmaciesForOrg(orgId),
    ]);

    // Build the prompt
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const orgTimezone = process.env.ORG_TIMEZONE || 'America/New_York';

    let prompt = QUERY_PLANNER_PROMPT
      .replace('{{CURRENT_DATE}}', currentDate)
      .replace('{{ORG_TIMEZONE}}', orgTimezone)
      .replace('{{INVOICE_TYPES}}', invoiceTypes.map((t) => t.name).join(', '))
      .replace(
        '{{PHARMACY_CODES}}',
        pharmacies.map((p) => `${p.code} (${p.name})`).join(', '),
      )
      .replace('{{USER_MESSAGE}}', dto.message);

    // Call LLM
    const llmResponse = await this.callLLM(prompt);

    // Parse and validate the response
    const queryPlan = this.parseQueryPlan(llmResponse);

    // Validate the query plan
    this.validateQueryPlan(queryPlan);

    // Normalize filters (resolve codes to IDs, etc.)
    const normalizedFilters = await this.normalizeFilters(
      queryPlan.filters || {},
      orgId,
    );

    // Generate suggested title
    const suggestedTitle = this.generateTitle(queryPlan, dto.message);

    return {
      queryPlan,
      normalizedFilters,
      suggestedTitle,
      confidence: 0.9, // Could be enhanced with actual confidence scoring
    };
  }

  /**
   * Execute a query plan
   */
  async executeQuery(
    dto: ChatExecuteRequestDto,
    userId: string,
    orgId: string,
  ): Promise<ChatExecuteResponse> {
    const { queryPlan, sessionId, originalMessage } = dto;

    // Validate the query plan
    this.validateQueryPlan(queryPlan);

    // Normalize filters
    const filters = await this.normalizeFilters(
      queryPlan.filters || {},
      orgId,
    );
    filters.orgId = orgId;

    // Execute based on intent
    let result: any;
    let summaryText: string;

    switch (queryPlan.intent) {
      case 'invoice_search':
        result = await this.queryService.searchInvoices(
          filters,
          { page: 1, limit: queryPlan.limit || 20 },
          queryPlan.sort,
        );
        summaryText = this.generateSearchSummary(result, filters);
        break;

      case 'invoice_summary':
        result = await this.queryService.summarizeInvoices(
          filters,
          queryPlan.groupBy as GroupByType,
        );
        summaryText = this.generateSummarySummary(result, queryPlan.groupBy);
        break;

      case 'sla_summary':
        const month =
          filters.month ||
          `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        result = await this.queryService.getSlaSummary(month, orgId);
        summaryText = this.generateSlaSummary(result);
        break;

      case 'invoice_detail':
        if (!filters.invoiceId) {
          throw new BadRequestException(
            'Invoice ID is required for invoice_detail intent',
          );
        }
        result = await this.queryService.getInvoiceDetail(
          filters.invoiceId,
          orgId,
        );
        summaryText = this.generateDetailSummary(result);
        break;

      default:
        throw new BadRequestException(`Unknown intent: ${queryPlan.intent}`);
    }

    // Generate filter chips
    const filterChips = this.generateFilterChips(filters);

    // Create or update session
    const finalSessionId = sessionId || uuidv4();

    // Save the chat interaction (simplified - could be stored in DB)
    this.logger.log(
      `Chat query executed: session=${finalSessionId}, intent=${queryPlan.intent}`,
    );

    return {
      summaryText,
      rows: result.rows || result.pharmacies,
      metrics: result.overall || result.totals,
      filterChips,
      queryPlan,
      sessionId: finalSessionId,
      messageId: uuidv4(),
    };
  }

  /**
   * Check if AI is enabled
   */
  isAiEnabled(): boolean {
    return (
      process.env.AI_ENABLED === 'true' &&
      !!(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
    );
  }

  /**
   * Call the LLM API
   */
  private async callLLM(prompt: string): Promise<string> {
    const provider = process.env.AI_PROVIDER || 'openai';

    if (provider === 'openai') {
      return this.callOpenAI(prompt);
    } else if (provider === 'gemini') {
      return this.callGemini(prompt);
    }

    throw new BadRequestException(`Unknown AI provider: ${provider}`);
  }

  private async callOpenAI(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('OpenAI API key not configured');
    }

    const model = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`OpenAI API error: ${error}`);
      throw new BadRequestException('Failed to generate query plan');
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }

  private async callGemini(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new BadRequestException('Gemini API key not configured');
    }

    const model = process.env.GEMINI_CHAT_MODEL || 'gemini-1.5-flash';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1000 },
        }),
      },
    );

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Gemini API error: ${error}`);
      throw new BadRequestException('Failed to generate query plan');
    }

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  /**
   * Parse query plan from LLM response
   */
  private parseQueryPlan(response: string): QueryPlanDto {
    let jsonText = response.trim();

    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    } else if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      this.logger.error(`Failed to parse query plan: ${response}`);
      throw new BadRequestException(
        'Failed to parse query plan from AI response',
      );
    }
  }

  /**
   * Validate the query plan
   */
  private validateQueryPlan(queryPlan: QueryPlanDto): void {
    const validIntents: QueryIntent[] = [
      'invoice_search',
      'invoice_summary',
      'sla_summary',
      'invoice_detail',
    ];

    if (!queryPlan.intent || !validIntents.includes(queryPlan.intent)) {
      throw new BadRequestException(
        `Invalid intent. Must be one of: ${validIntents.join(', ')}`,
      );
    }

    if (queryPlan.intent === 'invoice_detail' && !queryPlan.filters?.invoiceId) {
      throw new BadRequestException(
        'invoice_detail intent requires filters.invoiceId',
      );
    }

    if (queryPlan.limit && (queryPlan.limit < 1 || queryPlan.limit > 100)) {
      throw new BadRequestException('limit must be between 1 and 100');
    }

    const validGroupBy: (GroupByType | null)[] = [
      'pharmacy',
      'invoiceType',
      'status',
      'vendor',
      null,
    ];
    if (queryPlan.groupBy && !validGroupBy.includes(queryPlan.groupBy)) {
      throw new BadRequestException(
        `Invalid groupBy. Must be one of: ${validGroupBy.filter(Boolean).join(', ')}`,
      );
    }
  }

  /**
   * Normalize filters (resolve codes to IDs, validate dates, etc.)
   */
  private async normalizeFilters(
    filters: any,
    orgId: string,
  ): Promise<Record<string, any>> {
    const normalized: Record<string, any> = { ...filters };

    // Resolve pharmacy code to ID
    if (filters.pharmacyCode && !filters.pharmacyId) {
      const pharmacy = await this.prisma.pharmacy.findFirst({
        where: { code: filters.pharmacyCode, orgId },
      });
      if (pharmacy) {
        normalized.pharmacyId = pharmacy.id;
      }
      delete normalized.pharmacyCode;
    }

    // Resolve invoice type name to ID
    if (filters.invoiceType && !filters.invoiceTypeId) {
      const invoiceType = await this.prisma.invoiceType.findFirst({
        where: { name: { contains: filters.invoiceType, mode: 'insensitive' } },
      });
      if (invoiceType) {
        normalized.invoiceTypeId = invoiceType.id;
      }
      delete normalized.invoiceType;
    }

    // Validate status values
    const validStatuses = [
      'DRAFT',
      'SUBMITTED',
      'NEEDS_INFO',
      'APPROVED',
      'SCHEDULED',
      'PAID',
      'REJECTED',
    ];
    if (filters.statusIn) {
      normalized.statusIn = filters.statusIn.filter((s: string) =>
        validStatuses.includes(s),
      );
    }

    return normalized;
  }

  /**
   * Generate a title for the query
   */
  private generateTitle(queryPlan: QueryPlanDto, message: string): string {
    const maxLength = 50;
    let title = message.slice(0, maxLength);
    if (message.length > maxLength) {
      title += '...';
    }
    return title;
  }

  /**
   * Generate filter chips from filters
   */
  private generateFilterChips(filters: any): FilterChip[] {
    const chips: FilterChip[] = [];

    if (filters.pharmacyId) {
      chips.push({
        key: 'pharmacyId',
        label: 'Pharmacy',
        value: filters.pharmacyId,
        removable: true,
      });
    }

    if (filters.invoiceTypeId) {
      chips.push({
        key: 'invoiceTypeId',
        label: 'Type',
        value: filters.invoiceTypeId,
        removable: true,
      });
    }

    if (filters.statusIn?.length > 0) {
      chips.push({
        key: 'statusIn',
        label: 'Status',
        value: filters.statusIn.join(', '),
        removable: true,
      });
    }

    if (filters.needsReview !== undefined) {
      chips.push({
        key: 'needsReview',
        label: 'Needs Review',
        value: filters.needsReview,
        removable: true,
      });
    }

    if (filters.overdueOnly) {
      chips.push({
        key: 'overdueOnly',
        label: 'Overdue',
        value: true,
        removable: true,
      });
    }

    if (filters.dueDateRange) {
      chips.push({
        key: 'dueDateRange',
        label: 'Due Date',
        value: `${filters.dueDateRange.from || ''} - ${filters.dueDateRange.to || ''}`,
        removable: true,
      });
    }

    if (filters.month) {
      chips.push({
        key: 'month',
        label: 'Month',
        value: filters.month,
        removable: true,
      });
    }

    return chips;
  }

  /**
   * Generate natural language summary for search results
   */
  private generateSearchSummary(result: any, filters: any): string {
    const { totalCount, rows } = result;

    let summary = `Found ${totalCount} invoice${totalCount !== 1 ? 's' : ''}`;

    if (filters.overdueOnly) {
      summary += ' that are overdue';
    }

    if (filters.statusIn?.length > 0) {
      summary += ` with status ${filters.statusIn.join(' or ')}`;
    }

    if (filters.needsReview) {
      summary += ' that need review';
    }

    summary += '.';

    if (rows.length > 0) {
      const totalAmount = rows.reduce(
        (sum: number, r: any) => sum + (r.amount || 0),
        0,
      );
      summary += ` Total amount: $${totalAmount.toLocaleString()}.`;
    }

    return summary;
  }

  /**
   * Generate natural language summary for aggregate results
   */
  private generateSummarySummary(result: any, groupBy?: string | null): string {
    const { overall, groups } = result;

    let summary = `Total: ${overall.count} invoices, $${overall.sumAmount.toLocaleString()} total, $${overall.sumPaid.toLocaleString()} paid.`;

    if (groups.length > 0 && groupBy) {
      summary += ` Grouped by ${groupBy}: `;
      const topGroups = groups.slice(0, 3);
      summary += topGroups
        .map((g: any) => `${g.groupLabel} ($${g.metrics.sumAmount.toLocaleString()})`)
        .join(', ');
      if (groups.length > 3) {
        summary += `, and ${groups.length - 3} more.`;
      }
    }

    return summary;
  }

  /**
   * Generate natural language summary for SLA results
   */
  private generateSlaSummary(result: any): string {
    const { month, totals, pharmacies } = result;

    let summary = `SLA Summary for ${month}: `;
    summary += `${totals.compliantPharmacies}/${totals.totalPharmacies} pharmacies fully compliant. `;

    if (totals.submissionMissedTotal > 0) {
      summary += `${totals.submissionMissedTotal} submission deadline${totals.submissionMissedTotal !== 1 ? 's' : ''} missed. `;
    }

    if (totals.processingMissedTotal > 0) {
      summary += `${totals.processingMissedTotal} processing deadline${totals.processingMissedTotal !== 1 ? 's' : ''} missed.`;
    }

    // Highlight problem pharmacies
    const problemPharmacies = pharmacies.filter(
      (p: any) => p.submissionMissed > 0 || p.processingMissed > 0,
    );
    if (problemPharmacies.length > 0) {
      summary += ` Pharmacies with issues: ${problemPharmacies.map((p: any) => p.pharmacyCode).join(', ')}.`;
    }

    return summary;
  }

  /**
   * Generate natural language summary for invoice detail
   */
  private generateDetailSummary(invoice: any): string {
    return `Invoice ${invoice.invoiceNumber || invoice.id}: ${invoice.status} status, $${Number(invoice.amount || 0).toLocaleString()} from ${invoice.vendor?.name || 'Unknown vendor'}, due ${invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : 'N/A'}.`;
  }
}
