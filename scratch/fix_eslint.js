const fs = require('fs');

// Fix ReportsDashboard.tsx
const reportsPath = 'apps/web/src/app/app/reports/ReportsDashboard.tsx';
if (fs.existsSync(reportsPath)) {
  let content = fs.readFileSync(reportsPath, 'utf8');
  content = content.replace(
    /useEffect\(\(\) => \{\s*fetchReports\(\);\s*\}, \[website\]\);/,
    "// fetchReports defined below"
  );
  content = content.replace(
    /const fetchReports = async \(\) => \{/,
    "const fetchReports = async () => {"
  );
  // Re-insert useEffect after fetchReports
  content = content.replace(
    /const generateReport = async \(\) => \{/,
    "useEffect(() => {\n    fetchReports();\n  }, [website]);\n\n  const generateReport = async () => {"
  );
  fs.writeFileSync(reportsPath, content);
}

// Fix PricingTable.tsx
const pricingPath = 'apps/web/src/components/marketing/PricingTable.tsx';
if (fs.existsSync(pricingPath)) {
  let content = fs.readFileSync(pricingPath, 'utf8');
  content = content.replace(/ArrowRight,?\s*/, '');
  content = content.replace(/const userSession = await supabase\.auth\.getSession\(\);/, 'await supabase.auth.getSession();');
  fs.writeFileSync(pricingPath, content);
}
