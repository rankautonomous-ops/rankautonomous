'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, X, Send, Bot } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import styles from './AiSupportWidget.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export default function AiSupportWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hi! I am the RankAutonomous AI Assistant. How can I help you today?'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    
    const text = inputValue.trim();
    if (!text || isLoading) return;

    if (text.length > 1000) {
      setError('Message is too long. Please keep it under 1000 characters.');
      return;
    }

    const newUserMsg: Message = { id: Date.now().toString(), role: 'user', content: text };
    const newMessages = [...messages, newUserMsg];
    
    setMessages(newMessages);
    setInputValue('');
    setError(null);
    setIsLoading(true);

    try {
      const res = await apiFetch('/api/support/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: newMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('Support service returned an unreadable response. Please try again.');
      }

      if (!res.ok) {
        throw new Error(data.error || data.message || `Support service returned status ${res.status}.`);
      }

      if (!data.reply) {
        throw new Error('No reply received from support assistant.');
      }

      setMessages([...newMessages, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
      }]);
    } catch (err: any) {
      console.error('[AI Support Chat Error]:', err);
      const isNetworkErr =
        err?.name === 'TypeError' ||
        err?.message?.toLowerCase().includes('fetch') ||
        err?.message?.toLowerCase().includes('network');
      setError(
        isNetworkErr
          ? 'Unable to connect to RankAutonomous support. Please check your internet connection or try again shortly.'
          : (err?.message || 'An error occurred. Please try again.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.widgetContainer}>
      {isOpen && (
        <div className={styles.chatPanel} id="ai-support-chat-panel">
          <div className={styles.chatHeader}>
            <div className={styles.headerTitle}>
              <Bot size={18} />
              <span>Ask RankAutonomous</span>
            </div>
            <button
              id="ai-support-close-btn"
              className={styles.closeButton}
              onClick={() => setIsOpen(false)}
              aria-label="Close Support Chat"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className={styles.chatMessages} id="ai-support-messages">
            {messages.map(msg => (
              <div key={msg.id} className={`${styles.message} ${styles[msg.role]}`}>
                {msg.role === 'assistant' ? (
                  <ReactMarkdown>{msg.content}</ReactMarkdown>
                ) : (
                  msg.content
                )}
              </div>
            ))}
            {isLoading && (
              <div className={`${styles.message} ${styles.assistant}`} id="ai-support-loading">
                <div className={styles.loadingIndicator}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className={styles.errorMessage} id="ai-support-error">{error}</div>}

          <form className={styles.chatInputContainer} onSubmit={handleSend} id="ai-support-form">
            <input 
              id="ai-support-input"
              type="text" 
              className={styles.chatInput}
              placeholder="Type your message..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={isLoading}
              maxLength={1000}
            />
            <button 
              id="ai-support-send-btn"
              type="submit" 
              className={styles.sendButton}
              disabled={isLoading || !inputValue.trim()}
              aria-label="Send Message"
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {!isOpen && (
        <button
          id="ai-support-widget-btn"
          className={styles.supportButton}
          onClick={() => setIsOpen(true)}
          aria-label="Open AI Support"
        >
          <MessageSquare size={20} />
          <span>AI Support</span>
        </button>
      )}
    </div>
  );
}
