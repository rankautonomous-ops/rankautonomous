'use client';

import { useState, useEffect } from 'react';
import { Loader2, Download, FileText } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import styles from '../../app.module.css';

interface Invoice {
  id: string;
  amountPaid: number;
  status: string;
  created: number;
  pdf: string;
  number: string;
  currency: string;
}

export function InvoicesTable() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchInvoices() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session) return;
        
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
        const res = await fetch(`${apiUrl}/api/billing/invoices`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        
        if (!res.ok) throw new Error('Failed to fetch invoices');
        
        const data = await res.json();
        setInvoices(data.invoices || []);
      } catch (err: any) {
        setError(err.message || 'Unable to load invoice history.');
      } finally {
        setLoading(false);
      }
    }
    
    fetchInvoices();
  }, []);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center' }}>
        <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto', color: 'var(--text-muted)' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '16px', color: 'var(--error)', fontSize: '14px' }}>
        {error}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
        No past invoices found.
      </div>
    );
  }

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
            <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Date</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Invoice Number</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Amount</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)' }}>Status</th>
            <th style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'right' }}>Download</th>
          </tr>
        </thead>
        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                {new Date(invoice.created * 1000).toLocaleDateString()}
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                {invoice.number}
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text)' }}>
                ${(invoice.amountPaid / 100).toFixed(2)} {invoice.currency.toUpperCase()}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <span style={{ 
                  background: invoice.status === 'paid' ? '#edf7ee' : '#f4eee9',
                  color: invoice.status === 'paid' ? '#2e6b3b' : 'var(--text-secondary)',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 600,
                  textTransform: 'uppercase'
                }}>
                  {invoice.status}
                </span>
              </td>
              <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                {invoice.pdf ? (
                  <a 
                    href={invoice.pdf} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
                  >
                    <Download size={14} /> PDF
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
