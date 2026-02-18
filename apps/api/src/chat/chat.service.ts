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
- Current user: {{USER_NAME}} ({{USER_EMAIL}}) - Role: {{USER_ROLE}}
- Allowed invoice statuses: DRAFT, SUBMITTED, NEEDS_INFO, APPROVED, SCHEDULED, PAID, REJECTED
- Known invoice types: {{INVOICE_TYPES}}
- Pharmacy codes: {{PHARMACY_CODES}}

Query plan format:
{
  "intent": "invoice_search" | "invoice_summary" | "sla_summary" | "invoice_detail" | "help",
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
  "limit": number,
  "helpResponse": "string (only for help intent)"
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
9. For questions about "who am I", "my name", "my role", greetings, or anything NOT about invoices, use intent: "help" and include a helpful response in "helpResponse" field. Example: {"intent": "help", "helpResponse": "You are logged in as John Doe (john@example.com) with role ADMIN."}
10. For "help" or "what can you do", use intent: "help" with a list of example questions in helpResponse

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
    const [invoiceTypes, pharmacies, user] = await Promise.all([
      this.queryService.getInvoiceTypes(),
      this.queryService.getPharmaciesForOrg(orgId),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { firstName: true, lastName: true, email: true, role: true },
      }),
    ]);

    const userName = user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Unknown User' : 'Unknown User';

    // Build the prompt
    const now = new Date();
    const currentDate = now.toISOString().split('T')[0];
    const orgTimezone = process.env.ORG_TIMEZONE || 'America/New_York';

    let prompt = QUERY_PLANNER_PROMPT
      .replace('{{CURRENT_DATE}}', currentDate)
      .replace('{{ORG_TIMEZONE}}', orgTimezone)
      .replace('{{USER_NAME}}', userName)
      .replace('{{USER_EMAIL}}', user?.email || 'unknown@example.com')
      .replace('{{USER_ROLE}}', user?.role || 'USER')
      .replace('{{INVOICE_TYPES}}', invoiceTypes.map((t) => t.name).join(', '))
      .replace(
        '{{PHARMACY_CODES}}',
        pharmacies.map((p) => `${p.code} (${p.name})`).join(', '),
      )
      .replace('{{USER_MESSAGE}}', dto.message);

    // Call LLM
    const llmResponse = await this.callLLM(prompt);

    // Parse and validate the response (with fallback for help questions)
    const queryPlan = this.parseQueryPlan(llmResponse, dto.message, userName, user?.email, user?.role);

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

      case 'help':
        // Return help response without querying the database
        result = { rows: [], totalCount: 0 };
        summaryText = queryPlan.helpResponse || 'I can help you with invoice-related questions. Try asking about overdue invoices, totals by pharmacy, or SLA compliance.';
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
    const provider = process.env.AI_PROVIDER || 'openai';

    // Ollama doesn't need an API key - it runs locally
    if (provider === 'ollama') {
      return process.env.AI_ENABLED === 'true';
    }

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
    } else if (provider === 'ollama') {
      return this.callOllama(prompt);
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

  private async callOllama(prompt: string): Promise<string> {
    const baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
    const model = process.env.OLLAMA_MODEL || 'llama3.2';

    this.logger.log(`Calling Ollama (${model}) at ${baseUrl}`);

    const response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0.1,
          num_predict: 1000,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      this.logger.error(`Ollama API error: ${error}`);
      throw new BadRequestException('Failed to generate query plan with local LLM');
    }

    const data = await response.json();
    return data.response || '';
  }

  /**
   * Parse query plan from LLM response with fallback for help questions
   */
  private parseQueryPlan(
    response: string,
    originalMessage?: string,
    userName?: string,
    userEmail?: string,
    userRole?: string,
  ): QueryPlanDto {
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

    // Try to extract JSON from the response if it contains other text
    const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonText = jsonMatch[0];
    }

    try {
      return JSON.parse(jsonText);
    } catch (error) {
      this.logger.warn(`Failed to parse query plan, checking for help fallback: ${response}`);

      // Check if this is a help-type question and create a fallback response
      const lowerMessage = (originalMessage || '').toLowerCase();
      const helpKeywords = ['who am i', 'my name', 'my user', 'hello', 'hi', 'help', 'what can you do', 'how do i'];

      if (helpKeywords.some(keyword => lowerMessage.includes(keyword))) {
        // Return a help response
        return {
          intent: 'help' as any,
          helpResponse: this.generateHelpResponse(lowerMessage, userName, userEmail, userRole),
        };
      }

      this.logger.error(`Failed to parse query plan: ${response}`);
      throw new BadRequestException(
        'Failed to parse query plan from AI response. Try asking about invoices, e.g., "Show me overdue invoices" or "Total amount by pharmacy".',
      );
    }
  }

  /**
   * Generate a help response for non-invoice questions
   */
  private generateHelpResponse(
    message: string,
    userName?: string,
    userEmail?: string,
    userRole?: string,
  ): string {
    if (message.includes('who am i') || message.includes('my name') || message.includes('my user')) {
      return `You are logged in as ${userName || 'Unknown User'} (${userEmail || 'unknown'}) with role: ${userRole || 'USER'}.`;
    }

    if (message.includes('hello') || message.includes('hi')) {
      return `Hello ${userName || 'there'}! I'm your invoice assistant. I can help you with:\n- Searching invoices (e.g., "Show me overdue invoices")\n- Summarizing data (e.g., "Total amount by pharmacy this month")\n- SLA compliance (e.g., "Which pharmacies missed the submission deadline?")\n- Invoice details (e.g., "Show invoice #12345")`;
    }

    // Default help
    return `I can help you with invoice-related questions. Try:\n- "Show me overdue invoices"\n- "Total amount by pharmacy this month"\n- "Which pharmacies missed the submission deadline?"\n- "Unpaid invoices from McKesson"\n- "Invoices needing review"`;
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
      'help',
    ];

    if (!queryPlan.intent || !validIntents.includes(queryPlan.intent)) {
      throw new BadRequestException(
        `Invalid intent. Must be one of: ${validIntents.join(', ')}`,
      );
    }

    // Help intent doesn't need further validation
    if (queryPlan.intent === 'help') {
      return;
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
