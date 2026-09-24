const fs = require('fs');
const file = 'A:/freelancingg/RankAutonomous/apps/web/src/app/app/content/[articleId]/ArticleWorkspace.tsx';
let content = fs.readFileSync(file, 'utf8');

// Fix `prev` type error
content = content.replace(
  "setArticle(prev => ({...prev, status: 'PUBLISHED'}));",
  "setArticle((prev: any) => ({...prev, status: 'PUBLISHED'}));"
);

// Remove handleConnectWordPress and related wpError, wpConnecting, etc.
const toRemove = /const handleConnectWordPress = async \(e: React.FormEvent\) => \{[\s\S]*?finally \{\s*setWpConnecting\(false\);\s*\}\s*\};/;
content = content.replace(toRemove, '');

// Line 602: wpIntegration?.connected 
// We'll replace it with cmsConnections.length > 0
content = content.replace(
  "{(!article.cmsPublicationInfo || article.cmsPublicationInfo.provider !== 'WORDPRESS') && wpIntegration?.connected && (",
  "{(!article.publications || article.publications.length === 0) && cmsConnections.length > 0 && ("
);

// Remove leftover wp states
content = content.replace("const [wpUrl, setWpUrl] = useState('');", "");
content = content.replace("const [wpUsername, setWpUsername] = useState('');", "");
content = content.replace("const [wpPassword, setWpPassword] = useState('');", "");
content = content.replace("const [wpConnecting, setWpConnecting] = useState(false);", "");
content = content.replace("const [wpError, setWpError] = useState<string | null>(null);", "");

// The WP Connection Modal (showWpModal logic) might still exist in the JSX.
// We can remove it or ignore it, but since `showWpModal` still exists, let's find the WP Connection Modal and remove it.
const modalStart = '{/* WordPress Connection Modal */}';
const wpModalRegex = /\{\/\* WordPress Connection Modal \*\/\}[\s\S]*?\{\/\* CMS Connection Modal \*\/\}/;
if (wpModalRegex.test(content)) {
  content = content.replace(wpModalRegex, '{/* CMS Connection Modal */}');
} else {
  // Try another approach
  const wpModalAlternativeRegex = /\{\/\* WordPress Connection Modal \*\/\}[\s\S]*?\s*\{\s*showWpModal && \([\s\S]*?<\/form>\s*<\/div>\s*<\/div>\s*\)\}/;
  content = content.replace(wpModalAlternativeRegex, '');
}

fs.writeFileSync(file, content);
