import fetch from 'node-fetch';

async function verifyToken() {
    const token = "APP_USR-COMPROMISED";
    
    try {
        const res = await fetch('https://api.mercadopago.com/users/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        const data = await res.json();
        
        console.log("\n--- RESULTADO DE VALIDACIÓN ---");
        console.log(`Token evaluado: APP_USR-***${token.slice(-4)}`);
        if (res.ok) {
            console.log(`✅ API Response OK`);
            console.log(`User ID Devuelto: ${data.id}`);
            const email = data.email || '';
            const maskedEmail = email ? email.substring(0, 4) + '***@***.com' : 'No provisto';
            console.log(`Nickname: ${data.nickname}`);
            console.log(`Email Enmascarado: ${maskedEmail}`);
            console.log(`Tags: ${JSON.stringify(data.tags)}`);
            console.log(`Site ID: ${data.site_id}`);
        } else {
            console.log(`❌ API Response ERROR: ${res.status}`);
            console.log(`Message: ${data.message || JSON.stringify(data)}`);
        }
        console.log("-------------------------------\n");
    } catch (err) {
        console.error("Error validando token:", err);
    }
}

verifyToken();
