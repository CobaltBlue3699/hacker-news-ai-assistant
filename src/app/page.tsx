'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, isTextUIPart, APICallError, isToolUIPart, getToolName } from 'ai';
import { Send, User, Bot, Loader2, AlertCircle, RefreshCcw, ExternalLink, ChevronRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { LinkPreview } from '@/components/LinkPreview';

export default function Home() {
  const [input, setInput] = useState('');
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    onError: (error) => {
      console.error('Chat error caught in onError:', error);
      
      // Handle API call errors (including 429)
      if (APICallError.isInstance(error)) {
        setErrorStatus(error.statusCode || null);
        if (error.statusCode === 429) {
          setErrorMessage('請求過於頻繁（Gemini API 配額已耗盡），請等待約一分鐘後再試。');
          return;
        }
        setErrorMessage(`發生錯誤: ${error.message}`);
        return;
      }

      // Handle other common errors
      if (error.message.includes('quota') || error.message.includes('Quota exceeded')) {
        setErrorStatus(429);
        setErrorMessage('Gemini API 配額已耗盡。這是免費版的每分鐘限制，請等待約一分鐘後再試。');
      } else {
        setErrorMessage(error.message || '連線發生錯誤，請稍後再試。');
      }
    },
  });
  
  // 核心修正：如果已有錯誤訊息，即便 status 不是 ready 也要停止顯示 Loading
  const isLoading = status !== 'ready' && !errorMessage;
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, status, errorMessage]);

  const onFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    
    setErrorStatus(null);
    setErrorMessage(null);
    
    sendMessage({ text: input });
    setInput('');
  };

  const handleRetry = () => {
    // 1. 找到最後一則使用者的訊息
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    
    if (lastUserMessage) {
      // 2. 精確擷取內容 (從 parts 找文字片段)
      const textToRetry = lastUserMessage.parts
        .filter(isTextUIPart)
        .map(part => part.text)
        .join('\n');

      if (textToRetry) {
        // 3. 重置狀態
        setErrorStatus(null);
        setErrorMessage(null);
        // 4. 先停止上一次連線，再重新發送
        stop();
        sendMessage({ text: textToRetry });
      }
    }
  };

  const handleQuickQuestion = (text: string) => {
    setErrorStatus(null);
    setErrorMessage(null);
    sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans">
      {/* Header - Editorial Style */}
      <header className="sticky top-0 z-20 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md">
        <div className="container mx-auto flex h-16 max-w-4xl items-center justify-between px-4">
          <div className="flex items-center space-x-3">
            <div className="bg-[#F97316] p-1.5 rounded-sm">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight font-serif italic md:not-italic">
              HN Daily <span className="text-[#F97316]">AI</span>
            </h1>
          </div>
          <nav className="hidden sm:flex items-center space-x-6 text-sm font-medium text-slate-500 dark:text-slate-400">
            <a href="https://news.ycombinator.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#F97316] transition-colors flex items-center">
              Hacker News <ExternalLink className="ml-1 h-3 w-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth pt-4 pb-32">
        <div className="container mx-auto max-w-3xl px-4 space-y-12">
          
          {/* Welcome Section */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="space-y-4">
                <span className="inline-block px-3 py-1 text-xs font-semibold tracking-wider text-[#F97316] uppercase bg-orange-50 dark:bg-orange-950/30 rounded-full">
                  Daily Intelligence
                </span>
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter text-slate-900 dark:text-white leading-[1.1]">
                  Better News.<br />
                  <span className="text-slate-400 dark:text-slate-600">Faster Insights.</span>
                </h2>
                <p className="mx-auto max-w-md text-slate-500 dark:text-slate-400 text-lg md:text-xl font-medium leading-relaxed">
                  我每天為你追蹤 Hacker News 的熱門趨勢，讓你不再錯過任何重要的技術動態。
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg mt-8">
                {[
                  '今天 HN 有什麼有趣的？',
                  '總結最近與 AI 相關的討論',
                  '關於 Apple Vision Pro 的消息',
                  '有哪些開源專案值得關注？'
                ].map((text) => (
                  <button 
                    key={text}
                    onClick={() => handleQuickQuestion(text)}
                    className="group flex items-center justify-between p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:border-[#F97316] dark:hover:border-[#F97316] hover:shadow-lg hover:shadow-orange-500/5 transition-all duration-300 text-left"
                  >
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white">{text}</span>
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-[#F97316] group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages List */}
          <div className="space-y-10">
            {messages.map((m) => (
              <div 
                key={m.id} 
                className={cn(
                  "group flex flex-col space-y-2 animate-in fade-in duration-500",
                  m.role === 'user' ? "items-end" : "items-start"
                )}
              >
                <div className={cn(
                  "flex items-center space-x-2 text-xs font-bold uppercase tracking-widest mb-1",
                  m.role === 'user' ? "text-slate-400 flex-row-reverse space-x-reverse" : "text-[#F97316]"
                )}>
                  {m.role === 'user' ? (
                    <>
                      <span>You</span>
                      <User className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <Bot className="h-3 w-3" />
                      <span>HN Assistant</span>
                    </>
                  )}
                </div>

                <div className={cn(
                  "relative max-w-[90%] md:max-w-[80%] rounded-2xl px-5 py-4 text-sm md:text-base leading-relaxed shadow-sm",
                  m.role === 'user' 
                    ? "bg-[#F97316] text-white rounded-tr-none" 
                    : "bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none"
                )}>
                  <div className={cn(
                    "max-w-none break-words",
                    m.role === 'user' ? "prose-invert" : "prose"
                  )}>
                    {m.parts.map((part, i) => {
                      if (part.type === 'text') {
                        return (
                          <ReactMarkdown 
                            key={i} 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              a: ({ node, ...props }) => (
                                <LinkPreview 
                                  href={props.href || ''}
                                  className={cn(
                                    m.role === 'user' 
                                      ? "text-white decoration-white/40 hover:decoration-white" 
                                      : "text-[#EA580C] hover:text-[#F97316] decoration-[#F97316]/20 hover:decoration-[#F97316]"
                                  )}
                                >
                                  {props.children}
                                </LinkPreview>
                              )
                            }}
                          >
                            {part.text}
                          </ReactMarkdown>
                        );
                      }
                      if (isToolUIPart(part)) {
                        return (
                          <div key={part.toolCallId} className="my-2 p-2 border-l-4 border-[#F97316] bg-orange-50 dark:bg-orange-950/20 text-xs italic">
                            正在使用工具: {getToolName(part)}...
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col space-y-2 animate-pulse">
                <div className="flex items-center space-x-2 text-[#F97316] text-xs font-bold uppercase tracking-widest">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Generating Response...</span>
                </div>
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 h-16 w-32 rounded-2xl rounded-tl-none flex items-center justify-center">
                  <div className="flex space-x-1">
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                    <div className="w-1.5 h-1.5 bg-slate-300 rounded-full animate-bounce"></div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message Display */}
            {errorMessage && (
              <div className="mx-auto max-w-2xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 rounded-xl p-4 flex items-start space-x-3 animate-in shake duration-500">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <div className="flex-1 space-y-2">
                  <p className="text-sm font-bold text-red-800 dark:text-red-300">
                    {errorStatus === 429 ? '配額已耗盡' : '連線發生問題'}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400/80 leading-relaxed">
                    {errorMessage}
                  </p>
                  <button 
                    onClick={handleRetry}
                    className="flex items-center text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 transition-colors uppercase tracking-wider"
                  >
                    <RefreshCcw className="mr-1.5 h-3 w-3" />
                    重新嘗試
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </main>

      {/* Input Area */}
      <div className="fixed bottom-0 inset-x-0 bg-gradient-to-t from-[#F8FAFC] via-[#F8FAFC] to-transparent dark:from-slate-950 dark:via-slate-950 p-4 md:p-8 pt-10">
        <div className="mx-auto max-w-3xl">
          <div className="relative group bg-white dark:bg-slate-900 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-black/50 border border-slate-200 dark:border-slate-800 focus-within:border-[#F97316] dark:focus-within:border-[#F97316] focus-within:ring-4 focus-within:ring-orange-500/10 transition-all duration-300">
            <form onSubmit={onFormSubmit} className="flex items-center p-2">
              <input
                id="chat-input"
                className="flex-1 bg-transparent px-4 py-3 text-sm md:text-base placeholder:text-slate-400 dark:placeholder:text-slate-600 focus:outline-none text-slate-800 dark:text-slate-200"
                value={input}
                placeholder="輸入你的問題..."
                onChange={(e) => setInput(e.target.value)}
                disabled={isLoading}
                autoFocus
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className={cn(
                  "p-3 rounded-xl transition-all duration-300 disabled:opacity-30 disabled:grayscale",
                  input.trim() 
                    ? "bg-[#F97316] text-white shadow-lg shadow-orange-500/20 hover:scale-105 active:scale-95" 
                    : "text-slate-300 dark:text-slate-700"
                )}
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
                <span className="sr-only">傳送</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
