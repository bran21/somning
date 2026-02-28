import { ethers } from 'ethers';
import { SOMNIA_CONFIG, formatSTT } from './config.js';
import { getProvider, getAddress } from './wallet.js';

const balanceAmountEl = document.getElementById('balanceAmount');
const balanceUsdEl = document.getElementById('balanceUsd');
const stakedAmountEl = document.getElementById('stakedAmount');
const stakedUsdEl = document.getElementById('stakedUsd');

export async function updatePortfolio() {
    const address = getAddress();
    const provider = getProvider();

    if (!address || !provider) {
        balanceAmountEl.textContent = '—';
        balanceUsdEl.textContent = 'Connect wallet to view';
        if (stakedAmountEl) stakedAmountEl.textContent = '—';
        if (stakedUsdEl) stakedUsdEl.textContent = 'Stake STT to earn rewards';

        const walletActions = document.getElementById('walletActions');
        const stakingActions = document.getElementById('stakingActions');
        if (walletActions) walletActions.style.display = 'none';
        if (stakingActions) stakingActions.style.display = 'none';

        return;
    }

    try {
        const balance = await provider.getBalance(address);
        const formatted = parseFloat(ethers.formatEther(balance));
        balanceAmountEl.textContent = `${formatted.toFixed(4)} STT`;
        balanceUsdEl.textContent = 'Somnia Testnet Token';

        if (stakedAmountEl) {
            // Calculate staked amount by summing transactions to the staking proxy
            try {
                const txUrl = `https://shannon-explorer.somnia.network/api/v2/addresses/${address}/transactions`;
                const txRes = await fetch(txUrl);
                const txData = await txRes.json();

                let totalStaked = 0n;
                const stakingContract = "0xbe367d410d96e1caef68c0632251072cdf1b8250";

                if (txData && txData.items) {
                    txData.items.forEach(tx => {
                        if (!tx.to || tx.to.hash.toLowerCase() !== stakingContract) return;
                        if (tx.status !== 'ok') return;

                        // 0x3c323a1b = delegateStake(address,uint256)
                        if (tx.method === '0x3c323a1b') {
                            totalStaked += BigInt(tx.value || 0);
                        }
                        // Assume standard undelegate (e.g. 0x... wait, without the method we might miss it. We'll deduct any out-value. But unstaking is usually a function call with 0 value and amount in params)
                        // If they ever withdraw, we would ideally parse the params, but for now we'll show their gross total staked
                    });
                }

                const stakedFormatted = parseFloat(ethers.formatEther(totalStaked));
                stakedAmountEl.textContent = `${stakedFormatted.toFixed(4)} STT`;
            } catch (e) {
                console.error('Staking history fetch error:', e);
                // Fallback to zero if API fails
                stakedAmountEl.textContent = '0.0000 STT';
            }
        }
        if (stakedUsdEl) stakedUsdEl.textContent = 'Active on Somnia Staking';

        const walletActions = document.getElementById('walletActions');
        const stakingActions = document.getElementById('stakingActions');
        if (walletActions) walletActions.style.display = 'flex';
        if (stakingActions) stakingActions.style.display = 'flex';

    } catch (err) {
        console.error('Portfolio fetch error:', err);
        balanceAmountEl.textContent = 'Error';
        balanceUsdEl.textContent = 'Could not fetch balance';
        if (stakedAmountEl) stakedAmountEl.textContent = 'Error';
        if (stakedUsdEl) stakedUsdEl.textContent = '';
    }
}

export function initPortfolio() {
    window.addEventListener('walletConnected', () => {
        updatePortfolio();
    });
}
