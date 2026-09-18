# RankAutonomous --- Modern UI Redesign Specification

## 1. Design Direction

Completely redesign the RankAutonomous product UI into a premium, modern
SaaS platform inspired by the supplied reference image.

The reference establishes a strong visual language: - warm editorial
background - large rounded white surfaces - bold oversized typography -
restrained black text - soft pastel accent blocks - thin borders -
generous whitespace - compact navigation - illustrated/visual feature
cards - strong hierarchy rather than dense dashboards

RankAutonomous must keep its own brand identity and SEO/AI product
purpose. Do NOT copy the reference site's text, branding, illustrations,
or exact layout.

The final experience should feel like a premium combination of: - modern
AI SaaS - SEO command center - editorial workspace - high-end product
website

Primary design goals: 1. Make RankAutonomous feel premium and
trustworthy. 2. Reduce visual complexity and dashboard clutter. 3. Make
important actions immediately obvious. 4. Create a consistent design
system across marketing pages and authenticated app pages. 5. Make AI
functionality feel intelligent without looking gimmicky. 6. Preserve
accessibility, responsiveness, performance, and usability.

------------------------------------------------------------------------

# 2. Global Visual Language

## Color System

Use a restrained palette.

### Core

-   Background: warm off-white / very light cream
-   Surface: pure white
-   Primary text: near-black
-   Secondary text: muted charcoal
-   Border: soft neutral gray
-   Primary accent: muted blush/coral pink
-   Secondary accent: very pale pink
-   Success: muted green
-   Warning: muted amber
-   Error: muted red
-   AI accent: subtle lavender/pink gradient only where useful

Suggested tokens:

``` css
--background: #f7f3ef;
--surface: #ffffff;
--surface-soft: #fbf8f5;
--text: #111111;
--text-secondary: #5f5b58;
--text-muted: #8b8580;
--border: #ded9d4;
--border-strong: #c8c1bb;
--accent: #e8aaa6;
--accent-soft: #f6d8d5;
--accent-strong: #d98f8b;
--success: #6f9b7c;
--warning: #c69752;
--error: #c66f6f;
--ai: #b8a8d9;
```

Do not use excessive gradients, neon colors, glassmorphism, or
dark-mode-only aesthetics.

Dark sections may be used selectively for emphasis.

------------------------------------------------------------------------

# 3. Typography

Use a modern geometric/neo-grotesk sans-serif.

Preferred: - Geist - Inter - Manrope - DM Sans

Use one primary font family consistently.

Typography hierarchy:

### Hero

Large: `clamp(3rem, 7vw, 6.5rem)`

Weight: 600--700

Very tight line-height: 0.92--1.02

### Section headings

`clamp(2rem, 4vw, 4rem)`

### Page headings

`clamp(2rem, 4vw, 3.5rem)`

### Card headings

18--24px

### Body

15--18px

### Metadata

12--14px

Avoid excessive font weights.

Use typography itself as a major visual element.

------------------------------------------------------------------------

# 4. Layout Principles

Use a centered responsive container:

``` css
max-width: 1400px;
margin-inline: auto;
padding-inline: clamp(20px, 4vw, 64px);
```

Desktop layouts should breathe.

Use: - large margins - 24--40px card gaps - 80--160px section spacing -
rounded 20--32px surfaces - thin borders - subtle shadows only where
necessary

Avoid: - tiny cards packed tightly together - excessive borders -
unnecessary shadows - excessive gradients - excessive icons - generic
template dashboard appearance

------------------------------------------------------------------------

# 5. Border Radius

Create a consistent radius system:

``` css
--radius-sm: 10px;
--radius-md: 16px;
--radius-lg: 24px;
--radius-xl: 32px;
--radius-pill: 999px;
```

Primary cards: 24px--32px.

Buttons: 10px--14px.

Tags: pill or 8--10px.

------------------------------------------------------------------------

# 6. Navigation

## Marketing Navigation

Create a minimal floating/contained navigation.

Desktop:

``` text
RankAutonomous

Features   How It Works   Pricing   FAQ

Log in     Start Growing →
```

The navigation should: - remain compact - have generous horizontal
spacing - use minimal visual decoration - become sticky after
scrolling - transition smoothly when scrolling

Mobile: - logo - hamburger - compact CTA

Avoid traditional bulky SaaS navbar styling.

------------------------------------------------------------------------

# 7. Marketing Homepage

## Hero

The existing product positioning must remain:

> Put Your SEO on Autopilot.

Build a dramatic editorial hero.

Structure:

``` text
[small AI SEO badge]

PUT YOUR SEO
ON AUTOPILOT.

RankAutonomous continuously analyzes,
creates, publishes, and improves your
organic growth strategy.

[Start Growing →]   [See How It Works]

                 [product/dashboard visual]
```

Use oversized typography.

The product UI visual should feel like a physical/premium dashboard
surface rather than a generic screenshot.

Add subtle decorative pastel shapes.

Do not overload the hero.

------------------------------------------------------------------------

# 8. Hero Product Visual

Create a large dashboard preview showing:

-   SEO Health Score
-   Organic Traffic
-   Keyword movement
-   AI content activity
-   Recommendations
-   Content pipeline

Use realistic but clearly illustrative/demo values.

Label demo information appropriately.

The dashboard preview should have: - white surface - large radius - thin
border - subtle shadow - layered cards - clean charts - restrained
accent colors

------------------------------------------------------------------------

# 9. Problem Section

Use a split editorial layout.

Example structure:

``` text
THE PROBLEM

SEO is not one task.
It is hundreds of small decisions.

[Technical SEO]
[Content]
[Keywords]
[Backlinks]
[Analytics]
```

Use oversized numbers and minimal supporting text.

Avoid generic three-column SaaS feature blocks.

------------------------------------------------------------------------

# 10. Product Philosophy

Introduce:

``` text
ANALYZE
CREATE
BUILD
GROW
```

Each stage gets a large visual card.

### ANALYZE

Crawler + SEO audit + health score.

### CREATE

Keyword research + strategy + AI content.

### BUILD

Publishing + internal linking + backlinks.

### GROW

Analytics + rankings + recommendations.

This should become one of the major visual identities of RankAutonomous.

------------------------------------------------------------------------

# 11. Feature Cards

Feature cards should resemble the supplied reference:

-   asymmetric grid
-   large rounded rectangles
-   alternating soft pastel surfaces
-   minimal text
-   simple illustrations/data visualizations

Example:

``` text
SEO AUDIT

Find technical and content
issues automatically.

→ Explore
```

Use custom product visuals rather than stock images.

------------------------------------------------------------------------

# 12. How It Works

Create a horizontal/vertical timeline:

``` text
01  CONNECT
    Connect your website.

02  ANALYZE
    RankAutonomous crawls and evaluates it.

03  STRATEGIZE
    AI creates your SEO growth plan.

04  CREATE
    Generate optimized content.

05  PUBLISH
    Publish through your connected CMS.

06  GROW
    Monitor results and continuously improve.
```

Animate steps subtly on scroll.

------------------------------------------------------------------------

# 13. Pricing

Pricing should focus on the single RankAutonomous offering.

Monthly: \$199/month

Annual: \$1,788/year (\$149/month equivalent)

Show: - Annual savings - Monthly/annual toggle - primary CTA - concise
feature list

Avoid multiple-tier comparison grids.

Make the pricing card large and premium.

------------------------------------------------------------------------

# 14. FAQ

Use an editorial accordion.

Large question typography.

Keep answers concise.

Use generous vertical spacing.

------------------------------------------------------------------------

# 15. Footer

Use a large dark footer.

Structure:

``` text
RankAutonomous

Put your SEO on autopilot.

Product
Features
How It Works
Pricing

Company
Contact
Terms
Privacy

© RankAutonomous
```

Minimal social icons.

------------------------------------------------------------------------

# 16. Authenticated App Design

The application must NOT look like a generic admin template.

Create a premium SEO workspace.

Desktop structure:

``` text
┌──────────────────────────────────────────────────────────┐
│ RankAutonomous       Website ▼        Search     Avatar │
├───────────────┬──────────────────────────────────────────┤
│               │                                          │
│ Overview      │                                          │
│ SEO Audit     │             Main Workspace               │
│ Strategy      │                                          │
│ Keywords      │                                          │
│ Content       │                                          │
│ Backlinks     │                                          │
│ Analytics     │                                          │
│ Reports       │                                          │
│               │                                          │
│ Settings      │                                          │
└───────────────┴──────────────────────────────────────────┘
```

Sidebar: - clean - narrow - icon + label - active state uses soft accent
background - no heavy dark sidebar

------------------------------------------------------------------------

# 17. Dashboard Redesign

The dashboard should answer:

> "How is my SEO doing, and what should I do next?"

Top:

``` text
Good morning.

Your SEO is moving in the right direction.

[Website selector] [Last 30 days]
```

Then one dominant SEO Health card:

``` text
SEO HEALTH

82 / 100

↑ 7 points this month

Technical     91
On-page       84
Content       79
Internal      76
Performance   88
```

Next:

``` text
Organic Traffic       Keyword Movement
24.8K                  +18%

Backlinks              Published Articles
184                    27
```

Then:

``` text
WHAT NEEDS ATTENTION

01 Fix 3 missing meta descriptions
02 Improve 5 thin pages
03 Add internal links to 8 pages
```

Then:

``` text
AI ACTIVITY

Article generated
Keyword cluster created
SEO issue detected
Recommendation created
```

------------------------------------------------------------------------

# 18. SEO Audit UI

Use an editorial report style.

Top:

``` text
SEO AUDIT

82 / 100

Your website is healthy,
but 7 improvements could increase
its organic potential.

[Run New Audit]
```

Category cards:

``` text
TECHNICAL        91
ON-PAGE          84
CONTENT          79
INTERNAL LINKS   76
PERFORMANCE      88
```

Issues should be prioritized:

``` text
CRITICAL
HIGH
MEDIUM
LOW
```

Each issue:

``` text
Missing meta description
5 pages affected

Why it matters
How to fix it

[View Pages]
[Mark Resolved]
```

------------------------------------------------------------------------

# 19. AI Strategy UI

Make the strategy feel like an intelligent plan.

Hero:

``` text
YOUR SEO GROWTH PLAN

Built from your website,
content, and SEO data.

[Refresh Strategy]
```

Sections:

``` text
PRIORITY ACTIONS
KEYWORD STRATEGY
CONTENT STRATEGY
INTERNAL LINKING
TECHNICAL SEO
BACKLINK STRATEGY
```

Priority actions should use numbered cards.

Avoid pretending AI knows data it does not actually have.

------------------------------------------------------------------------

# 20. Keyword Research UI

Use a high-quality research table.

Top:

``` text
KEYWORD RESEARCH

Find opportunities worth pursuing.

[Search keywords...]

[All] [Informational] [Commercial]
```

Columns:

-   Keyword
-   Intent
-   Volume
-   Difficulty
-   Current Rank
-   Opportunity
-   Cluster

Unavailable real metrics must display:

`Not available`

Never display fake SEO numbers.

------------------------------------------------------------------------

# 21. Content Engine UI

This is one of the most important product screens.

Content dashboard:

``` text
CONTENT ENGINE

Your AI publishing workspace.

[Create Article]

Ideas      Drafts      Review      Approved      Published
```

Article cards should feel editorial.

Example:

``` text
HOW TO IMPROVE LOCAL SEO FOR SMALL BUSINESSES

Target keyword:
local SEO for small businesses

1,842 words

AI Review: 91

USER REVIEW

Open →
```

Use status colors subtly.

------------------------------------------------------------------------

# 22. Article Workspace

Make it resemble a premium writing application.

Layout:

``` text
┌───────────────────────────────────────────────────────┐
│ ← Content        Draft        AI Review      Approve │
├───────────────────────────────────────┬───────────────┤
│                                       │               │
│ ARTICLE TITLE                         │ AI REVIEW     │
│                                       │               │
│ Meta description                      │ 91/100        │
│                                       │               │
│ ───────────────────────────────────   │ Strengths     │
│                                       │ Issues        │
│ Article content                       │ Suggestions   │
│                                       │               │
│                                       │               │
└───────────────────────────────────────┴───────────────┘
```

The editor should have: - clean typography - excellent line length -
minimal chrome - sticky review panel - autosave indicator - word count -
headings outline

------------------------------------------------------------------------

# 23. Onboarding

Make onboarding feel like a premium setup experience rather than a form.

Progress:

``` text
01 Website
02 Business
03 Goals
04 Location
05 Keywords
06 Integration
07 Analysis
```

Large centered card.

One major question per screen.

Use: - large input - example text - minimal helper text - clear
Back/Continue buttons - progress indicator

AI keyword suggestions should feel interactive and visual.

------------------------------------------------------------------------

# 24. Billing

Use a clean subscription page.

Show:

``` text
YOUR PLAN

RankAutonomous Complete

$199 / month

ACTIVE

Next renewal
October 15, 2026

[Manage Billing]
```

Avoid complicated enterprise billing UI.

------------------------------------------------------------------------

# 25. Empty States

Never show blank pages.

Every empty state should explain:

1.  What this section does.
2.  Why it matters.
3.  What action the user should take.

Example:

``` text
No articles yet.

Turn your keyword strategy into
search-focused content with AI.

[Create Your First Article]
```

------------------------------------------------------------------------

# 26. Loading States

Use skeletons rather than generic spinners whenever possible.

AI operations can use intelligent progress messaging:

``` text
Analyzing your website...
Finding relevant pages...
Building your content context...
Generating article...
Validating internal links...
Preparing your draft...
```

Do not fake progress percentages.

Only show actual backend progress where available.

------------------------------------------------------------------------

# 27. AI Visual Language

AI functionality should have a recognizable but subtle visual language.

Use: - soft lavender/pink accents - sparkle icon sparingly - small "AI"
badges - animated gradient only during active AI processing

Avoid: - excessive glowing effects - futuristic neon - robotic imagery -
generic AI brain graphics

AI should feel like infrastructure, not decoration.

------------------------------------------------------------------------

# 28. Buttons

Primary:

``` text
Start Growing →
Generate Article →
Run Audit →
Create Strategy →
Publish →
```

Use dark near-black buttons with light text.

Secondary: - white/transparent - thin border

Tertiary: - text buttons

Buttons should have: - 10--14px radius - 44px minimum height - subtle
hover transform/transition - clear disabled state

------------------------------------------------------------------------

# 29. Forms

Use: - large readable labels - 48--56px input height - soft white
surfaces - 1px borders - clear focus states - concise helper text

Never hide important validation messages.

------------------------------------------------------------------------

# 30. Tables

Avoid dense enterprise tables.

Use: - generous row height - 14--15px text - subtle separators - sticky
header only when useful - responsive horizontal scroll on mobile

Important values should use typography, not color alone.

------------------------------------------------------------------------

# 31. Charts

Charts should be minimal.

Use: - simple line charts - area charts only when useful - subtle grid -
clear labels - tooltips - accessible data tables where appropriate

Do not use charts for metrics that do not actually exist.

------------------------------------------------------------------------

# 32. Responsive Design

Must support:

### Desktop

1440px+ Primary experience.

### Laptop

1024--1439px.

### Tablet

768--1023px.

### Mobile

320--767px.

Mobile behavior: - sidebar becomes drawer/bottom navigation - cards
become one column - tables become horizontal-scroll or card views - hero
typography scales down - buttons become full-width where appropriate -
article editor becomes single-column

No horizontal overflow.

------------------------------------------------------------------------

# 33. Motion Design

Use subtle motion.

Recommended: - 150--250ms hover transitions - 250--400ms card entrance -
scroll reveal - smooth accordion - skeleton shimmer - AI processing
animation

Do NOT over-animate.

Respect:

``` css
@media (prefers-reduced-motion: reduce)
```

------------------------------------------------------------------------

# 34. Icons

Use the existing `lucide-react` icon system.

Do not mix multiple icon libraries.

Icons should: - support text - not replace text - use consistent stroke
weight - remain visually subtle

------------------------------------------------------------------------

# 35. Accessibility

Maintain:

-   WCAG AA contrast
-   keyboard navigation
-   visible focus states
-   semantic HTML
-   proper labels
-   aria labels where needed
-   accessible dialogs
-   accessible accordions
-   reduced motion support

Do not rely on color alone for status.

------------------------------------------------------------------------

# 36. Design System Components

Create reusable components rather than styling every page independently.

Suggested:

``` text
Button
Card
Badge
Input
Textarea
Select
Modal
Tabs
Accordion
StatCard
MetricCard
SectionHeading
PageHeader
EmptyState
Skeleton
StatusBadge
ProgressBar
ChartCard
DataTable
AiBadge
AiActivity
```

Create shared design tokens.

Avoid duplicated CSS.

------------------------------------------------------------------------

# 37. Component Architecture

Keep:

``` text
Marketing UI
  ↓
Shared design primitives

App UI
  ↓
Shared design primitives
```

Marketing and dashboard can have different layouts but must feel like
the same product.

Do not introduce an entirely unrelated visual language for the
dashboard.

------------------------------------------------------------------------

# 38. Page-by-Page Redesign

Redesign all existing pages:

### Public

-   /
-   /features
-   /how-it-works
-   /pricing
-   /faq
-   /contact
-   /terms
-   /privacy

### Authentication

-   /login
-   /signup
-   /forgot-password
-   /reset-password
-   /verify-email

### App

-   /app
-   /app/onboarding
-   /app/profile
-   /app/billing
-   /app/keywords
-   /app/content
-   /app/content/\[articleId\]

Future pages should follow the same design system: - /app/backlinks -
/app/analytics - /app/reports - /app/settings - /app/integrations -
/app/admin

------------------------------------------------------------------------

# 39. Preserve Functionality

This redesign is UI/UX focused.

Do NOT break:

-   authentication
-   Supabase session handling
-   RBAC
-   Stripe
-   billing portal
-   onboarding APIs
-   website APIs
-   crawler
-   SEO audit
-   SEO strategy
-   keyword research
-   AI content generation
-   AI review
-   article workflow
-   API routes
-   database relationships

Do not replace working backend logic simply to redesign the UI.

------------------------------------------------------------------------

# 40. Data Integrity

Never replace real backend data with mock values.

For unavailable metrics, use:

`Not available`

For AI processing: - show actual job state - do not fake completion

For analytics: - show empty states until integrations exist

For backlinks: - show empty state until implemented

------------------------------------------------------------------------

# 41. Performance

Maintain excellent performance.

Avoid: - huge image assets - unnecessary client components - excessive
JavaScript - animation libraries for simple transitions - blocking
fonts - oversized SVGs

Prefer CSS transitions and existing project dependencies.

------------------------------------------------------------------------

# 42. SEO

The redesign must preserve:

-   metadata
-   canonical URLs
-   sitemap
-   robots
-   semantic HTML
-   headings hierarchy
-   accessible navigation

Do not change existing SEO configuration unless necessary.

------------------------------------------------------------------------

# 43. Implementation Strategy

Before changing code:

1.  Inspect existing app structure.
2.  Inspect existing CSS architecture.
3.  Inspect current components.
4.  Identify reusable components.
5.  Create design tokens.
6.  Create shared UI primitives.
7.  Redesign marketing shell.
8.  Redesign marketing pages.
9.  Redesign dashboard shell.
10. Redesign dashboard.
11. Redesign onboarding.
12. Redesign keywords.
13. Redesign content engine.
14. Redesign article workspace.
15. Redesign billing/profile.
16. Test responsive behavior.
17. Run production build.
18. Check for regressions.

Do not rewrite everything in one uncontrolled operation.

------------------------------------------------------------------------

# 44. Visual Quality Standard

The final UI should look like a product that could credibly be shown to:

-   SaaS customers
-   startup founders
-   marketing teams
-   SEO professionals
-   investors

Avoid the visual appearance of: - a student project - a generic Tailwind
template - an admin dashboard starter kit - an AI-generated landing page

The supplied reference image should guide the visual principles:
**editorial, premium, minimal, rounded, spacious, warm, modern,
confident.**

But RankAutonomous must remain clearly its own product.

------------------------------------------------------------------------

# 45. Definition of Done

The redesign is complete only when:

-   all existing pages use the new visual system
-   marketing pages feel cohesive
-   authenticated dashboard feels cohesive
-   navigation is redesigned
-   dashboard is redesigned
-   onboarding is redesigned
-   keyword workspace is redesigned
-   content workspace is redesigned
-   article editor is redesigned
-   billing/profile are redesigned
-   responsive behavior works
-   accessibility basics are preserved
-   existing backend functionality still works
-   no fake data was introduced
-   no secrets were exposed
-   production build passes
-   TypeScript passes
-   no console/runtime errors remain in normal usage

The final result should feel like a premium modern SEO automation
platform rather than a conventional SaaS admin interface.
