const fs = require('fs');
const file = 'apps/web/src/app/app/content/[articleId]/ArticleWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace wpIntegration state with cmsConnections state
content = content.replace(
  'const [wpIntegration, setWpIntegration] = useState<{ connected: boolean; integration?: any } | null>(null);',
  'const [cmsConnections, setCmsConnections] = useState<any[]>([]);'
);

// Replace fetch for WordPress with fetch for CMS connections
content = content.replace(
  /try \{\s*const wpRes = await fetch\(`\$\{apiUrl\}\/api\/websites\/\$\{targetSite\.id\}\/integrations\/wordpress`[^]*?\} catch \(wpErr\) \{\s*console\.warn\('WordPress integration check error:', wpErr\);\s*\}/,
  `try {
        const connRes = await fetch(\`\${apiUrl}/api/websites/\${targetSite.id}/cms-connections\`, {
          headers: { Authorization: \`Bearer \${session.access_token}\` },
        });
        if (connRes.ok) {
          const connData = await connRes.json();
          setCmsConnections(connData.connections || []);
        }
      } catch (connErr) {
        console.warn('CMS connections check error:', connErr);
      }`
);

// Add selected CMS connection state
content = content.replace(
  'const [showWpModal, setShowWpModal] = useState(false);',
  `const [showWpModal, setShowWpModal] = useState(false);
  const [showCmsModal, setShowCmsModal] = useState(false);
  const [selectedCms, setSelectedCms] = useState('');`
);

// Update handlePublishArticle to use the new CMS API
content = content.replace(
  /const handlePublishArticle = async \(postStatus: 'publish' \| 'draft' = 'publish'\) => \{[\s\S]*?setIsPublishing\(false\);\s*\}\s*\};/,
  `const handlePublishArticle = async (postStatus: 'publish' | 'draft' = 'publish', overrideCmsId?: string) => {
    const targetCmsId = overrideCmsId || selectedCms;
    if (!targetCmsId) return alert('Please select a CMS connection.');
    setIsPublishing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(\`\${apiUrl}/api/websites/\${activeWebsite.id}/articles/\${articleId}/publish\`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: \`Bearer \${session?.access_token}\`,
        },
        body: JSON.stringify({ postStatus, cmsConnectionId: targetCmsId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to publish');
      }
      setArticle(prev => ({...prev, status: 'PUBLISHED'})); // Refresh happens on checkJobStatus or fetch
      setPublishSuccessMsg(\`Successfully published! Remote ID: \${data.remoteId}\`);
      setShowCmsModal(false);
      setTimeout(() => { setPublishSuccessMsg(null); fetchWorkspaceData(); }, 3000);
    } catch (err: any) {
      alert(err.message || 'Error publishing');
    } finally {
      setIsPublishing(false);
    }
  };`
);

// Change UI rendering for APPROVED status
content = content.replace(
  /\{wpIntegration\?\.connected \? \([\s\S]*?<\/div>\s*\)\}/,
  `{cmsConnections.length > 0 ? (
                <>
                  <button 
                    className={styles.primaryButton} 
                    disabled={isProcessing || isPublishing}
                    onClick={() => setShowCmsModal(true)}
                    style={{ width: '100%', marginBottom: '8px' }}
                  >
                    {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                    Publish to CMS
                  </button>
                </>
              ) : (
                <div style={{ padding: '12px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', textAlign: 'center', marginBottom: '8px' }}>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 8px 0' }}>
                    No CMS connected. Connect a CMS to publish directly.
                  </p>
                  <Link href="/app/integrations" className={styles.secondaryButton} style={{ display: 'block', width: '100%', fontSize: '13px', textDecoration: 'none' }}>
                    <Globe size={14} style={{ display: 'inline', marginRight: '6px' }} /> Go to Integrations
                  </Link>
                </div>
              )}`
);

// Change UI rendering for PUBLISHED status
content = content.replace(
  /\{article\.cmsPublicationInfo\?\.provider === 'WORDPRESS' \? \([\s\S]*?Live on WordPress[\s\S]*?Sync Edits to WordPress\s*<\/button>\s*<\/div>\s*\) : \([\s\S]*?mark as Published[\s\S]*?<\/div>\s*\)\}/,
  `{article.publications && article.publications.length > 0 ? (
                article.publications.map((pub: any) => (
                  <div key={pub.id} style={{ padding: '14px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-md)', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2e6b3b', fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                      <CheckCircle size={16} /> Live on {pub.cmsConnection?.name || 'CMS'}
                    </div>
                    <div style={{ fontSize: '12px', color: '#1b4d26', lineHeight: 1.5, marginBottom: '10px' }}>
                      <div>Status: <strong>{pub.status}</strong></div>
                    </div>
                    {pub.remoteUrl && (
                      <a
                        href={pub.remoteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.primaryButton}
                        style={{ width: '100%', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', textDecoration: 'none', fontSize: '13px', padding: '8px 12px' }}
                      >
                        View Live Post <ExternalLink size={14} />
                      </a>
                    )}
                  </div>
                ))
              ) : (
                <div style={{ padding: '12px', background: '#edf7ee', border: '1px solid #b6e2be', borderRadius: 'var(--radius-sm)', textAlign: 'center', color: '#2e6b3b', fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
                  ✓ Article is marked as Published (Manual)
                </div>
              )}`
);

// Add CMS Selection Modal at the end of the file
const cmsModal = `
      {/* CMS Connection Modal */}
      {showCmsModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '16px' }}>
          <div className={styles.card} style={{ maxWidth: '480px', width: '100%', background: 'var(--surface-raised, #ffffff)', padding: '24px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--text)' }}>
                Publish Article
              </h3>
              <button
                onClick={() => setShowCmsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, color: 'var(--text)', marginBottom: '8px' }}>
                Select CMS Connection
              </label>
              <select 
                className={styles.input} 
                style={{ width: '100%' }} 
                value={selectedCms} 
                onChange={e => setSelectedCms(e.target.value)}
              >
                <option value="">Select a CMS...</option>
                {cmsConnections.filter(c => c.status === 'CONNECTED').map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.provider})</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '24px' }}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => handlePublishArticle('draft')}
                disabled={isPublishing || !selectedCms}
              >
                Save as Draft
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => handlePublishArticle('publish')}
                disabled={isPublishing || !selectedCms}
              >
                {isPublishing ? <Loader2 size={16} className="animate-spin" /> : <Globe size={16} />}
                Publish Live
              </button>
            </div>
          </div>
        </div>
      )}
`;

content = content.replace('    </div>\n  );\n}\n', cmsModal + '    </div>\n  );\n}\n');

fs.writeFileSync(file, content);
