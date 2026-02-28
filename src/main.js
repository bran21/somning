import { ethers } from 'ethers';
import { initWallet } from './wallet.js';
import { initPortfolio } from './portfolio.js';
import { initReactivity } from './reactivity.js';
import { initTransactions } from './transactions.js';
import { initNetwork } from './network.js';
import { initSendReceive } from './send-receive.js';
import { initWalletWatcher } from './wallet-watcher.js';
import { initNFTPortfolio } from './nft-portfolio.js';
import { initMinigames } from './minigames.js';
import { initEcosystem } from './ecosystem.js';

// Make ethers available globally for config.js utility
window.__ethers = { ethers };

// Boot
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Somnia Dashboard initializing...');
    initWallet();
    initPortfolio();
    initNetwork();
    initReactivity();
    initTransactions();
    initSendReceive();
    initWalletWatcher();
    initNFTPortfolio();
    initMinigames();
    initEcosystem();

    // Sidebar toggle logic
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const openSidebar = () => { sidebar.classList.add('open'); overlay.classList.add('show'); };
    const closeSidebar = () => { sidebar.classList.remove('open'); overlay.classList.remove('show'); };
    document.getElementById('sidebarToggle').addEventListener('click', openSidebar);
    document.getElementById('sidebarClose').addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);

    // Theme Toggle Logic
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) {
        // Init theme from localStorage
        const currentTheme = localStorage.getItem('somnia_theme') || 'dark';
        if (currentTheme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
        }

        themeBtn.addEventListener('click', () => {
            const isLight = document.documentElement.getAttribute('data-theme') === 'light';
            const newTheme = isLight ? 'dark' : 'light';

            if (newTheme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
            } else {
                document.documentElement.removeAttribute('data-theme');
            }

            localStorage.setItem('somnia_theme', newTheme);
        });
    }

    console.log('✅ All modules loaded');
});
