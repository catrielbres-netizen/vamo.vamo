async function testKeys() {
    const token1 = 'APP_USR-COMPROMISED';
    const token2 = 'APP_USR-COMPROMISED2';

    async function tryCreate(token: string) {
        const res = await fetch('https://api.mercadopago.com/checkout/preferences', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: [{ id: 'test', title: 'test', quantity: 1, unit_price: 100 }],
                back_urls: { success: 'http://localhost/success' }
            })
        });
        const data = await res.json();
        if (!res.ok) {
            console.error(`Token failed:`, data);
        } else {
            console.log(`Success! Init point:`, data.init_point);
        }
    }

    console.log("Testing token1...");
    await tryCreate(token1);
    
    console.log("\nTesting token2...");
    await tryCreate(token2);
}

testKeys();
