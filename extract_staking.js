const puppeteer = require('puppeteer');

async function run() {
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    // Intercept network requests
    page.on('request', request => {
        const url = request.url();
        if (url.includes('api') || url.includes('rpc') || url.includes('graphql')) {
            console.log('REQUEST:', request.method(), url);
        }
    });

    await page.goto('https://testnet.somnia.network/staking', { waitUntil: 'networkidle2' });

    await browser.close();
}

run().catch(console.error);
