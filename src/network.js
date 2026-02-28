import { ethers } from 'ethers';
import { SOMNIA_CONFIG } from './config.js';

const blockHeightEl = document.getElementById('blockHeight');
const gasPriceEl = document.getElementById('gasPrice');

let provider = null;

function flashStat(el) {
    el.classList.remove('updated');
    // Trigger reflow
    void el.offsetWidth;
    el.classList.add('updated');
}

async function fetchNetworkStats() {
    try {
        if (!provider) {
            provider = new ethers.JsonRpcProvider(SOMNIA_CONFIG.rpcUrl);
        }

        const [blockNumber, feeData] = await Promise.all([
            provider.getBlockNumber(),
            provider.getFeeData(),
        ]);

        blockHeightEl.textContent = blockNumber.toLocaleString();
        flashStat(blockHeightEl);

        if (feeData.gasPrice) {
            const gwei = parseFloat(ethers.formatUnits(feeData.gasPrice, 'gwei'));
            gasPriceEl.textContent = `${gwei.toFixed(2)} Gwei`;
            flashStat(gasPriceEl);
        }
    } catch (err) {
        console.error('Network stats error:', err);
    }
}

export function initNetwork() {
    // Initial fetch
    fetchNetworkStats();

    // Periodic polling every 10 seconds as a fallback
    setInterval(fetchNetworkStats, 10000);

    // Also update on new block from WebSocket reactivity
    window.addEventListener('newBlock', (e) => {
        const { blockNumber } = e.detail;
        if (blockNumber) {
            blockHeightEl.textContent = blockNumber.toLocaleString();
            flashStat(blockHeightEl);
        }
    });
}
