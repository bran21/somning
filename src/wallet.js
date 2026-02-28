import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, showToast } from './config.js';

let provider = null;
let signer = null;
let connectedAddress = null;

const connectBtn = document.getElementById('connectBtn');
const walletAddressEl = document.getElementById('walletAddress');
const copyAddressBtn = document.getElementById('copyAddressBtn');
const explorerLink = document.getElementById('explorerLink');

// Public getters
export function getProvider() { return provider; }
export function getSigner() { return signer; }
export function getAddress() { return connectedAddress; }

// Detect MetaMask
function getMetaMask() {
    if (typeof window.ethereum !== 'undefined') {
        return window.ethereum;
    }
    return null;
}

// Switch to Somnia Testnet
async function switchToSomnia(ethereum) {
    const chainIdHex = SOMNIA_CONFIG.chainIdHex;
    try {
        await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    } catch (switchErr) {
        // 4902 = chain not added
        if (switchErr.code === 4902) {
            await ethereum.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: chainIdHex,
                    chainName: SOMNIA_CONFIG.name,
                    nativeCurrency: SOMNIA_CONFIG.currency,
                    rpcUrls: [SOMNIA_CONFIG.rpcUrl],
                    blockExplorerUrls: [SOMNIA_CONFIG.explorerUrl],
                }],
            });
        } else {
            throw switchErr;
        }
    }
}

// Connect wallet
export async function connectWallet() {
    const ethereum = getMetaMask();
    if (!ethereum) {
        showToast('MetaMask not detected. Please install MetaMask.', 'error');
        return null;
    }

    try {
        await switchToSomnia(ethereum);
        const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
        if (!accounts || accounts.length === 0) {
            showToast('No accounts found.', 'error');
            return null;
        }

        connectedAddress = accounts[0];
        provider = new ethers.BrowserProvider(ethereum);
        signer = await provider.getSigner();

        updateUI(connectedAddress);
        showToast(`Connected: ${shortenAddress(connectedAddress)}`, 'success');

        // Listen for account changes
        ethereum.on('accountsChanged', handleAccountsChanged);
        ethereum.on('chainChanged', () => window.location.reload());

        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address: connectedAddress } }));

        return connectedAddress;
    } catch (err) {
        console.error('Wallet connect error:', err);
        showToast('Failed to connect wallet.', 'error');
        return null;
    }
}

function handleAccountsChanged(accounts) {
    if (accounts.length === 0) {
        disconnectUI();
        showToast('Wallet disconnected.', 'info');
    } else {
        connectedAddress = accounts[0];
        updateUI(connectedAddress);
        window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address: connectedAddress } }));
        showToast(`Switched to ${shortenAddress(connectedAddress)}`, 'info');
    }
}

function updateUI(address) {
    connectBtn.innerHTML = `
    <span style="width:7px;height:7px;border-radius:50%;background:#10b981;display:inline-block;"></span>
    <span>${shortenAddress(address)}</span>
  `;
    connectBtn.classList.add('connected');
    walletAddressEl.textContent = shortenAddress(address);
    copyAddressBtn.style.display = 'flex';
    explorerLink.href = `${SOMNIA_CONFIG.explorerUrl}/address/${address}`;
    explorerLink.style.display = 'inline-flex';
}

export function disconnectWallet() {
    disconnectUI();
    showToast('Wallet disconnected.', 'info');
    window.dispatchEvent(new CustomEvent('walletConnected', { detail: { address: null } }));
}

function disconnectUI() {
    connectedAddress = null;
    provider = null;
    signer = null;
    connectBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12c0 1.1.9 2 2 2h14v-4"/><circle cx="18" cy="16" r="2"/></svg>
    <span>Connect Wallet</span>
  `;
    connectBtn.classList.remove('connected');
    walletAddressEl.textContent = 'Not connected';
    copyAddressBtn.style.display = 'none';
    explorerLink.style.display = 'none';
}

// Init wallet module
export function initWallet() {
    connectBtn.addEventListener('click', () => {
        if (connectedAddress) {
            disconnectWallet();
        } else {
            connectWallet();
        }
    });

    copyAddressBtn.addEventListener('click', () => {
        if (connectedAddress) {
            navigator.clipboard.writeText(connectedAddress);
            showToast('Address copied!', 'success');
        }
    });

    // Auto-connect if previously authorized
    const ethereum = getMetaMask();
    if (ethereum) {
        ethereum.request({ method: 'eth_accounts' }).then(accounts => {
            if (accounts.length > 0) {
                connectWallet();
            }
        });
    }
}
