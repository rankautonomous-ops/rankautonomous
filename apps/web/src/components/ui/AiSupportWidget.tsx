'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { MessageSquare, X, Send, Bot } from 'lucide-react';
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
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const token = typeof window !== 'undefined' ? localStorage.getItem('supabase.auth.token') : null;
      let headers: HeadersInit = {
        'Content-Type': 'application/json'
      };

      if (token) {
        try {
          const parsed = JSON.parse(token);
          if (parsed?.currentSession?.access_token) {
             headers['Authorization'] = `Bearer ${parsed.currentSession.access_token}`;
          }
        } catch {
          // ignore
        }
      }

      const res = await fetch(`${apiUrl}/api/support/chat`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to get a response.');
      }

      setMessages([...newMessages, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply
      }]);

    } catch (err: any) {
      setError(err.message || 'An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.widgetContainer}>
      {isOpen && (
        <div className={styles.chatPanel}>
          <div className={styles.chatHeader}>
            <div className={styles.headerTitle}>
              <Bot size={18} />
              <span>Ask RankAutonomous</span>
            </div>
            <button className={styles.closeButton} onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>
          
          <div className={styles.chatMessages}>
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
              <div className={`${styles.message} ${styles.assistant}`}>
                <div className={styles.loadingIndicator}>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                  <div className={styles.dot}></div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <div className={styles.errorMessage}>{error}</div>}

          <form className={styles.chatInputContainer} onSubmit={handleSend}>
            <input 
              type="text" 
              className={styles.chatInput}
              placeholder="Type your message..."
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              disabled={isLoading}
              maxLength={1000}
            />
            <button 
              type="submit" 
              className={styles.sendButton}
              disabled={isLoading || !inputValue.trim()}
            >
              <Send size={16} />
            </button>
          </form>
        </div>
      )}

      {!isOpen && (
        <button className={styles.supportButton} onClick={() => setIsOpen(true)}>
          <MessageSquare size={20} />
          <span>AI Support</span>
        </button>
      )}
    </div>
  );
}
