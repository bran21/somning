import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, formatTime, showToast } from './config.js';

let ws = null;
let isPaused = false;
let activeFilter = 'all';
let eventCount = 0;
let eventsThisSecond = 0;
let eventsPerSec = 0;
let reconnectAttempts = 0;
const MAX_EVENTS = 200;

// DOM
const feedEl = document.getElementById('reactivityFeed');
const wsStatusDot = document.querySelector('#wsStatus .ws-dot');
const wsStatusText = document.getElementById('wsStatusText');
const eventCountEl = document.getElementById('eventCount');
const eventsPerSecEl = document.getElementById('eventsPerSec');
const pauseBtn = document.getElementById('pauseBtn');
const clearBtn = document.getElementById('clearBtn');
const filterBtns = document.querySelectorAll('.filter-btn');

// Track events per second
setInterval(() => {
    eventsPerSec = eventsThisSecond;
    eventsThisSecond = 0;
    eventsPerSecEl.textContent = `${eventsPerSec} evt/s`;
}, 1000);

// Set WS status UI
function setWsStatus(status) {
    wsStatusDot.className = 'ws-dot';
    switch (status) {
        case 'connected':
            wsStatusDot.classList.add('ws-connected');
            wsStatusText.textContent = 'Connected';
            wsStatusText.style.color = '#10b981';
            break;
        case 'reconnecting':
            wsStatusDot.classList.add('ws-reconnecting');
            wsStatusText.textContent = 'Reconnecting...';
            wsStatusText.style.color = '#f59e0b';
            break;
        case 'disconnected':
            wsStatusDot.classList.add('ws-disconnected');
            wsStatusText.textContent = 'Disconnected';
            wsStatusText.style.color = '#ef4444';
            break;
    }
}

// Create event item element
function createEventEl(type, title, detail, time) {
    const item = document.createElement('div');
    item.className = 'event-item';
    item.dataset.type = type;

    const icons = { block: '🧱', tx: '💸', log: '📋', action_nft: '🖼️', action_token: '🪙', action_swap: '💱', action_stake: '🥩' };

    item.innerHTML = `
    <div class="event-icon ${type}">${icons[type] || '⚡'}</div>
    <div class="event-body">
      <div class="event-title">${title}</div>
      <div class="event-detail">${detail}</div>
    </div>
    <div class="event-time">${time}</div>
  `;

    // Apply filter
    if (activeFilter !== 'all' && activeFilter !== type) {
        item.style.display = 'none';
    }

    return item;
}

// Add event to feed
function addEvent(type, title, detail) {
    if (isPaused) return;

    const time = formatTime(new Date());
    const el = createEventEl(type, title, detail, time);

    // Remove empty state
    const emptyEl = feedEl.querySelector('.feed-empty');
    if (emptyEl) emptyEl.remove();

    // Prepend (newest first)
    feedEl.prepend(el);

    // Limit events: prefer removing oldest blocks first to preserve tx history
    while (feedEl.children.length > MAX_EVENTS) {
        // Search backwards to find the oldest block
        let removed = false;
        for (let i = feedEl.children.length - 1; i >= 0; i--) {
            if (feedEl.children[i].dataset.type === 'block') {
                feedEl.children[i].remove();
                removed = true;
                break;
            }
        }
        // If no blocks found or all are important, remove last child
        if (!removed) {
            feedEl.lastChild.remove();
        }
    }

    eventCount++;
    eventsThisSecond++;
    eventCountEl.textContent = `${eventCount} events`;
}

// Connect WebSocket to Somnia
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    setWsStatus('reconnecting');

    try {
        ws = new WebSocket(SOMNIA_CONFIG.wsUrl);
    } catch (err) {
        console.error('WebSocket creation error:', err);
        setWsStatus('disconnected');
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        console.log('Somnia Reactivity WebSocket connected');
        setWsStatus('connected');
        reconnectAttempts = 0;

        // Subscribe to newHeads (new blocks)
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_subscribe',
            params: ['newHeads'],
        }));

        // Subscribe to pending transactions
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_subscribe',
            params: ['newPendingTransactions'],
        }));

        // Subscribe to logs (all contract events)
        ws.send(JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            method: 'eth_subscribe',
            params: ['logs', {}],
        }));
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);

            // Subscription confirmations
            if (data.id && data.result) {
                console.log(`Subscription confirmed: ${data.result}`);
                return;
            }

            // Subscription events
            if (data.method === 'eth_subscription' && data.params) {
                const result = data.params.result;

                // Detect event type from result structure
                if (result.parentHash && result.number) {
                    // newHeads — new block
                    const blockNum = parseInt(result.number, 16);
                    const txCount = result.transactions ? result.transactions.length : '?';
                    const gasUsed = result.gasUsed ? parseInt(result.gasUsed, 16).toLocaleString() : '—';
                    addEvent('block', `Block #${blockNum.toLocaleString()}`, `Gas used: ${gasUsed} | Hash: ${result.hash?.slice(0, 18)}...`);

                    // We can also quickly scan block transactions for basic STT sends
                    if (result.transactions && Array.isArray(result.transactions)) {
                        for (const tx of result.transactions) {
                            if (typeof tx === 'object' && tx.value && tx.value !== '0x0' && tx.input === '0x') {
                                // Value>0 and no data -> native STT transfer
                                const valStr = parseFloat(ethers.formatEther(tx.value)).toFixed(4);
                                addEvent('action_token', `STT Transfer`, `${valStr} STT ➔ ${shortenAddress(tx.to)}`);
                            }
                        }
                    }

                    // Dispatch block event for network stats
                    window.dispatchEvent(new CustomEvent('newBlock', { detail: { blockNumber: blockNum, block: result } }));
                } else if (result.address && result.topics) {
                    // logs — contract event
                    const addr = shortenAddress(result.address);
                    const topic0 = result.topics[0];

                    let actionType = 'log';
                    let actionTitle = `Event from ${addr}`;
                    let actionDetail = `Topic: ${topic0 ? topic0.slice(0, 18) + '...' : '—'} | Block: ${parseInt(result.blockNumber, 16)}`;

                    // Known topics
                    const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
                    const SWAP_V2_TOPIC = '0xd78ad95fa46c994b6551d0da85fc275fe613ce37657fb8d5e3d130840159d822';
                    const SWAP_V3_TOPIC = '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67';
                    const STAKE_DEPOSIT_TOPIC = '0x90890809c654f11d6e72a28fa601497b4af1c394088cce3bd88c5efba7925e00'; // typical deposit
                    const STAKE_DEPOSIT_TOPIC_2 = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c'; // another deposit

                    if (topic0 === TRANSFER_TOPIC) {
                        if (result.topics.length === 4) { // ERC721
                            actionType = 'action_nft';
                            const from = shortenAddress('0x' + result.topics[1].slice(26));
                            const to = shortenAddress('0x' + result.topics[2].slice(26));
                            let tokenId = '—';
                            try { tokenId = parseInt(result.topics[3], 16).toString(); } catch (e) { }
                            actionTitle = `NFT Transfer`;
                            actionDetail = `${from} ➔ ${to} | ID: ${tokenId}`;
                        } else if (result.topics.length === 3) { // ERC20
                            actionType = 'action_token';
                            const from = shortenAddress('0x' + result.topics[1].slice(26));
                            const to = shortenAddress('0x' + result.topics[2].slice(26));
                            actionTitle = `Token Transfer`;
                            actionDetail = `${from} ➔ ${to} | Contract: ${addr}`;
                        }
                    } else if (topic0 === SWAP_V2_TOPIC || topic0 === SWAP_V3_TOPIC) {
                        actionType = 'action_swap';
                        actionTitle = `Token Swap`;
                        actionDetail = `DEX Swap via ${addr}`;
                    } else if (topic0 === STAKE_DEPOSIT_TOPIC || topic0 === STAKE_DEPOSIT_TOPIC_2) {
                        actionType = 'action_stake';
                        actionTitle = `Staking Action`;
                        actionDetail = `Contract: ${addr}`;
                    }

                    addEvent(actionType, actionTitle, actionDetail);
                } else if (typeof result === 'string' && result.startsWith('0x')) {
                    // newPendingTransactions — tx hash
                    addEvent('tx', 'Pending Transaction', `Hash: ${result.slice(0, 22)}...${result.slice(-6)}`);
                }
            }
        } catch (err) {
            console.error('WS message parse error:', err);
        }
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };

    ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsStatus('disconnected');
        scheduleReconnect();
    };
}

function scheduleReconnect() {
    reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
    setTimeout(() => {
        setWsStatus('reconnecting');
        connectWebSocket();
    }, delay);
}

// Filter handling
function applyFilter(filter) {
    activeFilter = filter;
    filterBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    feedEl.querySelectorAll('.event-item').forEach(item => {
        if (filter === 'all' || item.dataset.type === filter || (filter === 'action_send' && (item.dataset.type === 'action_token' || item.dataset.type === 'action_nft'))) {
            item.style.display = '';
        } else {
            item.style.display = 'none';
        }
    });
}

// Mapping of known 4-byte signatures
const KNOWN_METHODS = {
    // Transfers
    '0xa9059cbb': { type: 'action_token', title: 'Token Transfer' },
    '0x23b872dd': { type: 'action_token', title: 'Token Transfer' },
    '0x42842e0e': { type: 'action_nft', title: 'NFT Transfer' },
    '0xb88d4fde': { type: 'action_nft', title: 'NFT Transfer' },
    // Swaps
    '0x38ed1739': { type: 'action_swap', title: 'Token Swap' },
    '0x18cbafe5': { type: 'action_swap', title: 'Token Swap' },
    '0x7ff36ab5': { type: 'action_swap', title: 'Token Swap' },
    '0xfb3bdb41': { type: 'action_swap', title: 'Token Swap' },
    '0x8803dbee': { type: 'action_swap', title: 'Token Swap' },
    '0x5c11d795': { type: 'action_swap', title: 'Token Swap' },
    '0x128acb08': { type: 'action_swap', title: 'Token Swap' },
    '0x414bf389': { type: 'action_swap', title: 'Token Swap' },
    // Stakes
    '0xd0e30db0': { type: 'action_stake', title: 'Staking Deposit' },
    '0xb6b55f25': { type: 'action_stake', title: 'Staking Deposit' },
    '0xa694fc3a': { type: 'action_stake', title: 'Stake' },
    '0xe1fffcc4': { type: 'action_stake', title: 'Deposit' }
};

// Fetch recent history to populate feed
async function fetchRecentActivity() {
    try {
        const res = await fetch(`${SOMNIA_CONFIG.explorerApiUrl}/v2/transactions`);
        if (!res.ok) {
            console.warn("fetchRecentActivity response not ok:", res.status);
            return;
        }
        const data = await res.json();

        if (data && data.items) {
            // Process backwards so newest is at the top
            const items = data.items.slice(0, 30).reverse();
            for (const tx of items) {
                // If value > 0 and no input, it's a native STT transfer
                if (tx.value && tx.value !== '0' && (!tx.raw_input || tx.raw_input === '0x')) {
                    const valStr = parseFloat(ethers.formatEther(tx.value)).toFixed(4);
                    addEvent('action_token', `STT Transfer`, `${valStr} STT ➔ ${shortenAddress(tx.to?.hash)}`);
                } else if (tx.to && tx.to.is_contract) {
                    let type = 'tx';
                    let method = tx.method || 'Contract Call';
                    let title = `Tx: ${method}`;

                    const m = method.toLowerCase();
                    if (KNOWN_METHODS[m]) {
                        type = KNOWN_METHODS[m].type;
                        title = KNOWN_METHODS[m].title;
                    } else if (m.includes('swap')) {
                        type = 'action_swap'; title = 'Token Swap';
                    } else if (m.includes('stake') || m.includes('deposit')) {
                        type = 'action_stake'; title = 'Staking Action';
                    } else if (m.includes('transfer')) {
                        type = 'action_token'; title = 'Token Transfer';
                    }

                    addEvent(type, title, `Hash: ${tx.hash?.slice(0, 18)}...`);
                } else {
                    addEvent('tx', `Transaction`, `Hash: ${tx.hash?.slice(0, 18)}...`);
                }
            }
        }
    } catch (err) {
        console.error("Failed to fetch initial reactivity history:", err);
    }
}

export function initReactivity() {
    // Filter buttons
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
    });

    // Pause button
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.classList.toggle('active', isPaused);
        pauseBtn.title = isPaused ? 'Resume feed' : 'Pause feed';
        if (isPaused) {
            pauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>`;
        } else {
            pauseBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>`;
        }
    });

    // Clear button
    clearBtn.addEventListener('click', () => {
        feedEl.innerHTML = '';
        eventCount = 0;
        eventCountEl.textContent = '0 events';
    });

    // Pause on hover
    feedEl.addEventListener('mouseenter', () => {
        if (!isPaused) {
            feedEl.style.overflowY = 'auto';
        }
    });

    // Connect to Somnia WebSocket
    connectWebSocket();

    // Fetch initial historical events so it's not empty
    fetchRecentActivity();
}
