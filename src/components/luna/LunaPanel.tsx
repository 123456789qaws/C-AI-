'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { LunaMessage } from '@/lib/mock/lunaMocks';

interface LunaPanelProps {
  messages: LunaMessage[];
  onSend: (content: string) => void;
  /** Bug4-luna：异步问答进行中时禁用输入（教师端真实请求场景） */
  disabled?: boolean;
}

export default function LunaPanel({ messages, onSend, disabled = false }: LunaPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || disabled) return;
    onSend(inputValue.trim());
    setInputValue('');
  };

  const charCount = inputValue.length;
  const maxChars = 500;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <h2 className="text-sm font-medium text-foreground">Luna AI 助教</h2>
      </div>

      {/* Messages Area */}
      <div
        ref={scrollAreaRef}
        className="flex-1 overflow-y-auto p-4 space-y-4"
        role="log"
        aria-live="polite"
        aria-label="Luna AI 对话历史"
      >
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
          >
            <div
              className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium ${
                message.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground'
              }`}
              aria-hidden="true"
            >
              {message.role === 'user' ? '师' : 'L'}
            </div>
            <div className={`max-w-[80%] ${message.role === 'user' ? 'text-right' : ''}`}>
              <div
                className={`inline-block rounded-2xl px-4 py-2 text-sm ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-none'
                    : 'bg-muted text-muted-foreground rounded-tl-none'
                }`}
              >
                <pre className="whitespace-pre-wrap break-words font-inherit text-inherit">
                  {message.content}
                </pre>
              </div>
              <div className="flex mt-1 gap-2 text-xs text-muted-foreground justify-end">
                <time dateTime={message.timestamp}>
                  {new Date(message.timestamp).toLocaleTimeString('zh-CN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Disclaimer */}
      <div className="border-t border-border px-4 py-2">
        <p className="text-xs text-center text-muted-foreground">Luna 只问不给</p>
      </div>

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="border-t border-border p-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="luna-input" className="sr-only">
            向 Luna 提问
          </label>
          <textarea
            id="luna-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={disabled ? 'Luna 正在思考，请稍候…' : '向 Luna 提问 C 语言问题...'}
            disabled={disabled}
            className="min-h-[80px] max-h-[160px] resize-y rounded-lg border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="向 Luna 提问"
            rows={3}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {charCount} / {maxChars} 字符
            </span>
            <Button
              type="submit"
              size="sm"
              disabled={!inputValue.trim() || charCount > maxChars || disabled}
            >
              {disabled ? '思考中…' : '发送'}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
