import fetch from 'node-fetch';

async function run() {
    const res = await fetch('https://us-central1-studio-6697160840-7c67f.cloudfunctions.net/launchSharedRideDriverSearchV1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            data: { groupId: 'xz0OmE0a5xi2nzle0lbT' }
        })
    });
    const text = await res.text();
    console.log(res.status, text);
}

run().catch(console.error);
