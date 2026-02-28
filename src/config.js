// Somnia Testnet Configuration
export const SOMNIA_CONFIG = {
    name: 'Somnia Testnet',
    chainId: 50312,
    chainIdHex: '0xC488',
    rpcUrl: 'https://dream-rpc.somnia.network/',
    wsUrl: 'wss://dream-rpc.somnia.network/ws',
    explorerUrl: 'https://shannon-explorer.somnia.network',
    explorerApiUrl: 'https://shannon-explorer.somnia.network/api',
    currency: {
        name: 'STT',
        symbol: 'STT',
        decimals: 18,
    },
};

// Utility: shorten address
export function shortenAddress(addr) {
    if (!addr) return '';
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// Utility: format timestamp
export function formatTime(date) {
    return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// Utility: show toast notification
export function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('toast-exit');
        toast.addEventListener('animationend', () => toast.remove());
    }, 3500);
}

// Utility: format wei to STT
export function formatSTT(weiValue) {
    try {
        const { ethers } = window.__ethers || {};
        if (ethers) {
            return parseFloat(ethers.formatEther(weiValue)).toFixed(4);
        }
        // Fallback
        return (Number(weiValue) / 1e18).toFixed(4);
    } catch {
        return '0.0000';
    }
}
