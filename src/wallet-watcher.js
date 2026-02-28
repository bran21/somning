import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, showToast } from './config.js';
import { fetchNFTsForAddress, setupNftSearch } from './nft-portfolio.js';

const STORAGE_KEY = 'somnia_watched_wallets';
const watcherInput = document.getElementById('watcherInput');
const watcherAddBtn = document.getElementById('watcherAddBtn');
const watcherListEl = document.getElementById('watcherList');

// Modal Elements
const walletDetailOverlay = document.getElementById('walletDetailOverlay');
const walletDetailClose = document.getElementById('walletDetailClose');
const detailAddressShort = document.getElementById('detailAddressShort');
const detailAddressFull = document.getElementById('detailAddressFull');
const detailBalance = document.getElementById('detailBalance');
const detailExplorerLink = document.getElementById('detailExplorerLink');
const detailNftGrid = document.getElementById('detailNftGrid');
const detailNftCount = document.getElementById('detailNftCount');

let watchedWallets = [];

function loadWallets() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            watchedWallets = JSON.parse(stored);
        }
    } catch {
        watchedWallets = [];
    }
}

function saveWallets() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(watchedWallets));
}

async function fetchBalance(address) {
    try {
        const provider = new ethers.JsonRpcProvider(SOMNIA_CONFIG.rpcUrl);
        const balance = await provider.getBalance(address);
        return parseFloat(ethers.formatEther(balance)).toFixed(4);
    } catch {
        return '—';
    }
}

async function fetchNFTCount(address) {
    try {
        const resp = await fetch(`${SOMNIA_CONFIG.explorerApiUrl}/v2/addresses/${address}/tokens`);
        if (resp && resp.ok) {
            const data = await resp.json();
            if (data.items && Array.isArray(data.items)) {
                return data.items.filter(item => item.token?.type === 'ERC-721' || item.token?.type === 'ERC-1155').length;
            }
        }
        return 0;
    } catch {
        return 0;
    }
}

async function fetchStakedBalance(address) {
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
                if (tx.method === '0x3c323a1b') {
                    totalStaked += BigInt(tx.value || 0);
                }
            });
        }
        return parseFloat(ethers.formatEther(totalStaked)).toFixed(4);
    } catch {
        return '0.0000';
    }
}

async function addWallet() {
    const address = watcherInput.value.trim();

    if (!ethers.isAddress(address)) {
        showToast('Invalid Ethereum address', 'error');
        return;
    }

    // Check duplicate
    if (watchedWallets.find(w => w.address.toLowerCase() === address.toLowerCase())) {
        showToast('Address already being watched', 'info');
        return;
    }

    watcherAddBtn.disabled = true;
    watcherAddBtn.textContent = 'Adding...';

    const balance = await fetchBalance(address);
    const stakedBalance = await fetchStakedBalance(address);
    const nftCount = await fetchNFTCount(address);

    watchedWallets.push({ address, balance, stakedBalance, nftCount });
    saveWallets();
    renderWallets();

    watcherInput.value = '';
    watcherAddBtn.disabled = false;
    watcherAddBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Watch`;
    showToast(`Watching ${shortenAddress(address)}`, 'success');
}

function removeWallet(address) {
    watchedWallets = watchedWallets.filter(w => w.address.toLowerCase() !== address.toLowerCase());
    saveWallets();
    renderWallets();
    showToast('Wallet removed', 'info');
}

async function refreshWallet(address) {
    const balance = await fetchBalance(address);
    const stakedBalance = await fetchStakedBalance(address);
    const nftCount = await fetchNFTCount(address);
    const wallet = watchedWallets.find(w => w.address.toLowerCase() === address.toLowerCase());
    if (wallet) {
        wallet.balance = balance;
        wallet.stakedBalance = stakedBalance;
        wallet.nftCount = nftCount;
        saveWallets();
        renderWallets();
    }
}

async function showWalletDetail(address) {
    detailAddressShort.textContent = shortenAddress(address);
    detailAddressFull.textContent = address;
    detailExplorerLink.href = `${SOMNIA_CONFIG.explorerUrl}/address/${address}`;
    detailBalance.textContent = 'Loading...';

    // Check if detailStakedAmount exists before trying to update it (to prevent errors if HTML is not updated yet)
    const detailStakedAmount = document.getElementById('detailStakedAmount');
    if (detailStakedAmount) detailStakedAmount.textContent = 'Loading...';

    detailNftCount.textContent = 'Fetching...';

    walletDetailOverlay.classList.add('show');

    // Fetch current balance
    const [balance, stakedBalance] = await Promise.all([
        fetchBalance(address),
        fetchStakedBalance(address)
    ]);
    detailBalance.textContent = balance;
    if (detailStakedAmount) detailStakedAmount.textContent = stakedBalance;

    // Fetch NFTs using refactored logic
    await fetchNFTsForAddress(address, detailNftGrid);

    // Update count based on grid items
    const nftCount = detailNftGrid.querySelectorAll('.nft-card').length;
    detailNftCount.textContent = `${nftCount} NFTs found`;
}

function closeDetailModal() {
    walletDetailOverlay.classList.remove('show');
}

function renderWallets() {
    if (watchedWallets.length === 0) {
        watcherListEl.innerHTML = `
            <div class="watcher-empty">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                <p>No wallets being watched</p>
                <p class="watcher-empty-sub">Add an address above to start tracking</p>
            </div>`;
        return;
    }

    watcherListEl.innerHTML = '';

    watchedWallets.forEach(wallet => {
        const item = document.createElement('div');
        item.className = 'watcher-item';
        item.innerHTML = `
            <div class="watcher-item-info">
                <div class="watcher-item-address" data-address="${wallet.address}">
                    <span class="watcher-addr">${shortenAddress(wallet.address)}</span>
                    <span class="watcher-explorer-icon">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </span>
                 </div>
                 <span class="watcher-balance">${wallet.balance} STT &middot; ${wallet.stakedBalance || '0.0000'} STT Staked &middot; ${wallet.nftCount || 0} NFTs</span>
             </div>
            <div class="watcher-item-actions">
                <button class="watcher-refresh-btn" title="Refresh balance" data-address="${wallet.address}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                </button>
                <button class="watcher-remove-btn" title="Remove" data-address="${wallet.address}">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
            </div>
        `;
        watcherListEl.appendChild(item);
    });

    // Attach event listeners
    watcherListEl.querySelectorAll('.watcher-item-address').forEach(el => {
        el.addEventListener('click', () => showWalletDetail(el.dataset.address));
    });

    watcherListEl.querySelectorAll('.watcher-refresh-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            refreshWallet(btn.dataset.address);
        });
    });

    watcherListEl.querySelectorAll('.watcher-remove-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeWallet(btn.dataset.address);
        });
    });
}

export function initWalletWatcher() {
    loadWallets();
    renderWallets();

    watcherAddBtn.addEventListener('click', addWallet);
    watcherInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addWallet();
    });

    // Modal Close logic
    walletDetailClose.addEventListener('click', closeDetailModal);
    walletDetailOverlay.addEventListener('click', (e) => {
        if (e.target === walletDetailOverlay) closeDetailModal();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeDetailModal();
    });

    // Refresh all balances periodically (every 60s)
    setInterval(async () => {
        for (const wallet of watchedWallets) {
            wallet.balance = await fetchBalance(wallet.address);
            wallet.stakedBalance = await fetchStakedBalance(wallet.address);
            wallet.nftCount = await fetchNFTCount(wallet.address);
        }
        if (watchedWallets.length > 0) {
            saveWallets();
            renderWallets();
        }
    }, 60000);
}
