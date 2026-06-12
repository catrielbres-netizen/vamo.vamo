async function testKeys() {
    const token1 = 'APP_USR-6363903695837690-120218-e2f26d49090a026bf38d14806e4495d3-665467758';
    const token2 = 'APP_USR-2821217112912946-123020-14930c7325c03c225477aeac1ab7582a-3102929531';

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
