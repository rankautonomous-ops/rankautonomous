const fs = require('fs');
let text = fs.readFileSync('apps/api/src/test/cms-comprehensive-test.ts', 'utf8');
text = text.replace(/user\\\\'s/g, 'users');
text = text.replace(/user\\'s/g, 'users');
text = text.replace(/user\\'s/g, 'users');
fs.writeFileSync('apps/api/src/test/cms-comprehensive-test.ts', text);
