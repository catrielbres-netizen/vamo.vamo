const fs = require('fs');
let c = fs.readFileSync('functions/src/lib/emails.ts', 'utf8');

c = c.replace(
    "const resend = new Resend(RESEND_API_KEY || 're_dummy_key_for_build');",
    "const resend = new Resend(RESEND_API_KEY || 're_dummy_key_for_build');\n\nexport const PUBLIC_BASE_URL = 'https://www.vamoapp.com.ar';\nexport const OFFICIAL_DRIVER_REGISTER_URL = `${PUBLIC_BASE_URL}/login/?role=driver`;"
);

c = c.split("https://www.vamoapp.com.ar/login/?role=driver").join("${OFFICIAL_DRIVER_REGISTER_URL}");
c = c.split("https://www.vamoapp.com.ar").join("${PUBLIC_BASE_URL}");

fs.writeFileSync('functions/src/lib/emails.ts', c);
