import { IsString, IsOptional, ValidateNested, IsEnum, IsArray, IsNumber, IsBoolean, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryPlanDto, FilterChip } from '../../query/dto/query.dto';

export class ChatPlanRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsString()
  sessionId?: string;
}

export class ChatExecuteRequestDto {
  @ValidateNested()
  @Type(() => QueryPlanDto)
  queryPlan: QueryPlanDto;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsOptional()
  @IsString()
  originalMessage?: string;
}

export interface QueryPlanResponse {
  queryPlan: QueryPlanDto;
  normalizedFilters: Record<string, any>;
  suggestedTitle: string;
  confidence: number;
  rawLlmResponse?: string; // For debugging, not exposed in production
}

export interface ChatExecuteResponse {
  summaryText: string;
  rows?: any[];
  metrics?: any;
  filterChips: FilterChip[];
  queryPlan: QueryPlanDto;
  sessionId: string;
  messageId: string;
}

export interface ChatSession {
  id: string;
  userId: string;
  orgId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  queryPlan?: QueryPlanDto;
  resultSummary?: string;
  filterChips?: FilterChip[];
  createdAt: Date;
}

// Query plan schema for validation
export const QUERY_PLAN_SCHEMA = {
  type: 'object',
  required: ['intent'],
  properties: {
    intent: {
      type: 'string',
      enum: ['invoice_search', 'invoice_summary', 'sla_summary', 'invoice_detail'],
    },
    filters: {
      type: 'object',
      properties: {
        month: { type: 'string', pattern: '^\\d{4}-\\d{2}$' },
        pharmacyId: { type: 'string' },
        pharmacyCode: { type: 'string' },
        invoiceType: { type: 'string' },
        statusIn: { type: 'array', items: { type: 'string' } },
        needsReview: { type: 'boolean' },
        overdueOnly: { type: 'boolean' },
        dueDateRange: {
          type: 'object',
          properties: {
            from: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
            to: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
          },
        },
        amountRange: {
          type: 'object',
          properties: {
            min: { type: 'number', minimum: 0 },
            max: { type: 'number' },
          },
        },
        vendorNameContains: { type: 'string' },
        invoiceId: { type: 'string' },
      },
    },
    groupBy: {
      type: 'string',
      enum: ['pharmacy', 'invoiceType', 'status', 'vendor', null],
    },
    sort: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: {
            type: 'string',
            enum: ['dueDate', 'amount', 'createdAt', 'invoiceDate', 'submittedAt'],
          },
          direction: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    limit: { type: 'number', minimum: 1, maximum: 100 },
  },
};
