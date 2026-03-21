import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Bot, User, Copy, Check, Send, RotateCcw, Loader2 } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function CodebaseChatPage() {
  const [initialPrompt, setInitialPrompt] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasChatStarted, setHasChatStarted] = useState(false);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  // Persisted codebase context returned from the server on the first turn
  const [codebaseContext, setCodebaseContext] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function sendMessage(
    message: string,
    history: Message[],
    context: string,
  ): Promise<{ reply: string; codebaseContext: string }> {
    setIsLoading(true);
    try {
      const response = await fetch('/api/codebase-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message,
          history,
          codebaseContext: context,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(err.error || 'Request failed');
      }

      const data = await response.json();
      return { reply: data.reply as string, codebaseContext: data.codebaseContext as string };
    } finally {
      setIsLoading(false);
    }
  }

  async function handleInitialSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const prompt = initialPrompt.trim();
    if (!prompt) return;

    const userMsg: Message = { role: 'user', content: prompt };
    setMessages([userMsg]);
    setHasChatStarted(true);

    try {
      const { reply, codebaseContext: ctx } = await sendMessage(prompt, [], '');
      setCodebaseContext(ctx);
      setMessages([userMsg, { role: 'assistant', content: reply }]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to get a response.';
      toast({ title: 'Error', description: message, variant: 'destructive' });
      setMessages([]);
      setHasChatStarted(false);
    }
  }

  async function handleFollowUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const message = inputValue.trim();
    if (!message || isLoading) return;

    setInputValue('');
    const history = messages;
    const updatedMessages: Message[] = [...messages, { role: 'user', content: message }];
    setMessages(updatedMessages);

    try {
      const { reply } = await sendMessage(message, history, codebaseContext);
      setMessages([...updatedMessages, { role: 'assistant', content: reply }]);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to get a response.';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
      setMessages(history);
    }
  }

  function handleReset() {
    setMessages([]);
    setInitialPrompt('');
    setInputValue('');
    setHasChatStarted(false);
    setCopiedIndex(null);
    setCodebaseContext('');
  }

  function handleCopy(content: string, index: number) {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    });
  }

  function handleCopyLast() {
    const assistantMessages = messages.filter((m) => m.role === 'assistant');
    if (assistantMessages.length === 0) return;
    const last = assistantMessages[assistantMessages.length - 1];
    const lastIndex = messages.lastIndexOf(last);
    handleCopy(last.content, lastIndex);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const form = e.currentTarget.closest('form');
      if (form) {
        form.requestSubmit();
      }
    }
  }

  const hasAssistantMessages = messages.some((m) => m.role === 'assistant');

  return (
    <div className="max-w-4xl mx-auto py-6 px-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Codebase Chat</h1>
          <p className="text-sm text-gray-500 mt-1">
            Chat with ChatGPT using the actual codebase as context. Ask about features, bugs, or implementation details.
          </p>
        </div>
        {hasChatStarted && (
          <Button variant="outline" size="sm" onClick={handleReset} className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4" />
            New Chat
          </Button>
        )}
      </div>

      {!hasChatStarted ? (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-3">
            What would you like to ask about the codebase?
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste your question or prompt below. The server will read relevant source files and include them as context for ChatGPT.
          </p>
          <form onSubmit={handleInitialSubmit} className="space-y-4">
            <Textarea
              value={initialPrompt}
              onChange={(e) => setInitialPrompt(e.target.value)}
              placeholder="e.g. How does the order status update flow work from the frontend to the database? Which files are involved?"
              rows={6}
              className="resize-none text-sm"
              disabled={isLoading}
            />
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading || !initialPrompt.trim()} className="flex items-center gap-2">
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing codebase...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Start Chat
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex gap-3 p-4 ${
                    msg.role === 'user' ? 'bg-blue-50' : 'bg-white'
                  }`}
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {msg.role === 'user' ? (
                      <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                    ) : (
                      <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                        {msg.role === 'user' ? 'You' : 'ChatGPT'}
                      </span>
                      {msg.role === 'assistant' && (
                        <button
                          onClick={() => handleCopy(msg.content, index)}
                          className="text-gray-400 hover:text-gray-600 transition-colors"
                          title="Copy response"
                        >
                          {copiedIndex === index ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                      {msg.content}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3 p-4 bg-white">
                  <div className="flex-shrink-0 mt-0.5">
                    <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    ChatGPT is thinking...
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyLast}
              disabled={!hasAssistantMessages}
              className="flex items-center gap-2 text-sm"
            >
              <Copy className="h-4 w-4" />
              Copy last response
            </Button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4">
            <form onSubmit={handleFollowUp} className="flex gap-3">
              <Textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask a follow-up question..."
                rows={2}
                className="resize-none text-sm flex-1"
                disabled={isLoading}
                onKeyDown={handleTextareaKeyDown}
              />
              <Button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="self-end flex items-center gap-2"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Send
              </Button>
            </form>
            <p className="text-xs text-gray-400 mt-2">Press Enter to send, Shift+Enter for a new line.</p>
          </div>
        </div>
      )}
    </div>
  );
}
