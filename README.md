A Somnia Dashboard for you

A multifunctional Web3 dashboard built for the Somnia Network (Testnet). This application provides a comprehensive suite of tools for exploring the Somnia ecosystem, tracking portfolios, and monitoring real-time blockchain reactivity.

## ✨ Features

- Wallet Connectivity: Seamless integration with MetaMask to connect to the Somnia Testnet (Chain ID: 50312).
- Portfolio Overview: View real-time STT balances.
- Transaction History: Full, paginated transaction history directly from the Somnia Blockscout Explorer API. Shows rich details including method names, statuses, and gas fees.
- NFT Portfolio & Search: Beautiful grid display of all ERC-721 and ERC-1155 tokens owned by the wallet, complete with on-chain metadata resolution. Includes a blazing-fast, client-side search filter.
- Wallet Tracker (Watcher): Keep an eye on the balances and NFT counts of other Somnia addresses. Click on any tracked wallet to view its full transaction and NFT history in a detailed modal.
- Reactivity Feed: A live, WebSocket-powered feed streaming new blocks, transactions, and logs as they happen on the network.
- Send & Receive Interface: Built-in modals to easily transfer STT tokens with estimated gas calculations, and a copyable receive address QR/UI.
- Dynamic Theming: Premium, toggleable Dark and Light themes with localized storage persistence and subtle CSS noise textures for aesthetics. Includes fun CSS animations like a "SOMI TO THE MOON" terminal typing effect.

## 🛠️ Technology Stack

- Frontend: HTML5, CSS3 (Custom Properties & Animations), Vanilla JavaScript (ES6 Modules)
- Web3 Integrations: Ethers.js (v6) for RPC communication, wallet connections, and contract interactions.
- Data APIs: Integration with the Somnia Shannon Explorer (Blockscout) API for rich, indexed blockchain data.
- Build Tool: Vite for blazing-fast local development and optimized production bundling.

## 🚀 Getting Started

### Prerequisites

- Node.js installed on your machine.
- MetaMask browser extension installed and configured.

### Adding Somnia Testnet to MetaMask

Ensure your wallet is connected to the Somnia Testnet before interacting with the dashboard:
- Network Name: Somnia Testnet
- RPC URL: https://dream-rpc.somnia.network
- Chain ID: 50312
- Currency Symbol: STT
- Block Explorer URL: https://shannon-explorer.somnia.network

### Installation

1. Clone the repository and navigate to the project directory:
   ```bash
   cd your-project-folder
   ```

2. Install the dependencies for the project :
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```
   Notes : install node.js first for installing npm

4. Open your browser and navigate to http://localhost:5173.

## 🔒 Security Notice

This dashboard is currently under active development and in a testing phase. 
Kindly test and interact with the application using a testnet wallet only. Do not connect your mainnet wallet or expose private keys containing real funds.

## 🤝 Credits

- Built by Jbran.somi (https://x.com/Ridho625)
- Powered by Somnia Network (https://somnia.network/)

note : if you want to play tictactoe , dont logout from the game room while waiting another fren to join . because its till buggy.
but the game works anyway :D

pls dont copy my work but you can use it as an inspiration .... hehe :p

