'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Globe,
  Building2,
  Target,
  Compass,
  Layers,
  Sparkles,
  Loader2,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
} from 'lucide-react';
import { createClient } from '../../../lib/supabase/client';
import styles from '../app.module.css';

// =============================================================================
// PRD CONSTANTS
// =============================================================================

const PRD_SEO_GOALS = [
  {
    id: 'Increase organic traffic',
    title: 'Increase organic traffic',
    desc: 'Grow search impressions, clicks, and inbound visitors.',
  },
  {
    id: 'Rank for keywords',
    title: 'Rank for keywords',
    desc: 'Secure top search positions for high-intent queries.',
  },
  {
    id: 'Generate leads',
    title: 'Generate leads',
    desc: 'Capture qualified inquiries, demo requests, and signups.',
  },
  {
    id: 'Increase sales',
    title: 'Increase sales',
    desc: 'Drive direct e-commerce and SaaS subscription conversions.',
  },
  {
    id: 'Improve authority',
    title: 'Improve authority',
    desc: 'Build domain trustworthiness and backlink profile.',
  },
  {
    id: 'Increase brand visibility',
    title: 'Increase brand visibility',
    desc: 'Expand overall reach and topical market presence.',
  },
];

const PRD_PLATFORMS = [
  {
    id: 'WordPress',
    title: 'WordPress',
    desc: 'Publish content directly via WordPress REST API.',
  },
  {
    id: 'Shopify',
    title: 'Shopify',
    desc: 'E-commerce store blog and product SEO optimization.',
  },
  {
    id: 'Webflow',
    title: 'Webflow',
    desc: 'Modern visual CMS collection publishing.',
  },
  {
    id: 'Custom',
    title: 'Custom / API',
    desc: 'Custom-built frameworks, Next.js, or headless CMS.',
  },
  {
    id: 'Other',
    title: 'Other',
    desc: 'Any other website platform or static site generator.',
  },
];

const PRD_LOCATION_TYPES = [
  {
    id: 'GLOBAL',
    title: 'Global (Worldwide)',
    desc: 'Target audiences worldwide without geographical boundaries.',
  },
  {
    id: 'COUNTRY',
    title: 'Country-Specific',
    desc: 'Target visitors within a specific sovereign nation.',
  },
  {
    id: 'REGION',
    title: 'State / Region',
    desc: 'Target a designated province, state, or regional territory.',
  },
  {
    id: 'CITY',
    title: 'Metro / City',
    desc: 'Hyper-local targeting for a municipal market or city.',
  },
];

const ANALYSIS_STAGES = [
  { name: 'Connecting website', desc: 'Secure connection and domain validation.', status: 'COMPLETED' },
  { name: 'Crawling website', desc: 'Initial crawl of sitemap, navigation, and indexable pages.', status: 'PENDING' },
  { name: 'Technical SEO analysis', desc: 'Evaluating HTTPS, headers, meta tags, and indexability.', status: 'PENDING' },
  { name: 'Keyword research', desc: 'Analyzing topical search queries and ranking potential.', status: 'PENDING' },
  { name: 'Competitor analysis', desc: 'Benchmarking top ranking authority in your industry.', status: 'PENDING' },
  { name: 'Opportunity discovery', desc: 'Identifying content gaps and backlink opportunities.', status: 'PENDING' },
  { name: 'Strategy generation', desc: 'Assembling continuous AI growth strategy.', status: 'PENDING' },
];

export default function OnboardingWizardPage() {
  const router = useRouter();

  // Wizard state (1 to 7)
  const [step, setStep] = useState(1);

  // Form Data State
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [targetCountry, setTargetCountry] = useState('');
  const [targetAudience, setTargetAudience] = useState('');
  const [description, setDescription] = useState('');
  const [seoGoals, setSeoGoals] = useState<string[]>(['Increase organic traffic']);
  const [targetLocationType, setTargetLocationType] = useState('GLOBAL');
  const [targetRegion, setTargetRegion] = useState('');
  const [targetCity, setTargetCity] = useState('');
  const [primaryKeywords, setPrimaryKeywords] = useState<string[]>([]);
  const [keywordInput, setKeywordInput] = useState('');
  const [platform, setPlatform] = useState('WordPress');

  // AI Keyword Suggestions State
  const [aiSuggestions, setAiSuggestions] = useState<
    Array<{ keyword: string; intent: string; rationale: string }>
  >([]);
  const [selectedAiKeywords, setSelectedAiKeywords] = useState<string[]>([]);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);

  // Request & Execution State
  const [submitting, setSubmitting] = useState(false);
  const [stepError, setStepError] = useState<string | null>(null);
  const [subscriptionRequired, setSubscriptionRequired] = useState(false);
  const [createdWebsite, setCreatedWebsite] = useState<any>(null);

  // ---------------------------------------------------------------------------
  // Validation per Step
  // ---------------------------------------------------------------------------
  const validateCurrentStep = (): boolean => {
    setStepError(null);

    if (step === 1) {
      if (!url.trim()) {
        setStepError('Please enter your website URL to continue.');
        return false;
      }
      let testUrl = url.trim();
      if (!/^https?:\/\//i.test(testUrl)) {
        testUrl = `https://${testUrl}`;
      }
      try {
        const parsed = new URL(testUrl);
        if (!parsed.hostname.includes('.')) {
          setStepError('Please enter a valid domain (e.g., example.com or https://example.com).');
          return false;
        }
        if (parsed.hostname.toLowerCase() === 'localhost' || parsed.hostname.startsWith('127.')) {
          setStepError('Localhost and private test URLs are not allowed.');
          return false;
        }
      } catch {
        setStepError('Invalid URL format. Please check the website address.');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!name.trim()) {
        setStepError('Please enter your business or website name.');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (seoGoals.length === 0) {
        setStepError('Please select at least one primary SEO goal.');
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (targetLocationType === 'COUNTRY' && !targetCountry.trim()) {
        setStepError('Please specify the target country.');
        return false;
      }
      if (targetLocationType === 'REGION') {
        if (!targetCountry.trim()) {
          setStepError('Please specify the target country.');
          return false;
        }
        if (!targetRegion.trim()) {
          setStepError('Please specify the state or region.');
          return false;
        }
      }
      if (targetLocationType === 'CITY') {
        if (!targetCountry.trim()) {
          setStepError('Please specify the target country.');
          return false;
        }
        if (!targetRegion.trim()) {
          setStepError('Please specify the state or region.');
          return false;
        }
        if (!targetCity.trim()) {
          setStepError('Please specify the city.');
          return false;
        }
      }
      return true;
    }

    if (step === 5) {
      return true;
    }

    if (step === 6) {
      if (!platform) {
        setStepError('Please select the platform your website is built on.');
        return false;
      }
      return true;
    }

    return true;
  };

  // ---------------------------------------------------------------------------
  // Keyword Chips Management
  // ---------------------------------------------------------------------------
  const handleAddKeyword = () => {
    const trimmed = keywordInput.trim();
    if (!trimmed) return;

    if (primaryKeywords.some((k) => k.toLowerCase() === trimmed.toLowerCase())) {
      setStepError(`"${trimmed}" is already added.`);
      return;
    }

    if (primaryKeywords.length >= 50) {
      setStepError('Maximum 50 primary keywords reached.');
      return;
    }

    setPrimaryKeywords([...primaryKeywords, trimmed]);
    setKeywordInput('');
    setStepError(null);
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setPrimaryKeywords(primaryKeywords.filter((k) => k !== keywordToRemove));
  };

  const handleKeywordKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddKeyword();
    }
  };

  // ---------------------------------------------------------------------------
  // Goal Toggle
  // ---------------------------------------------------------------------------
  const toggleGoal = (goalId: string) => {
    if (seoGoals.includes(goalId)) {
      setSeoGoals(seoGoals.filter((g) => g !== goalId));
    } else {
      setSeoGoals([...seoGoals, goalId]);
    }
  };

  // ---------------------------------------------------------------------------
  // AI Keyword Helpers
  // ---------------------------------------------------------------------------
  const getCombinedKeywords = (): string[] => {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const kw of [...primaryKeywords, ...selectedAiKeywords]) {
      const trimmed = kw.trim();
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        result.push(trimmed);
      }
    }
    return result;
  };

  const toggleAiKeyword = (kw: string) => {
    const normalized = kw.trim().toLowerCase();
    if (selectedAiKeywords.some((k) => k.toLowerCase() === normalized)) {
      setSelectedAiKeywords(selectedAiKeywords.filter((k) => k.toLowerCase() !== normalized));
    } else {
      const currentCombined = getCombinedKeywords();
      if (currentCombined.length >= 50) {
        setStepError('Maximum 50 keywords reached. Please remove a keyword before selecting more.');
        return;
      }
      setStepError(null);
      setSelectedAiKeywords([...selectedAiKeywords, kw.trim()]);
    }
  };

  const handleGenerateAiKeywords = async () => {
    if (isGeneratingAi) return;

    if (!url.trim()) {
      setStepError('Please complete Step 1 with a valid website URL before generating suggestions.');
      return;
    }

    setIsGeneratingAi(true);
    setAiError(null);
    setStepError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setAiError('You must be logged in to generate keyword suggestions.');
        setIsGeneratingAi(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

      const payload = {
        websiteUrl: url.trim(),
        businessName: name.trim() || 'My Website',
        industry: industry.trim() || undefined,
        targetCountry: targetCountry.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        description: description.trim() || undefined,
        seoGoals,
        targetLocationType,
        targetRegion: targetRegion.trim() || undefined,
        targetCity: targetCity.trim() || undefined,
        existingKeywords: primaryKeywords,
      };

      const res = await fetch(`${apiUrl}/api/websites/keyword-suggestions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403 && data.code === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setAiError('An active RankAutonomous subscription is required to generate AI keyword suggestions.');
        } else {
          setAiError(data.message || "We couldn't generate keyword suggestions right now. Please try again.");
        }
        setIsGeneratingAi(false);
        return;
      }

      if (Array.isArray(data?.suggestions)) {
        setAiSuggestions(data.suggestions);
        setAiGenerated(true);
      } else {
        setAiError("We couldn't generate keyword suggestions right now. Please try again.");
      }
    } catch {
      setAiError("We couldn't generate keyword suggestions right now. Please try again.");
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Navigation Handlers
  // ---------------------------------------------------------------------------
  const handleNext = () => {
    if (!validateCurrentStep()) return;
    setStep((prev) => Math.min(prev + 1, 7));
  };

  const handleBack = () => {
    setStepError(null);
    setStep((prev) => Math.max(prev - 1, 1));
  };

  // ---------------------------------------------------------------------------
  // Final Submission (End of Step 6 -> Step 7)
  // ---------------------------------------------------------------------------
  const handleConnectWebsite = async () => {
    if (!validateCurrentStep()) return;

    setSubmitting(true);
    setStepError(null);
    setSubscriptionRequired(false);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setStepError('You must be logged in to connect a website.');
        setSubmitting(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

      const combinedKeywords = getCombinedKeywords().slice(0, 50);

      const payload = {
        url: url.trim(),
        name: name.trim(),
        industry: industry.trim() || undefined,
        targetCountry: targetCountry.trim() || undefined,
        targetAudience: targetAudience.trim() || undefined,
        description: description.trim() || undefined,
        seoGoals,
        targetLocationType,
        targetRegion: targetRegion.trim() || undefined,
        targetCity: targetCity.trim() || undefined,
        primaryKeywords: combinedKeywords,
        platform,
      };

      const res = await fetch(`${apiUrl}/api/websites`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 403 && responseData.code === 'SUBSCRIPTION_REQUIRED') {
          setSubscriptionRequired(true);
          setStepError(
            'An active RankAutonomous subscription is required to connect a website. Please select a plan to proceed.'
          );
        } else {
          setStepError(responseData.message || 'Failed to connect website. Please verify your details.');
        }
        setSubmitting(false);
        return;
      }

      // Success: Advance to Step 7 (Preparation screen)
      setCreatedWebsite(responseData.website);
      setStep(7);
      setSubmitting(false);
    } catch (err: any) {
      setStepError(err?.message || 'Error communicating with server. Please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: '780px', margin: '0 auto' }}>
      {/* Step Header & Progress */}
      <div className={styles.wizardHeader}>
        <div className={styles.stepIndicator}>
          <span>Step {step} of 7</span>
        </div>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${(step / 7) * 100}%` }} />
        </div>
      </div>

      {/* Subscription Required Banner */}
      {subscriptionRequired && (
        <div className={styles.errorBanner} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={18} />
            <span>An active RankAutonomous subscription is required to connect a website.</span>
          </div>
          <Link href="/pricing" className={styles.primaryButton} style={{ alignSelf: 'flex-start', padding: '6px 14px', fontSize: '12px' }}>
            View Subscription Plans →
          </Link>
        </div>
      )}

      {/* Error Message */}
      {stepError && !subscriptionRequired && (
        <div className={styles.errorBanner}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} />
            <span>{stepError}</span>
          </div>
        </div>
      )}

      <div className={styles.wizardCard}>
        {/* ===================================================================
            STEP 1: WEBSITE
           =================================================================== */}
        {step === 1 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Globe size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                What website do you want to grow?
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Enter your website domain. RankAutonomous will analyze your structure and put your organic growth on autopilot.
            </p>

            <div className={styles.formGroup}>
              <label htmlFor="websiteUrl" className={styles.label}>
                Website Domain or URL <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                id="websiteUrl"
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className={styles.input}
                autoFocus
              />
              <span className={styles.fieldHint}>
                Example: <code>https://example.com</code> or <code>example.com</code>. We automatically enforce HTTPS.
              </span>
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 2: BUSINESS INFORMATION
           =================================================================== */}
        {step === 2 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Building2 size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                Tell us about your business
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Help our AI understand your company so it creates highly tailored, high-converting SEO strategies.
            </p>

            <div className={styles.form} style={{ maxWidth: '100%' }}>
              <div className={styles.formGroup}>
                <label htmlFor="bizName" className={styles.label}>
                  Business or Brand Name <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  id="bizName"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Cloud Solutions"
                  className={styles.input}
                  autoFocus
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className={styles.formGroup}>
                  <label htmlFor="industry" className={styles.label}>
                    Industry / Vertical
                  </label>
                  <input
                    id="industry"
                    type="text"
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    placeholder="e.g. SaaS, E-commerce, Legal"
                    className={styles.input}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label htmlFor="country" className={styles.label}>
                    Primary Country
                  </label>
                  <input
                    id="country"
                    type="text"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    placeholder="e.g. United States, Germany"
                    className={styles.input}
                  />
                </div>
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="targetAudience" className={styles.label}>
                  Target Audience
                </label>
                <input
                  id="targetAudience"
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g. Small business owners, CTOs, Marketing Managers"
                  className={styles.input}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="bizDesc" className={styles.label}>
                  Business Description
                </label>
                <textarea
                  id="bizDesc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what your product or service offers, key pain points solved, and customer value proposition..."
                  className={styles.textarea}
                  rows={3}
                />
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 3: SEO GOALS
           =================================================================== */}
        {step === 3 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Target size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                What are your primary SEO goals?
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Select the outcomes you want RankAutonomous to prioritize. You can select multiple goals.
            </p>

            <div className={styles.selectionGrid}>
              {PRD_SEO_GOALS.map((goal) => {
                const isSelected = seoGoals.includes(goal.id);
                return (
                  <div
                    key={goal.id}
                    className={`${styles.selectableCard} ${isSelected ? styles.selectableCardActive : ''}`}
                    onClick={() => toggleGoal(goal.id)}
                  >
                    <div className={styles.cardIcon}>
                      {isSelected ? <CheckCircle2 size={20} color="#60a5fa" /> : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #475569' }} />}
                    </div>
                    <div>
                      <div className={styles.cardTextTitle}>{goal.title}</div>
                      <div className={styles.cardTextDesc}>{goal.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 4: TARGET LOCATIONS
           =================================================================== */}
        {step === 4 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Compass size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                Where is your target audience located?
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Define your geographic scope for keyword search volume and local optimization.
            </p>

            <div className={styles.selectionGrid} style={{ marginBottom: '24px' }}>
              {PRD_LOCATION_TYPES.map((loc) => {
                const isSelected = targetLocationType === loc.id;
                return (
                  <div
                    key={loc.id}
                    className={`${styles.selectableCard} ${isSelected ? styles.selectableCardActive : ''}`}
                    onClick={() => setTargetLocationType(loc.id)}
                  >
                    <div className={styles.cardIcon}>
                      {isSelected ? <CheckCircle2 size={20} color="#60a5fa" /> : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #475569' }} />}
                    </div>
                    <div>
                      <div className={styles.cardTextTitle}>{loc.title}</div>
                      <div className={styles.cardTextDesc}>{loc.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Conditional Location Inputs */}
            {targetLocationType !== 'GLOBAL' && (
              <div className={styles.form} style={{ maxWidth: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '16px' }}>
                <div className={styles.formGroup}>
                  <label htmlFor="targetCountryLoc" className={styles.label}>
                    Target Country <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    id="targetCountryLoc"
                    type="text"
                    value={targetCountry}
                    onChange={(e) => setTargetCountry(e.target.value)}
                    placeholder="e.g. United States"
                    className={styles.input}
                  />
                </div>

                {(targetLocationType === 'REGION' || targetLocationType === 'CITY') && (
                  <div className={styles.formGroup}>
                    <label htmlFor="targetRegionLoc" className={styles.label}>
                      State / Province / Region <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="targetRegionLoc"
                      type="text"
                      value={targetRegion}
                      onChange={(e) => setTargetRegion(e.target.value)}
                      placeholder="e.g. California, Ontario, Bavaria"
                      className={styles.input}
                    />
                  </div>
                )}

                {targetLocationType === 'CITY' && (
                  <div className={styles.formGroup}>
                    <label htmlFor="targetCityLoc" className={styles.label}>
                      City / Metro Area <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <input
                      id="targetCityLoc"
                      type="text"
                      value={targetCity}
                      onChange={(e) => setTargetCity(e.target.value)}
                      placeholder="e.g. San Francisco, Toronto, Munich"
                      className={styles.input}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ===================================================================
            STEP 5: KEYWORDS
           =================================================================== */}
        {step === 5 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Layers size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                Seed keywords &amp; topics
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Enter seed keywords or topic queries you know are important to your business.
            </p>

            <div className={styles.formGroup}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <label htmlFor="keywordInputField" className={styles.label} style={{ margin: 0 }}>
                  Manual Seed Keywords
                </label>
                <span className={styles.fieldHint} style={{ margin: 0 }}>
                  {primaryKeywords.length}/50 added
                </span>
              </div>
              <div className={styles.chipInputContainer}>
                <input
                  id="keywordInputField"
                  type="text"
                  value={keywordInput}
                  onChange={(e) => setKeywordInput(e.target.value)}
                  onKeyDown={handleKeywordKeyDown}
                  placeholder="e.g. seo software, automated link building"
                  className={styles.input}
                  style={{ flex: 1 }}
                />
                <button type="button" onClick={handleAddKeyword} className={styles.secondaryButton}>
                  + Add
                </button>
              </div>

              {/* Tag / Chip List */}
              <div className={styles.chipsWrapper}>
                {primaryKeywords.length === 0 ? (
                  <div className={styles.emptyChipsNotice}>
                    No manual keywords added yet. Type a term above and press Enter, or use AI suggestions below.
                  </div>
                ) : (
                  primaryKeywords.map((kw) => (
                    <div key={kw} className={styles.chip}>
                      <span>{kw}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveKeyword(kw)}
                        className={styles.chipRemove}
                        aria-label={`Remove ${kw}`}
                      >
                        <X size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* AI Keyword Suggestions Area */}
            <div className={styles.aiPlaceholderBox}>
              <div className={styles.aiPlaceholderHeader}>
                <div className={styles.aiHeaderTitle}>
                  <Sparkles size={18} color="#c084fc" />
                  <span>AI Keyword Suggestions</span>
                </div>
                {!aiGenerated && (
                  <button
                    type="button"
                    onClick={handleGenerateAiKeywords}
                    disabled={isGeneratingAi}
                    className={styles.aiActionBtn}
                  >
                    {isGeneratingAi ? (
                      <>
                        <Loader2 size={15} className={styles.spinner} />
                        <span>Generating suggestions...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles size={15} />
                        <span>Generate AI Keyword Suggestions</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {!aiGenerated && !isGeneratingAi && !aiError && (
                <p className={styles.aiPlaceholderText} style={{ margin: 0 }}>
                  Click &ldquo;Generate AI Keyword Suggestions&rdquo; to discover high-intent search terms
                  analyzed specifically for your website, industry, and SEO goals.
                </p>
              )}

              {isGeneratingAi && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 0', color: '#c084fc', fontSize: '13px' }}>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>Analyzing website context and generating strategic keyword opportunities...</span>
                </div>
              )}

              {aiError && (
                <div style={{ marginTop: '12px' }}>
                  <div className={styles.errorBanner} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} />
                      <span>{aiError}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAiKeywords}
                    disabled={isGeneratingAi}
                    className={styles.secondaryButton}
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    Retry AI Generation
                  </button>
                </div>
              )}

              {aiGenerated && (
                <div>
                  <div className={styles.aiSelectionSummary}>
                    <span>
                      <strong>{aiSuggestions.length}</strong> suggestions generated &bull;{' '}
                      <strong style={{ color: '#c084fc' }}>{selectedAiKeywords.length}</strong> selected &bull;{' '}
                      <strong style={{ color: '#38bdf8' }}>{getCombinedKeywords().length}/50</strong> total keywords ready
                    </span>
                    <button
                      type="button"
                      onClick={handleGenerateAiKeywords}
                      disabled={isGeneratingAi}
                      className={styles.secondaryButton}
                      style={{ fontSize: '11px', padding: '4px 10px' }}
                    >
                      {isGeneratingAi ? 'Regenerating...' : 'Regenerate'}
                    </button>
                  </div>

                  <div className={styles.aiSuggestionsGrid}>
                    {aiSuggestions.map((item) => {
                      const isSelected = selectedAiKeywords.some(
                        (k) => k.toLowerCase() === item.keyword.toLowerCase()
                      );

                      const intentClass =
                        item.intent === 'commercial'
                          ? styles.intentCommercial
                          : item.intent === 'transactional'
                          ? styles.intentTransactional
                          : item.intent === 'navigational'
                          ? styles.intentNavigational
                          : styles.intentInformational;

                      return (
                        <div
                          key={item.keyword}
                          className={`${styles.aiSuggestionCard} ${
                            isSelected ? styles.aiSuggestionCardSelected : ''
                          }`}
                          onClick={() => toggleAiKeyword(item.keyword)}
                        >
                          <div className={styles.aiCardTop}>
                            <span className={styles.aiCardKeyword}>{item.keyword}</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span className={`${styles.intentBadge} ${intentClass}`}>
                                {item.intent}
                              </span>
                              {isSelected ? (
                                <CheckCircle2 size={16} color="#c084fc" />
                              ) : (
                                <div
                                  style={{
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    border: '2px solid #475569',
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div className={styles.aiCardRationale}>{item.rationale}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 6: INTEGRATION PLATFORM
           =================================================================== */}
        {step === 6 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <Globe size={22} color="#60a5fa" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                How is your website managed?
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Select your website platform. Direct publishing and analytics connectors can be linked in your dashboard settings.
            </p>

            <div className={styles.selectionGrid}>
              {PRD_PLATFORMS.map((p) => {
                const isSelected = platform === p.id;
                return (
                  <div
                    key={p.id}
                    className={`${styles.selectableCard} ${isSelected ? styles.selectableCardActive : ''}`}
                    onClick={() => setPlatform(p.id)}
                  >
                    <div className={styles.cardIcon}>
                      {isSelected ? <CheckCircle2 size={20} color="#60a5fa" /> : <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid #475569' }} />}
                    </div>
                    <div>
                      <div className={styles.cardTextTitle}>{p.title}</div>
                      <div className={styles.cardTextDesc}>{p.desc}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: '20px', padding: '12px 16px', background: 'rgba(255,255,255,0.03)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5' }}>
                💡 <strong>Note:</strong> We will not ask for CMS credentials or API tokens during onboarding. You can optionally link publishing credentials in your settings later.
              </span>
            </div>
          </div>
        )}

        {/* ===================================================================
            STEP 7: INITIAL ANALYSIS PREPARATION SCREEN
           =================================================================== */}
        {step === 7 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <CheckCircle2 size={26} color="#10b981" />
              <h2 className={styles.wizardTitle} style={{ margin: 0 }}>
                Website connected successfully
              </h2>
            </div>
            <p className={styles.wizardSubtitle}>
              Your website <strong>{createdWebsite?.url || url}</strong> has been registered with RankAutonomous. SEO analysis will begin in the next stage.
            </p>

            {/* Analysis Stages List */}
            <div className={styles.analysisList}>
              {ANALYSIS_STAGES.map((stage, idx) => {
                const isCompleted = idx === 0; // Only connection is complete in Step 6
                return (
                  <div
                    key={stage.name}
                    className={`${styles.analysisItem} ${isCompleted ? styles.analysisItemDone : ''}`}
                  >
                    <div className={styles.analysisStageInfo}>
                      <div className={styles.analysisIndex}>
                        {isCompleted ? <Check size={14} /> : idx + 1}
                      </div>
                      <div>
                        <div className={styles.analysisStageName}>{stage.name}</div>
                        <div style={{ fontSize: '12px', color: '#94a3b8' }}>{stage.desc}</div>
                      </div>
                    </div>
                    <div>
                      {isCompleted ? (
                        <span className={`${styles.analysisBadge} ${styles.badgeDone}`}>Ready</span>
                      ) : (
                        <span className={`${styles.analysisBadge} ${styles.badgePending}`}>
                          <Clock size={10} style={{ display: 'inline', marginRight: 4 }} />
                          Next Phase
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ padding: '16px', background: 'rgba(37,99,235,0.08)', borderRadius: '8px', border: '1px solid rgba(37,99,235,0.25)', marginBottom: '24px' }}>
              <p style={{ fontSize: '13px', color: '#93c5fd', margin: 0, lineHeight: '1.5' }}>
                🚀 <strong>What happens next:</strong> In Step 7 (the subsequent milestone), the RankAutonomous background crawler will crawl your domain, evaluate technical health, discover competitor gaps, and generate your first batch of AI keywords.
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Link href="/app" className={styles.primaryButton}>
                Go to Dashboard →
              </Link>
            </div>
          </div>
        )}

        {/* ===================================================================
            WIZARD NAVIGATION FOOTER (Steps 1 - 6)
           =================================================================== */}
        {step < 7 && (
          <div className={styles.wizardNav}>
            <div>
              {step > 1 && (
                <button type="button" onClick={handleBack} className={styles.secondaryButton} disabled={submitting}>
                  <ArrowLeft size={16} /> Back
                </button>
              )}
            </div>

            <div>
              {step < 6 ? (
                <button type="button" onClick={handleNext} className={styles.primaryButton}>
                  Continue <ArrowRight size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConnectWebsite}
                  className={styles.primaryButton}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className={styles.loadingSpinner} />
                      Connecting Website...
                    </>
                  ) : (
                    <>
                      Connect Website &amp; Continue <ArrowRight size={16} />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
