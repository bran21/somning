import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, showToast } from './config.js';
import { getAddress, getSigner } from './wallet.js';
import { updatePortfolio } from './portfolio.js';

// Receive Modal
const receiveNftBtn = document.getElementById('receiveNftBtn');
if (receiveNftBtn) {
    receiveNftBtn.addEventListener('click', () => {
        const address = getAddress();
        if (!address) {
            showToast('Connect your wallet first', 'error');
            return;
        }
        document.getElementById('receiveAddress').textContent = address;
        document.getElementById('receiveModalOverlay').classList.add('show');
    });
}

// NFT Send Modal Elements
const nftSendModalOverlay = document.getElementById('nftSendModalOverlay');
const nftSendModalClose = document.getElementById('nftSendModalClose');
const nftSendImg = document.getElementById('nftSendImg');
const nftSendPlaceholder = document.getElementById('nftSendPlaceholder');
const nftSendName = document.getElementById('nftSendName');
const nftSendCollection = document.getElementById('nftSendCollection');
const nftSendId = document.getElementById('nftSendId');
const nftSendTo = document.getElementById('nftSendTo');
const nftSendAmountField = document.getElementById('nftSendAmountField');
const nftSendAmount = document.getElementById('nftSendAmount');
const nftSendMaxBtn = document.getElementById('nftSendMaxBtn');
const nftSendConsent = document.getElementById('nftSendConsent');
const nftSendError = document.getElementById('nftSendError');
const nftSendSubmitBtn = document.getElementById('nftSendSubmitBtn');

let currentSendNft = null;

function closeNftSendModal() {
    nftSendModalOverlay.classList.remove('show');
    currentSendNft = null;
}

if (nftSendModalClose) {
    nftSendModalClose.addEventListener('click', closeNftSendModal);
    nftSendModalOverlay.addEventListener('click', (e) => {
        if (e.target === nftSendModalOverlay) closeNftSendModal();
    });
}

function openNftSendModal(nft) {
    currentSendNft = nft;

    // Reset Form
    nftSendTo.value = '';
    nftSendAmount.value = '1';
    nftSendConsent.checked = false;
    nftSendError.style.display = 'none';
    nftSendSubmitBtn.disabled = true;
    nftSendSubmitBtn.textContent = 'Send NFT';

    // Populate Info
    nftSendName.textContent = nft.name;
    nftSendCollection.textContent = nft.collection;
    nftSendId.textContent = `#${nft.tokenId}`;

    if (nft.image) {
        nftSendImg.src = nft.image;
        nftSendImg.style.display = 'block';
        nftSendPlaceholder.style.display = 'none';
    } else {
        nftSendImg.style.display = 'none';
        nftSendPlaceholder.style.display = 'flex';
    }

    if (nft.type === 'ERC-1155') {
        nftSendAmountField.style.display = 'flex';
        nftSendAmount.max = nft.value || 1;
    } else {
        nftSendAmountField.style.display = 'none';
    }

    nftSendModalOverlay.classList.add('show');
}

if (nftSendConsent) {
    nftSendConsent.addEventListener('change', () => {
        nftSendSubmitBtn.disabled = !nftSendConsent.checked;
    });
}

if (nftSendMaxBtn) {
    nftSendMaxBtn.addEventListener('click', () => {
        if (currentSendNft && currentSendNft.type === 'ERC-1155') {
            nftSendAmount.value = currentSendNft.value || 1;
        }
    });
}

if (nftSendSubmitBtn) {
    nftSendSubmitBtn.addEventListener('click', async () => {
        if (!currentSendNft) return;

        const to = nftSendTo.value.trim();
        const amountStr = nftSendAmount.value.trim();

        nftSendError.style.display = 'none';

        if (!ethers.isAddress(to)) {
            nftSendError.textContent = 'Invalid recipient address';
            nftSendError.style.display = 'block';
            return;
        }

        let amount = 1;
        if (currentSendNft.type === 'ERC-1155') {
            amount = parseInt(amountStr);
            if (isNaN(amount) || amount <= 0) {
                nftSendError.textContent = 'Enter a valid amount';
                nftSendError.style.display = 'block';
                return;
            }
        }

        const signer = getSigner();
        if (!signer) {
            nftSendError.textContent = 'Wallet not connected';
            nftSendError.style.display = 'block';
            return;
        }

        try {
            nftSendSubmitBtn.disabled = true;
            nftSendSubmitBtn.textContent = 'Sending...';

            let tx;
            if (currentSendNft.type === 'ERC-1155') {
                const abi = ['function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes data)'];
                const contract = new ethers.Contract(currentSendNft.contractAddress, abi, signer);
                const fromAddress = await signer.getAddress();
                tx = await contract.safeTransferFrom(fromAddress, to, currentSendNft.tokenId, amount, "0x");
            } else {
                // ERC-721
                // Try safeTransferFrom first, fallback to transferFrom if it fails to estimate gas
                try {
                    const abi = ['function safeTransferFrom(address from, address to, uint256 tokenId)'];
                    const contract = new ethers.Contract(currentSendNft.contractAddress, abi, signer);
                    const fromAddress = await signer.getAddress();
                    // Estimate gas to see if safeTransferFrom works (recipient might not implement IERC721Receiver)
                    await contract.safeTransferFrom.estimateGas(fromAddress, to, currentSendNft.tokenId);
                    tx = await contract.safeTransferFrom(fromAddress, to, currentSendNft.tokenId);
                } catch {
                    const abi = ['function transferFrom(address from, address to, uint256 tokenId)'];
                    const contract = new ethers.Contract(currentSendNft.contractAddress, abi, signer);
                    const fromAddress = await signer.getAddress();
                    tx = await contract.transferFrom(fromAddress, to, currentSendNft.tokenId);
                }
            }

            // Immediately trace in Transaction History
            window.dispatchEvent(new CustomEvent('txSent', {
                detail: { hash: tx.hash, to, value: 0n, status: 'pending' }
            }));

            nftSendSubmitBtn.textContent = 'Confirming...';
            showToast(`NFT Transfer sent! Hash: ${shortenAddress(tx.hash)}`, 'success');

            window.dispatchEvent(new CustomEvent('txUpdate', {
                detail: { hash: tx.hash, status: 'confirming' }
            }));

            const receipt = await tx.wait();

            window.dispatchEvent(new CustomEvent('txUpdate', {
                detail: { hash: tx.hash, status: 'confirmed', blockNumber: receipt.blockNumber }
            }));

            showToast('NFT Transferred successfully!', 'success');
            closeNftSendModal();

            // Refresh portfolio
            const address = getAddress();
            if (address) {
                fetchNFTsForAddress(address, nftGridEl, refreshNftBtn);
                updatePortfolio(); // Might be needed if we track NFT value in main portfolio
            }

        } catch (err) {
            console.error('NFT Send error:', err);

            if (err.receipt) {
                window.dispatchEvent(new CustomEvent('txUpdate', {
                    detail: { hash: err.receipt.hash, status: 'failed' }
                }));
            }

            const msg = err.reason || err.message || 'Transaction failed';
            nftSendError.textContent = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
            nftSendError.style.display = 'block';
            nftSendSubmitBtn.disabled = false;
            nftSendSubmitBtn.textContent = 'Send NFT';
        }
    });
}
const nftGridEl = document.getElementById('nftGrid');
const refreshNftBtn = document.getElementById('refreshNftBtn');

// Blockscout V2 API base from config
const API_BASE = SOMNIA_CONFIG.explorerApiUrl;

// Resolve IPFS URLs to HTTP gateway
function resolveIPFS(url) {
    if (!url) return null;
    if (url.startsWith('ipfs://')) {
        return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
    }
    return url;
}

// Find best image from Blockscout NFT instance data
function resolveNFTImage(instance) {
    // Priority: image_url > animation_url > metadata.image > metadata.image_url > token icon
    const candidates = [
        instance?.image_url,
        instance?.animation_url,
        instance?.metadata?.image,
        instance?.metadata?.image_url,
        instance?.token?.icon_url,
    ];
    for (const url of candidates) {
        if (url && typeof url === 'string' && url.length > 0) {
            return resolveIPFS(url);
        }
    }
    return null;
}

/**
 * Fetches NFTs for a specific address using Blockscout V2 /nft endpoint
 * and renders them into the target element.
 */
export async function fetchNFTsForAddress(address, targetEl, spinnerBtn = null) {
    if (!address) {
        targetEl.innerHTML = `
            <div class="nft-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <p>No address provided</p>
            </div>`;
        return;
    }

    targetEl.innerHTML = `
        <div class="nft-loading">
            <div class="nft-spinner"></div>
            <p>Scanning for NFTs...</p>
        </div>`;

    if (spinnerBtn) spinnerBtn.classList.add('spinning');

    try {
        let nfts = [];

        // Primary: Blockscout V2 /nft endpoint (returns individual NFT instances)
        try {
            let url = `${API_BASE}/v2/addresses/${address}/nft?type=ERC-721%2CERC-1155`;
            let hasMore = true;

            while (hasMore && nfts.length < 100) {
                const resp = await fetch(url).catch(() => null);
                if (!resp || !resp.ok) break;

                const data = await resp.json();

                if (data.items && Array.isArray(data.items)) {
                    for (const item of data.items) {
                        nfts.push({
                            tokenId: item.id || '?',
                            name: item.metadata?.name || item.token?.name
                                ? `${item.token?.name || 'NFT'} #${item.id || '?'}`
                                : `NFT #${item.id || '?'}`,
                            collection: item.token?.name || 'Unknown',
                            symbol: item.token?.symbol || 'NFT',
                            image: resolveNFTImage(item),
                            contractAddress: item.token?.address || '',
                            type: item.token?.type || 'ERC-721',
                            value: item.value || null,
                            ownerAddress: address
                        });
                    }
                }

                // Pagination
                if (data.next_page_params) {
                    const params = new URLSearchParams(data.next_page_params);
                    url = `${API_BASE}/v2/addresses/${address}/nft?type=ERC-721%2CERC-1155&${params.toString()}`;
                } else {
                    hasMore = false;
                }
            }
        } catch (e) {
            console.warn('Blockscout V2 /nft endpoint failed:', e);
        }

        // Fallback 1: /tokens endpoint
        if (nfts.length === 0) {
            try {
                const tokensUrl = `${API_BASE}/v2/addresses/${address}/tokens`;
                const resp = await fetch(tokensUrl).catch(() => null);

                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data.items && Array.isArray(data.items)) {
                        const filtered = data.items.filter(item =>
                            item.token?.type === 'ERC-721' || item.token?.type === 'ERC-1155'
                        );

                        nfts = filtered.map(item => ({
                            tokenId: item.id || '?',
                            name: item.token?.name || item.metadata?.name || `${item.token?.type || 'NFT'} #${item.id || '?'}`,
                            collection: item.token?.name || 'Unknown',
                            symbol: item.token?.symbol || 'NFT',
                            image: resolveNFTImage(item),
                            contractAddress: item.token?.address || '',
                            type: item.token?.type || 'ERC-721',
                            value: item.value || null,
                            ownerAddress: address
                        }));
                    }
                }
            } catch (e) {
                console.warn('Blockscout V2 tokens API failed:', e);
            }
        }

        // Fallback 2: Legacy v1 API
        if (nfts.length === 0) {
            try {
                const legacyUrl = `${API_BASE}?module=account&action=tokennfttx&address=${address}&sort=desc`;
                const resp = await fetch(legacyUrl).catch(() => null);
                if (resp && resp.ok) {
                    const data = await resp.json();
                    if (data.result && Array.isArray(data.result)) {
                        const owned = new Map();
                        data.result.forEach(tx => {
                            const key = `${tx.contractAddress}-${tx.tokenID}`;
                            if (tx.to.toLowerCase() === address.toLowerCase()) owned.set(key, tx);
                            else if (tx.from.toLowerCase() === address.toLowerCase()) owned.delete(key);
                        });
                        nfts = Array.from(owned.values()).map(tx => ({
                            tokenId: tx.tokenID,
                            name: `${tx.tokenName || 'NFT'} #${tx.tokenID}`,
                            collection: tx.tokenName || 'Unknown',
                            symbol: tx.tokenSymbol || 'NFT',
                            image: null,
                            contractAddress: tx.contractAddress,
                            type: 'ERC-721',
                            ownerAddress: address
                        }));
                    }
                }
            } catch (e) {
                console.warn('Legacy NFT API failed:', e);
            }
        }

        // Only fetch on-chain tokenURI for NFTs without images (limited to 8 to avoid rate limits)
        if (nfts.some(n => !n.image && n.contractAddress)) {
            const provider = new ethers.JsonRpcProvider(SOMNIA_CONFIG.rpcUrl);
            const ERC721_ABI = [
                'function tokenURI(uint256 tokenId) view returns (string)',
            ];

            const noImageNfts = nfts.filter(n => !n.image && n.contractAddress).slice(0, 8);
            await Promise.allSettled(noImageNfts.map(async (nft) => {
                try {
                    const contract = new ethers.Contract(nft.contractAddress, ERC721_ABI, provider);
                    const tokenURI = await contract.tokenURI(nft.tokenId).catch(() => null);
                    if (tokenURI) {
                        let metaUrl = resolveIPFS(tokenURI);
                        if (metaUrl && metaUrl.startsWith('http')) {
                            const metaResp = await fetch(metaUrl).catch(() => null);
                            if (metaResp && metaResp.ok) {
                                const meta = await metaResp.json();
                                nft.name = meta.name || nft.name;
                                nft.image = resolveIPFS(meta.image || meta.image_url || null);
                            }
                        }
                    }
                } catch { /* skip */ }
            }));
        }

        renderNFTs(nfts, targetEl);
    } catch (err) {
        console.error('NFT fetch error:', err);
        targetEl.innerHTML = `
            <div class="nft-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <p>Could not load NFTs</p>
                <p class="watcher-empty-sub">Connection lost or API unavailable</p>
            </div>`;
    } finally {
        if (spinnerBtn) spinnerBtn.classList.remove('spinning');
    }
}

function renderNFTs(nfts, targetEl) {
    if (nfts.length === 0) {
        targetEl.innerHTML = `
            <div class="nft-empty">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                <p>No NFTs found</p>
            </div>`;
        return;
    }

    targetEl.innerHTML = '';

    nfts.forEach(nft => {
        const card = document.createElement('div');
        card.className = 'nft-card';

        const imageHTML = nft.image
            ? `<img src="${nft.image}" alt="${nft.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="nft-placeholder" style="display:none;">🖼️</div>`
            : `<div class="nft-placeholder">🖼️</div>`;

        const typeBadge = `<span class="nft-type-badge ${nft.type === 'ERC-1155' ? 'badge-1155' : 'badge-721'}">${nft.type}</span>`;
        const quantityBadge = (nft.type === 'ERC-1155' && nft.value && nft.value > 1)
            ? `<span class="nft-qty-badge">x${nft.value}</span>`
            : '';

        const isOwner = getAddress()?.toLowerCase() === nft.ownerAddress?.toLowerCase();

        const sendBtn = isOwner ? `
            <button class="nft-send-card-btn" data-id="${nft.tokenId}" data-contract="${nft.contractAddress}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="19" x2="12" y2="5"></line>
                    <polyline points="5 12 12 5 19 12"></polyline>
                </svg>
                Send
            </button>
        ` : '';

        card.innerHTML = `
            <div class="nft-image">
                ${imageHTML}
                ${typeBadge}
                ${quantityBadge}
            </div>
            <div class="nft-info">
                <span class="nft-name">${nft.name}</span>
                <span class="nft-collection">${nft.collection}</span>
                <div class="nft-meta">
                    <span class="nft-id">#${nft.tokenId}</span>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        ${sendBtn}
                        ${nft.contractAddress ? `<a href="${SOMNIA_CONFIG.explorerUrl}/token/${nft.contractAddress}" target="_blank" class="nft-link" title="View contract">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                        </a>` : ''}
                    </div>
                </div>
            </div>
        `;

        if (isOwner) {
            const btn = card.querySelector('.nft-send-card-btn');
            if (btn) {
                btn.addEventListener('click', () => {
                    openNftSendModal(nft);
                });
            }
        }

        targetEl.appendChild(card);
    });
}

export function setupNftSearch(inputId, gridId) {
    const input = document.getElementById(inputId);
    const grid = document.getElementById(gridId);
    if (!input || !grid) return;

    input.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const cards = grid.querySelectorAll('.nft-card');

        cards.forEach(card => {
            const nameEl = card.querySelector('.nft-name');
            const collectionEl = card.querySelector('.nft-collection');
            const idEl = card.querySelector('.nft-id');
            const text = `${nameEl?.textContent || ''} ${collectionEl?.textContent || ''} ${idEl?.textContent || ''}`.toLowerCase();

            if (term === '' || text.includes(term)) {
                card.style.display = '';
            } else {
                card.style.display = 'none';
            }
        });
    });
}

export function initNFTPortfolio() {
    setupNftSearch('mainNftSearch', 'nftGrid');

    refreshNftBtn.addEventListener('click', () => {
        const address = getAddress();
        if (address) {
            fetchNFTsForAddress(address, nftGridEl, refreshNftBtn);
        } else {
            showToast('Connect your wallet first', 'error');
        }
    });

    window.addEventListener('walletConnected', (e) => {
        const address = e.detail?.address || getAddress();
        if (address) {
            fetchNFTsForAddress(address, nftGridEl, refreshNftBtn);
        }
    });

    // Check if already connected
    const address = getAddress();
    if (address) {
        fetchNFTsForAddress(address, nftGridEl, refreshNftBtn);
    }
}
