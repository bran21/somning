import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, showToast } from './config.js';
import { getSigner, getAddress, getProvider } from './wallet.js';
import { updatePortfolio } from './portfolio.js';

// DOM elements
const sendBtn = document.getElementById('sendBtn');
const receiveBtn = document.getElementById('receiveBtn');
const walletActions = document.getElementById('walletActions');

// Send modal elements
const sendModalOverlay = document.getElementById('sendModalOverlay');
const sendModalClose = document.getElementById('sendModalClose');
const sendToInput = document.getElementById('sendTo');
const sendAmountInput = document.getElementById('sendAmount');
const sendMaxBtn = document.getElementById('sendMaxBtn');
const sendBalanceEl = document.getElementById('sendBalance');
const sendGasEl = document.getElementById('sendGas');
const sendErrorEl = document.getElementById('sendError');
const sendSubmitBtn = document.getElementById('sendSubmitBtn');
const sendConsent = document.getElementById('sendConsent');

// Receive modal elements
const receiveModalOverlay = document.getElementById('receiveModalOverlay');
const receiveModalClose = document.getElementById('receiveModalClose');
const receiveAddressEl = document.getElementById('receiveAddress');
const receiveCopyBtn = document.getElementById('receiveCopyBtn');

let currentBalance = null;

// ---- SEND ----

async function openSendModal() {
    const address = getAddress();
    if (!address) {
        showToast('Connect your wallet first', 'error');
        return;
    }

    sendToInput.value = '';
    sendAmountInput.value = '';
    sendConsent.checked = false;
    sendErrorEl.style.display = 'none';
    sendSubmitBtn.disabled = true;
    sendSubmitBtn.textContent = 'Send STT';

    // Fetch balance
    try {
        const provider = getProvider();
        const balance = await provider.getBalance(address);
        currentBalance = balance;
        const formatted = parseFloat(ethers.formatEther(balance));
        sendBalanceEl.textContent = `${formatted.toFixed(4)} STT`;
    } catch {
        sendBalanceEl.textContent = '—';
        currentBalance = null;
    }

    sendModalOverlay.classList.add('show');
}

function closeSendModal() {
    sendModalOverlay.classList.remove('show');
}

async function handleSend() {
    const to = sendToInput.value.trim();
    const amountStr = sendAmountInput.value.trim();

    // Validation
    sendErrorEl.style.display = 'none';

    if (!ethers.isAddress(to)) {
        sendErrorEl.textContent = 'Invalid recipient address';
        sendErrorEl.style.display = 'block';
        return;
    }

    if (!amountStr || isNaN(amountStr) || parseFloat(amountStr) <= 0) {
        sendErrorEl.textContent = 'Enter a valid amount';
        sendErrorEl.style.display = 'block';
        return;
    }

    const signer = getSigner();
    if (!signer) {
        sendErrorEl.textContent = 'Wallet not connected';
        sendErrorEl.style.display = 'block';
        return;
    }

    try {
        sendSubmitBtn.disabled = true;
        sendSubmitBtn.textContent = 'Sending...';

        const tx = await signer.sendTransaction({
            to: to,
            value: ethers.parseEther(amountStr),
        });

        // Immediately trace in Transaction History
        window.dispatchEvent(new CustomEvent('txSent', {
            detail: { hash: tx.hash, to, value: ethers.parseEther(amountStr), status: 'pending' }
        }));

        sendSubmitBtn.textContent = 'Confirming...';
        showToast(`Transaction sent! Hash: ${shortenAddress(tx.hash)}`, 'success');

        // Update to confirming
        window.dispatchEvent(new CustomEvent('txUpdate', {
            detail: { hash: tx.hash, status: 'confirming' }
        }));

        const receipt = await tx.wait();

        // Update to confirmed
        window.dispatchEvent(new CustomEvent('txUpdate', {
            detail: { hash: tx.hash, status: 'confirmed', blockNumber: receipt.blockNumber }
        }));

        showToast('Transaction confirmed!', 'success');
        closeSendModal();

        // Refresh portfolio
        updatePortfolio();
    } catch (err) {
        console.error('Send error:', err);

        // If tx was sent but failed
        if (err.receipt) {
            window.dispatchEvent(new CustomEvent('txUpdate', {
                detail: { hash: err.receipt.hash, status: 'failed' }
            }));
        }

        const msg = err.reason || err.message || 'Transaction failed';
        sendErrorEl.textContent = msg.length > 80 ? msg.slice(0, 80) + '...' : msg;
        sendErrorEl.style.display = 'block';
        sendSubmitBtn.disabled = false;
        sendSubmitBtn.textContent = 'Send STT';
    }
}

function handleMax() {
    if (currentBalance) {
        // Leave a small buffer for gas
        const gasBuffer = ethers.parseUnits('0.001', 'ether');
        const maxAmount = currentBalance > gasBuffer ? currentBalance - gasBuffer : 0n;
        sendAmountInput.value = ethers.formatEther(maxAmount);
    }
}

// ---- RECEIVE ----

function openReceiveModal() {
    const address = getAddress();
    if (!address) {
        showToast('Connect your wallet first', 'error');
        return;
    }

    receiveAddressEl.textContent = address;
    receiveModalOverlay.classList.add('show');
}

function closeReceiveModal() {
    receiveModalOverlay.classList.remove('show');
}

function handleCopyReceive() {
    const address = getAddress();
    if (address) {
        navigator.clipboard.writeText(address);
        showToast('Address copied!', 'success');
        receiveCopyBtn.querySelector('span').textContent = 'Copied!';
        setTimeout(() => {
            receiveCopyBtn.querySelector('span').textContent = 'Copy Address';
        }, 2000);
    }
}

// ---- SHOW/HIDE ACTIONS ----

function showActions() {
    walletActions.style.display = 'flex';
}

function hideActions() {
    walletActions.style.display = 'none';
}

// ---- INIT ----

export function initSendReceive() {
    // Action buttons
    sendBtn.addEventListener('click', openSendModal);
    receiveBtn.addEventListener('click', openReceiveModal);

    // Send modal
    sendModalClose.addEventListener('click', closeSendModal);
    sendModalOverlay.addEventListener('click', (e) => {
        if (e.target === sendModalOverlay) closeSendModal();
    });
    sendSubmitBtn.addEventListener('click', handleSend);
    sendMaxBtn.addEventListener('click', handleMax);
    sendConsent.addEventListener('change', () => {
        sendSubmitBtn.disabled = !sendConsent.checked;
    });

    // Receive modal
    receiveModalClose.addEventListener('click', closeReceiveModal);
    receiveModalOverlay.addEventListener('click', (e) => {
        if (e.target === receiveModalOverlay) closeReceiveModal();
    });
    receiveCopyBtn.addEventListener('click', handleCopyReceive);

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeSendModal();
            closeReceiveModal();
        }
    });

    // Show/hide action buttons on wallet connect/disconnect
    window.addEventListener('walletConnected', (e) => {
        if (e.detail.address) {
            showActions();
        } else {
            hideActions();
        }
    });

    // Check if already connected
    if (getAddress()) {
        showActions();
    }
}
