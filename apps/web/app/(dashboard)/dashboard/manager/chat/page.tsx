'use client';

import { useAuth } from '../../../../../components/AuthProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { apiFetch } from '../../../../../lib/api';
import Link from 'next/link';

type FilterChip = {
  key: string;
  label: string;
  value: string | boolean;
  removable: boolean;
};

type QueryPlan = {
  intent: string;
  filters: Record<string, any>;
  groupBy?: string;
  sort?: { field: string; direction: string }[];
  limit?: number;
};

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  queryPlan?: QueryPlan;
  filterChips?: FilterChip[];
  result?: any;
  timestamp: Date;
  status?: 'pending' | 'planned' | 'executed' | 'error';
};

type ChatStatus = {
  enabled: boolean;
  provider: string;
};

const EXAMPLE_QUERIES = [
  'Show me overdue invoices',
  'Total amount by pharmacy this month',
  'Which pharmacies missed the submission deadline?',
  'Unpaid invoices from McKesson',
  'Invoices needing review',
  'SLA summary for January 2024',
];

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  SUBMITTED: 'bg-blue-100 text-blue-800',
  NEEDS_INFO: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  SCHEDULED: 'bg-purple-100 text-purple-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-red-100 text-red-800',
};

export default function ManagerChatPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [chatStatus, setChatStatus] = useState<ChatStatus | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');
  const [showQueryPlan, setShowQueryPlan] = useState<string | null>(null);

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Check chat status
  useEffect(() => {
    async function checkStatus() {
      try {
        const res = await apiFetch('/v1/chat/status');
        if (res.ok) {
          const data = await res.json();
          setChatStatus(data);
        }
      } catch (e) {
        console.error('Failed to check chat status:', e);
        setChatStatus({ enabled: false, provider: 'unknown' });
      }
    }
    if (user && ['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
      checkStatus();
    }
  }, [user]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Format helpers
  const formatCurrency = (amount: string | number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Number(amount));
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  // Send message
  const sendMessage = useCallback(async (messageText: string) => {
    if (!messageText.trim() || isProcessing) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    const assistantMessage: ChatMessage = {
      id: `assistant-${Date.now()}`,
      role: 'assistant',
      content: 'Planning query...',
      timestamp: new Date(),
      status: 'pending',
    };

    setMessages(prev => [...prev, userMessage, assistantMessage]);
    setInput('');
    setIsProcessing(true);

    try {
      // Step 1: Plan the query
      const planRes = await apiFetch('/v1/chat/plan', {
        method: 'POST',
        body: JSON.stringify({ message: messageText, sessionId }),
      });

      if (!planRes.ok) {
        const error = await planRes.json();
        throw new Error(error.message || 'Failed to plan query');
      }

      const planData = await planRes.json();
      const { queryPlan, normalizedFilters, suggestedTitle } = planData.data;

      // Update message with plan
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: `Query planned: ${suggestedTitle}`, queryPlan, status: 'planned' as const }
            : m
        )
      );

      // Step 2: Execute the query
      const executeRes = await apiFetch('/v1/chat/execute', {
        method: 'POST',
        body: JSON.stringify({
          queryPlan,
          sessionId,
          originalMessage: messageText,
        }),
      });

      if (!executeRes.ok) {
        const error = await executeRes.json();
        throw new Error(error.message || 'Failed to execute query');
      }

      const executeData = await executeRes.json();
      const { summaryText, rows, metrics, filterChips, sessionId: newSessionId } = executeData.data;

      // Update session ID
      if (newSessionId) {
        setSessionId(newSessionId);
      }

      // Update message with results
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: summaryText,
                queryPlan,
                filterChips,
                result: { rows, metrics },
                status: 'executed' as const,
              }
            : m
        )
      );
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMessage.id
            ? {
                ...m,
                content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
                status: 'error' as const,
              }
            : m
        )
      );
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, sessionId]);

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Handle example click
  const handleExampleClick = (example: string) => {
    sendMessage(example);
  };

  // Clear chat
  const clearChat = () => {
    setMessages([]);
    setSessionId('');
  };

  if (loading) {
    return <div className="text-gray-500">Loading...</div>;
  }

  if (!user || !['ADMIN', 'COMPANY_MANAGER'].includes(user.role)) {
    return null;
  }

  // Chat not enabled
  if (chatStatus && !chatStatus.enabled) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="page-title">AI Assistant</h1>
            <p className="text-gray-600 mt-1">Natural language invoice queries</p>
          </div>
          <Link href="/dashboard/manager/explore" className="btn-secondary">
            Use Filter Explorer
          </Link>
        </div>

        <div className="card p-8 text-center">
          <div className="text-gray-400 mb-4">
            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">AI Assistant Not Enabled</h3>
          <p className="text-gray-600 mb-4">
            To use the AI chat assistant, set <code className="bg-gray-100 px-1 rounded">AI_ENABLED=true</code> and
            configure your API key in the environment.
          </p>
          <Link href="/dashboard/manager/explore" className="btn-primary">
            Use Filter Explorer Instead
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-12rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="page-title">AI Assistant</h1>
          <p className="text-gray-600 text-sm">
            Ask questions about invoices in natural language
            {chatStatus && (
              <span className="ml-2 text-xs text-gray-400">
                (powered by {chatStatus.provider})
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={clearChat} className="btn-secondary text-sm">
            Clear Chat
          </button>
          <Link href="/dashboard/manager/explore" className="btn-secondary text-sm">
            Filter Explorer
          </Link>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto card p-4 mb-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Start a Conversation</h3>
            <p className="text-gray-600 mb-6">Ask about invoices, SLA compliance, or financial summaries</p>

            {/* Example Queries */}
            <div className="flex flex-wrap justify-center gap-2">
              {EXAMPLE_QUERIES.map((example, i) => (
                <button
                  key={i}
                  onClick={() => handleExampleClick(example)}
                  className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-4 py-3 ${
                    message.role === 'user'
                      ? 'bg-primary text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  {/* Message Content */}
                  <p className={message.status === 'pending' ? 'animate-pulse' : ''}>
                    {message.content}
                  </p>

                  {/* Filter Chips */}
                  {message.filterChips && message.filterChips.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {message.filterChips.map((chip, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2 py-0.5 bg-white/20 rounded text-xs"
                        >
                          <span className="font-medium">{chip.label}:</span>{' '}
                          {String(chip.value)}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Query Plan Toggle */}
                  {message.queryPlan && (
                    <button
                      onClick={() =>
                        setShowQueryPlan(showQueryPlan === message.id ? null : message.id)
                      }
                      className="text-xs underline mt-2 opacity-70 hover:opacity-100"
                    >
                      {showQueryPlan === message.id ? 'Hide' : 'Show'} query plan
                    </button>
                  )}

                  {/* Query Plan Details */}
                  {showQueryPlan === message.id && message.queryPlan && (
                    <pre className="mt-2 text-xs bg-black/10 p-2 rounded overflow-x-auto">
                      {JSON.stringify(message.queryPlan, null, 2)}
                    </pre>
                  )}

                  {/* Result Preview */}
                  {message.result && message.result.rows && message.result.rows.length > 0 && (
                    <div className="mt-3 bg-white rounded-lg overflow-hidden border border-gray-200">
                      {message.result.rows[0]?.invoiceNumber !== undefined || message.result.rows[0]?.status !== undefined ? (
                        /* Invoice results table */
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-100 border-b-2 border-gray-300">
                            <tr>
                              <th className="px-2 py-1 text-left text-gray-500">Invoice</th>
                              <th className="px-2 py-1 text-left text-gray-500">Pharmacy</th>
                              <th className="px-2 py-1 text-right text-gray-500">Amount</th>
                              <th className="px-2 py-1 text-left text-gray-500">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {message.result.rows.slice(0, 5).map((row: any, i: number) => (
                              <tr key={i}>
                                <td className="px-2 py-1 text-gray-900">
                                  {row.invoiceNumber || row.pharmacyCode || '-'}
                                </td>
                                <td className="px-2 py-1 text-gray-600">
                                  {row.pharmacy?.code || row.pharmacyName || '-'}
                                </td>
                                <td className="px-2 py-1 text-right text-gray-900">
                                  {row.amount ? formatCurrency(row.amount) : '-'}
                                </td>
                                <td className="px-2 py-1">
                                  {row.status && (
                                    <span
                                      className={`px-1 py-0.5 rounded text-xs ${STATUS_COLORS[row.status] || 'bg-gray-100'}`}
                                    >
                                      {row.status}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        /* Generic data table (vendors, pharmacies, users, etc.) */
                        <table className="min-w-full text-xs">
                          <thead className="bg-gray-100 border-b-2 border-gray-300">
                            <tr>
                              {Object.keys(message.result.rows[0]).filter(k => k !== 'id').map(key => (
                                <th key={key} className="px-2 py-1 text-left text-gray-500 capitalize">
                                  {key.replace(/([A-Z])/g, ' $1').trim()}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {message.result.rows.slice(0, 10).map((row: any, i: number) => (
                              <tr key={i}>
                                {Object.entries(row).filter(([k]) => k !== 'id').map(([key, value]) => (
                                  <td key={key} className="px-2 py-1 text-gray-900">
                                    {String(value ?? '-')}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                      {message.result.rows.length > (message.result.rows[0]?.invoiceNumber !== undefined ? 5 : 10) && (
                        <div className="px-2 py-1 bg-gray-50 text-xs text-gray-500 text-center">
                          +{message.result.rows.length - (message.result.rows[0]?.invoiceNumber !== undefined ? 5 : 10)} more rows
                        </div>
                      )}
                    </div>
                  )}

                  {/* Metrics (for summary results) */}
                  {message.result && message.result.metrics && (!message.result.rows || message.result.rows.length === 0) && (
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      {Object.entries(message.result.metrics).map(([key, value]) => (
                        <div key={key} className="bg-white/10 rounded p-2">
                          <div className="font-medium">
                            {typeof value === 'number' && key.toLowerCase().includes('amount')
                              ? formatCurrency(value)
                              : String(value)}
                          </div>
                          <div className="opacity-70">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Error State */}
                  {message.status === 'error' && (
                    <div className="mt-2 text-xs text-red-600">
                      Try rephrasing your question or use the{' '}
                      <Link href="/dashboard/manager/explore" className="underline">
                        Filter Explorer
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about invoices, SLA compliance, or summaries..."
          className="input-field flex-1"
          disabled={isProcessing}
        />
        <button
          type="submit"
          disabled={isProcessing || !input.trim()}
          className="btn-primary disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Processing
            </span>
          ) : (
            'Send'
          )}
        </button>
      </form>

      {/* Disclaimer */}
      <p className="text-xs text-gray-400 text-center mt-2">
        AI responses are generated from your invoice data. Always verify important information.
      </p>
    </div>
  );
}
