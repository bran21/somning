import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress } from './config.js';
import { getAddress } from './wallet.js';

const txListEl = document.getElementById('txList');
const refreshBtn = document.getElementById('refreshTxBtn');

const MAX_TX = 50;
let knownTxs = [];
let nextPageParams = null;
let isLoadingMore = false;

// Blockscout V2 API base
const API_BASE = SOMNIA_CONFIG.explorerApiUrl;

// Create a tx entry from Blockscout V2 response item
function createTxFromBlockscout(item, userAddress) {
    const addr = userAddress.toLowerCase();
    const from = item.from?.hash || '';
    const to = item.to?.hash || '';
    const isSent = from.toLowerCase() === addr;
    const isReceived = to.toLowerCase() === addr;

    // Parse value — Blockscout returns value as string in wei
    let value;
    try {
        value = BigInt(item.value || '0');
    } catch {
        value = 0n;
    }

    // Parse status
    let status = 'confirmed';
    if (item.status === 'error' || item.result === 'OUT_OF_GAS') {
        status = 'failed';
    } else if (item.is_pending_update) {
        status = 'pending';
    }

    // Parse timestamp
    let timestamp = null;
    if (item.timestamp) {
        timestamp = Math.floor(new Date(item.timestamp).getTime() / 1000);
    }

    // Parse method name
    const method = item.method || item.decoded_input?.method_call?.split('(')[0] || null;

    // Parse fee
    let fee = null;
    if (item.fee?.value) {
        try {
            fee = ethers.formatEther(BigInt(item.fee.value));
        } catch { fee = null; }
    }

    return {
        hash: item.hash,
        from,
        to,
        value,
        blockNumber: item.block_number || null,
        timestamp,
        isSent,
        isReceived,
        status,
        method,
        fee,
        type: item.transaction_types || [],
    };
}

// Create a tx entry from local/RPC data
function createTxEntry(tx) {
    return {
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        blockNumber: tx.blockNumber || null,
        timestamp: tx.timestamp || null,
        isSent: tx.isSent ?? false,
        isReceived: tx.isReceived ?? false,
        status: tx.status || 'confirmed',
        method: tx.method || null,
        fee: tx.fee || null,
        type: tx.type || [],
    };
}

// Add tx to list (dedupe by hash, prepend newest)
function addTx(txData) {
    const exists = knownTxs.find(t => t.hash.toLowerCase() === txData.hash.toLowerCase());
    if (exists) {
        Object.assign(exists, txData);
    } else {
        knownTxs.unshift(txData);
    }

    if (knownTxs.length > MAX_TX) {
        knownTxs = knownTxs.slice(0, MAX_TX);
    }

    renderTransactions();
}

// Fetch full transaction history from Blockscout V2 API
export async function fetchTransactions(address, loadMore = false) {
    if (!address) {
        if (!loadMore) {
            knownTxs = [];
            txListEl.innerHTML = `
                <div class="tx-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <p>Connect wallet to view transactions</p>
                </div>
            `;
            const cardTitle = document.querySelector('#transactionsCard .card-header h2');
            if (cardTitle) {
                cardTitle.innerHTML = `Transaction History`;
            }
        }
        return;
    }

    if (!loadMore) {
        knownTxs = [];
        nextPageParams = null;
        txListEl.innerHTML = '<div class="feed-empty"><div class="feed-empty-icon">⏳</div><p>Loading transactions...</p></div>';
        refreshBtn.classList.add('spinning');

        const cardTitle = document.querySelector('#transactionsCard .card-header h2');
        if (cardTitle) {
            cardTitle.innerHTML = `Transaction History`;
        }
    }

    if (isLoadingMore) return;
    isLoadingMore = true;

    try {
        let url = `${API_BASE}/v2/addresses/${address}/transactions`;
        if (loadMore && nextPageParams) {
            const params = new URLSearchParams(nextPageParams);
            url += `?${params.toString()}`;
        }

        const resp = await fetch(url);

        if (!resp.ok) {
            throw new Error(`API returned ${resp.status}`);
        }

        const data = await resp.json();

        if (!loadMore) txListEl.innerHTML = ''; // clear loading state

        if (data.items && data.items.length > 0) {
            const mappedAddress = address.toLowerCase();
            const parsedTxs = data.items.map(item => createTxFromBlockscout(item, mappedAddress));
            parsedTxs.forEach(tx => addTx(tx));

            nextPageParams = data.next_page_params || null;
            renderTransactions();
        } else if (!loadMore && knownTxs.length === 0) {
            txListEl.innerHTML = `
                <div class="tx-empty-state">
                    <p>No transactions found for this wallet.</p>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error fetching transactions:', err);
        if (!loadMore && knownTxs.length === 0) {
            txListEl.innerHTML = `
                <div class="tx-empty-state">
                    <p style="color:var(--accent-red)">Failed to load transactions</p>
                </div>
            `;
        }
    } finally {
        isLoadingMore = false;
        refreshBtn.classList.remove('spinning');
    }
}

// Load more transactions via pagination
async function loadMoreTransactions() {
    const address = getAddress();
    // Pass current address to fetchTransactions, or null for global
    fetchTransactions(address, true);
}

// Fallback: scan recent blocks via RPC (original method)
async function fetchTransactionsFallback() {
    const address = getAddress();
    if (!address) return;

    try {
        const provider = new ethers.JsonRpcProvider(SOMNIA_CONFIG.rpcUrl);
        const currentBlock = await provider.getBlockNumber();

        const lookback = 50;
        const startBlock = Math.max(0, currentBlock - lookback);

        const blockPromises = [];
        for (let i = currentBlock; i >= startBlock && blockPromises.length < lookback; i--) {
            blockPromises.push(provider.getBlock(i, true));
        }

        const blocks = await Promise.allSettled(blockPromises);
        const addr = address.toLowerCase();

        for (const result of blocks) {
            if (result.status !== 'fulfilled' || !result.value) continue;
            const block = result.value;

            if (block.prefetchedTransactions) {
                for (const tx of block.prefetchedTransactions) {
                    const from = tx.from?.toLowerCase();
                    const to = tx.to?.toLowerCase();

                    if (from === addr || to === addr) {
                        addTx(createTxEntry({
                            hash: tx.hash,
                            from: tx.from,
                            to: tx.to,
                            value: tx.value,
                            blockNumber: block.number,
                            timestamp: block.timestamp,
                            isSent: from === addr,
                            isReceived: to === addr,
                            status: 'confirmed',
                        }));
                    }
                }
            }
        }

        renderTransactions();
    } catch (err) {
        console.error('RPC fallback error:', err);
        txListEl.innerHTML = `<div class="tx-empty"><p>Error loading transactions</p></div>`;
    }
}

// Scan a specific block for user transactions (real-time from WebSocket)
async function scanBlock(blockNumber) {
    const address = getAddress();
    if (!address) return;

    try {
        const provider = new ethers.JsonRpcProvider(SOMNIA_CONFIG.rpcUrl);
        const block = await provider.getBlock(blockNumber, true);
        if (!block || !block.prefetchedTransactions) return;

        const addr = address.toLowerCase();

        for (const tx of block.prefetchedTransactions) {
            const from = tx.from?.toLowerCase();
            const to = tx.to?.toLowerCase();

            if (from === addr || to === addr) {
                addTx(createTxEntry({
                    hash: tx.hash,
                    from: tx.from,
                    to: tx.to,
                    value: tx.value,
                    blockNumber: block.number,
                    timestamp: block.timestamp,
                    isSent: from === addr,
                    isReceived: to === addr,
                    status: 'confirmed',
                }));

                // Check if this confirms a pending tx
                const pending = knownTxs.find(
                    t => t.hash.toLowerCase() === tx.hash.toLowerCase() && t.status !== 'confirmed'
                );
                if (pending) {
                    pending.status = 'confirmed';
                    pending.blockNumber = block.number;
                    pending.timestamp = block.timestamp;
                    renderTransactions();
                }
            }
        }
    } catch (err) {
        console.error(`Error scanning block ${blockNumber}:`, err);
    }
}

// Handle outgoing tx from Send modal — immediately show as pending
function handleOwnTx(event) {
    const { hash, to, value, status } = event.detail;
    const address = getAddress();
    if (!address) return;

    addTx(createTxEntry({
        hash,
        from: address,
        to,
        value,
        blockNumber: null,
        timestamp: Math.floor(Date.now() / 1000),
        isSent: true,
        isReceived: to?.toLowerCase() === address.toLowerCase(),
        status: status || 'pending',
    }));
}

// Update a tracked tx status
function handleTxUpdate(event) {
    const { hash, status, blockNumber } = event.detail;
    const tx = knownTxs.find(t => t.hash.toLowerCase() === hash.toLowerCase());
    if (tx) {
        tx.status = status;
        if (blockNumber) tx.blockNumber = blockNumber;
        renderTransactions();
    }
}

function renderTransactions() {
    if (knownTxs.length === 0) {
        txListEl.innerHTML = `
      <div class="tx-empty">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <p>No transactions found</p>
        <p class="watcher-empty-sub">Connect wallet to view transaction history</p>
      </div>`;
        return;
    }

    txListEl.innerHTML = '';

    knownTxs.forEach(tx => {
        const isSelf = tx.isSent && tx.isReceived;
        let dirClass = 'self';
        let dirIcon = '🔄';
        let label = 'Self';

        if (!isSelf) {
            if (tx.isSent) {
                dirClass = 'sent';
                dirIcon = '↗';
                label = `To ${shortenAddress(tx.to)}`;
            } else {
                dirClass = '↙';
                dirIcon = '↙';
                label = `From ${shortenAddress(tx.from)}`;
            }
        }

        let valueStr;
        try {
            const value = parseFloat(ethers.formatEther(tx.value));
            valueStr = `${tx.isSent && !isSelf ? '-' : '+'}${value.toFixed(4)} STT`;
        } catch {
            valueStr = '0.0000 STT';
        }

        const time = tx.timestamp
            ? new Date(tx.timestamp * 1000).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Just now';

        // Status badge
        let statusBadge = '';
        if (tx.status === 'pending') {
            statusBadge = '<span class="tx-status pending">⏳ Pending</span>';
        } else if (tx.status === 'confirming') {
            statusBadge = '<span class="tx-status confirming">⏱️ Confirming</span>';
        } else if (tx.status === 'failed') {
            statusBadge = '<span class="tx-status failed">✕ Failed</span>';
        }

        // Method badge
        let methodBadge = '';
        if (tx.method && tx.method !== 'transfer') {
            methodBadge = `<span class="tx-method-badge">${tx.method}</span>`;
        }

        // Fee display
        let feeHTML = '';
        if (tx.fee) {
            const feeVal = parseFloat(tx.fee);
            if (feeVal > 0) {
                feeHTML = `<span class="tx-fee">Fee: ${feeVal.toFixed(6)} STT</span>`;
            }
        }

        const item = document.createElement('div');
        item.className = `tx-item ${tx.status === 'pending' || tx.status === 'confirming' ? 'tx-live' : ''}`;
        item.innerHTML = `
      <div class="tx-direction ${dirClass}">${dirIcon}</div>
      <div class="tx-info">
        <div class="tx-label">${label} ${statusBadge} ${methodBadge}</div>
        <div class="tx-hash"><a href="${SOMNIA_CONFIG.explorerUrl}/tx/${tx.hash}" target="_blank">${tx.hash.slice(0, 16)}...${tx.hash.slice(-8)}</a></div>
        ${feeHTML}
      </div>
      <div class="tx-value">
        <div class="tx-amount ${dirClass}">${valueStr}</div>
        <div class="tx-timestamp">${time}</div>
      </div>
    `;
        txListEl.appendChild(item);
    });

    // Add Load More button if there are more pages
    if (nextPageParams) {
        const loadMoreDiv = document.createElement('div');
        loadMoreDiv.className = 'tx-load-more';
        loadMoreDiv.innerHTML = `<button class="tx-load-more-btn">Load More Transactions</button>`;
        txListEl.appendChild(loadMoreDiv);

        loadMoreDiv.querySelector('.tx-load-more-btn').addEventListener('click', loadMoreTransactions);
    }
}

export function initTransactions() {
    refreshBtn.addEventListener('click', () => fetchTransactions(getAddress()));

    // Infinite scroll for transactions
    txListEl.addEventListener('scroll', () => {
        if (txListEl.scrollTop + txListEl.clientHeight >= txListEl.scrollHeight - 20) {
            if (nextPageParams && !isLoadingMore) {
                loadMoreTransactions();
            }
        }
    });

    // Fetch on wallet connect
    window.addEventListener('walletConnected', () => {
        knownTxs = [];
        nextPageParams = null;
        fetchTransactions(getAddress());
    });

    // Real-time: listen for new blocks from Reactivity WebSocket
    window.addEventListener('newBlock', (event) => {
        const { blockNumber } = event.detail;
        if (getAddress()) {
            scanBlock(blockNumber);
        }
    });

    // Trace own transactions from Send modal
    window.addEventListener('txSent', handleOwnTx);
    window.addEventListener('txUpdate', handleTxUpdate);

    // Automatically load global history on init if not connected
    fetchTransactions(getAddress());
}
