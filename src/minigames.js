import { ethers } from 'ethers';
import { SOMNIA_CONFIG, shortenAddress, showToast } from './config.js';
import { getAddress, getSigner, getProvider } from './wallet.js';

// ** REPLACE THIS WITH DEPLOYED CONTRACT ADDRESS LATER **
const TICTACTOE_ADDRESS = "0xB796454a5Db8054c89BaCdC569ea63DE478A8bd8";

const TICTACTOE_ABI = [
    "function createRoom() external payable returns (uint256)",
    "function joinRoom(uint256 gameId) external payable",
    "function makeMove(uint256 gameId, uint8 position) external",
    "function getGamesCount() external view returns (uint256)",
    "function getBoard(uint256 gameId) external view returns (uint8[9] memory)",
    "function games(uint256) external view returns (address playerX, address playerO, uint256 wager, uint8 currentTurn, uint8 state, address winner)",
    "event GameCreated(uint256 indexed gameId, address playerX, uint256 wager)",
    "event GameJoined(uint256 indexed gameId, address playerO)",
    "event MoveMade(uint256 indexed gameId, address player, uint8 position)",
    "event GameFinished(uint256 indexed gameId, address winner, bool isDraw)"
];

// UI Elements
const minigameModalOverlay = document.getElementById('tictactoeModalOverlay');
const minigameModalClose = document.getElementById('tictactoeModalClose');
const openTicTacToeCard = document.getElementById('openTicTacToeCard');

const lobbyView = document.getElementById('tttLobbyView');
const activeView = document.getElementById('tttActiveView');

const btnCreate = document.getElementById('tttCreateBtn');
const btnRefresh = document.getElementById('tttRefreshBtn');
const inputWager = document.getElementById('tttWager');
const roomsList = document.getElementById('tttRoomsList');

const playerXEl = document.getElementById('tttPlayerX').querySelector('.addr');
const playerOEl = document.getElementById('tttPlayerO').querySelector('.addr');
const statusText = document.getElementById('tttStatusText');
const prizePool = document.getElementById('tttPrizePool');
const leaveBtn = document.getElementById('tttLeaveBtn');
const cells = document.querySelectorAll('.ttt-cell');
const moveSpinner = document.getElementById('tttMoveSpinner');
const tttShareBtn = document.getElementById('tttShareBtn');
const tttContinueBtn = document.getElementById('tttContinueBtn');

let contract = null;
let currentGameId = null;
let currentInterval = null;
let pendingRoomId = null;
let lastWagerAmount = null;

export function initMinigames() {
    if (!openTicTacToeCard) return;

    openTicTacToeCard.addEventListener('click', (e) => {
        e.preventDefault();
        openMinigameModal();
    });

    minigameModalClose.addEventListener('click', closeMinigameModal);
    minigameModalOverlay.addEventListener('click', (e) => {
        if (e.target === minigameModalOverlay) closeMinigameModal();
    });

    btnRefresh.addEventListener('click', loadRooms);
    btnCreate.addEventListener('click', createRoom);
    leaveBtn.addEventListener('click', leaveGameView);
    tttContinueBtn.addEventListener('click', () => {
        if (!lastWagerAmount) return;
        inputWager.value = lastWagerAmount;
        leaveGameView();
        createRoom();
    });

    cells.forEach(cell => {
        cell.addEventListener('click', () => {
            if (currentGameId === null) return;
            const idx = parseInt(cell.getAttribute('data-index'));
            makeMove(idx);
        });
    });

    tttShareBtn.addEventListener('click', () => {
        if (currentGameId === null) return;
        const url = new URL(window.location.href);
        url.searchParams.set('tttRoom', currentGameId);
        navigator.clipboard.writeText(url.toString()).then(() => {
            showToast("Invite link copied to clipboard!", "success");
        }).catch(err => {
            console.error("Failed to copy link", err);
            showToast("Failed to copy link", "error");
        });
    });

    // Check for pending invite link
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('tttRoom')) {
        pendingRoomId = parseInt(urlParams.get('tttRoom'));
    }

    window.addEventListener('walletConnected', () => {
        setupContract();
        if (pendingRoomId !== null && pendingRoomId !== undefined && !isNaN(pendingRoomId)) {
            // Give provider a moment
            setTimeout(() => {
                openMinigameModal();
                checkAndJoinPendingRoom();
            }, 1000);
        }
    });
    setupContract();
}

async function checkAndJoinPendingRoom() {
    if (pendingRoomId === null || !contract) return;
    const roomIdToJoin = pendingRoomId;
    pendingRoomId = null; // Clear it so we don't keep triggering

    try {
        const game = await contract.games(roomIdToJoin);
        const state = game[4]; // 0 = Waiting, 1 = Playing, 2 = Finished

        if (state === 0n) {
            // It's waiting, prompt to join
            const wager = ethers.formatEther(game[2]);
            if (confirm(`You have been invited to play Tic Tac Toe Game #${roomIdToJoin}!\nWager: ${wager} STT\n\nDo you want to join?`)) {
                window.joinTicTacToeRoom(roomIdToJoin, game[2].toString());
            }
        } else {
            // Game already playing or finished, just view it
            enterGameView(roomIdToJoin);
            showToast(`Game #${roomIdToJoin} is already active or finished.`, 'info');
        }
    } catch (err) {
        console.error("Failed to fetch pending room", err);
    }
}

function setupContract() {
    const signer = getSigner();
    const provider = getProvider();
    if (signer) {
        contract = new ethers.Contract(TICTACTOE_ADDRESS, TICTACTOE_ABI, signer);
    } else if (provider) {
        contract = new ethers.Contract(TICTACTOE_ADDRESS, TICTACTOE_ABI, provider);
    } else {
        contract = null;
    }
}

function openMinigameModal() {
    if (!getAddress()) {
        showToast("Connect your wallet to play!", "error");
        return;
    }

    if (contract && contract.target === "0x0000000000000000000000000000000000000000") {
        showToast("Smart Contract not deployed yet!", "warning");
        // Still open so they can see the UI
    }

    minigameModalOverlay.classList.add('show');
    loadRooms();
}

function closeMinigameModal() {
    minigameModalOverlay.classList.remove('show');
    stopPolling();
}

async function loadRooms() {
    if (!contract || contract.target === "0x0000000000000000000000000000000000000000") {
        roomsList.innerHTML = `<div class="ttt-empty">Deploy the smart contract to view rooms.</div>`;
        return;
    }

    try {
        btnRefresh.classList.add('spinning'); // Assume CSS class exists from elsewhere
        roomsList.innerHTML = `<div class="ttt-empty">Loading rooms...</div>`;

        const count = await contract.getGamesCount();
        if (count === 0n) {
            roomsList.innerHTML = `<div class="ttt-empty">No active rooms found. Create one!</div>`;
            return;
        }

        let html = '';
        let activeFound = false;

        // Fetch last 10 games (simple pagination approach)
        const start = count > 10n ? count - 10n : 0n;

        for (let i = count - 1n; i >= start; i--) {
            const game = await contract.games(i);
            // game = [playerX, playerO, wager, currentTurn, state, winner]
            const state = game[4]; // 0 = Waiting, 1 = Playing, 2 = Finished
            if (state === 0n) {
                activeFound = true;
                const wagerFormat = ethers.formatEther(game[2]);
                html += `
                    <div class="ttt-room-item">
                        <div class="ttt-room-info">
                            <span class="ttt-room-title">Game #${i}</span>
                            <span class="ttt-room-wager">Wager: ${wagerFormat} STT</span>
                            <span style="font-size:0.75rem; color:var(--text-muted)">Creator: ${shortenAddress(game[0])}</span>
                        </div>
                        <button class="action-btn" onclick="window.joinTicTacToeRoom(${i}, '${game[2]}')">Join</button>
                    </div>
                `;
            } else if (state === 1n && (game[0].toLowerCase() === getAddress().toLowerCase() || game[1].toLowerCase() === getAddress().toLowerCase())) {
                activeFound = true;
                html += `
                    <div class="ttt-room-item" style="border-color:var(--accent-blue)">
                        <div class="ttt-room-info">
                            <span class="ttt-room-title">Game #${i} (Your Active Match)</span>
                            <span class="ttt-room-wager">Wager: ${ethers.formatEther(game[2])} STT</span>
                        </div>
                        <button class="action-btn" onclick="window.resumeTicTacToeRoom(${i})">Resume</button>
                    </div>
                `;
            }
        }

        roomsList.innerHTML = activeFound ? html : `<div class="ttt-empty">No active waiting rooms. Create one!</div>`;

    } catch (err) {
        console.error(err);
        roomsList.innerHTML = `<div class="ttt-empty">Failed to load rooms.</div>`;
    } finally {
        btnRefresh.classList.remove('spinning');
    }
}

// Global functions for inline HTML buttons
window.joinTicTacToeRoom = async (gameId, wagerWei) => {
    if (!getSigner()) return showToast("Wallet not connected", "error");
    try {
        btnRefresh.classList.add('spinning');
        const tx = await contract.joinRoom(gameId, { value: wagerWei });
        showToast("Joining room... waiting for confirmation", "info");
        await tx.wait();
        showToast("Joined successfully!", "success");
        enterGameView(gameId);
    } catch (err) {
        console.error(err);
        showToast(err.reason || "Failed to join room", "error");
    } finally {
        btnRefresh.classList.remove('spinning');
    }
};

window.resumeTicTacToeRoom = (gameId) => {
    enterGameView(gameId);
};

async function createRoom() {
    if (!getSigner()) return showToast("Wallet not connected", "error");
    const val = parseFloat(inputWager.value);
    if (isNaN(val) || val <= 0) return showToast("Invalid wager amount", "error");

    try {
        btnCreate.disabled = true;
        btnCreate.textContent = "Creating...";

        const wei = ethers.parseEther(val.toString());
        const tx = await contract.createRoom({ value: wei });
        showToast("Creating room...", "info");

        // Wait for confirmation
        const receipt = await tx.wait();

        // Parse logs to find GameCreated event to get gameId
        let gameId = null;
        for (const log of receipt.logs) {
            try {
                const parsed = contract.interface.parseLog(log);
                if (parsed && parsed.name === "GameCreated") {
                    gameId = parsed.args.gameId;
                    break;
                }
            } catch (e) { }
        }

        showToast("Room created!", "success");
        if (gameId !== null) {
            enterGameView(gameId);
        } else {
            loadRooms();
        }

    } catch (err) {
        console.error(err);
        showToast(err.reason || "Failed to create room", "error");
    } finally {
        btnCreate.disabled = false;
        btnCreate.textContent = "Create Room";
    }
}

function enterGameView(gameId) {
    currentGameId = gameId;
    lobbyView.style.display = 'none';
    activeView.style.display = 'block';
    resetBoardUI();
    fetchGameState();
    startPolling();
}

function leaveGameView() {
    stopPolling();
    currentGameId = null;
    activeView.style.display = 'none';
    lobbyView.style.display = 'block';
    loadRooms();
}

function startPolling() {
    if (currentInterval) clearInterval(currentInterval);
    currentInterval = setInterval(fetchGameState, 3000);
}

function stopPolling() {
    if (currentInterval) clearInterval(currentInterval);
    currentInterval = null;
}

async function fetchGameState() {
    if (currentGameId === null || !contract) return;
    try {
        const game = await contract.games(currentGameId);
        const board = await contract.getBoard(currentGameId);

        // game = [playerX, playerO, wager, currentTurn, state, winner]
        const pX = game[0];
        const pO = game[1];
        const state = game[4];

        playerXEl.textContent = shortenAddress(pX);
        playerOEl.textContent = pO !== ethers.ZeroAddress ? shortenAddress(pO) : "Waiting...";

        const totalPool = parseFloat(ethers.formatEther(game[2])) * 2;
        prizePool.textContent = `Pool: ${totalPool} STT`;

        // Update board
        for (let i = 0; i < 9; i++) {
            const val = board[i]; // 0=None, 1=X, 2=O
            const cell = cells[i];

            if (val === 1n) {
                cell.textContent = "X";
                cell.className = "ttt-cell x occupied";
            } else if (val === 2n) {
                cell.textContent = "O";
                cell.className = "ttt-cell o occupied";
            } else {
                cell.textContent = "";
                cell.className = "ttt-cell";
            }
        }

        // Update status text
        const me = getAddress().toLowerCase();

        if (state === 0n) {
            statusText.textContent = "Waiting for an opponent...";
            statusText.style.color = "var(--text-muted)";
            tttShareBtn.style.display = 'inline-flex';
            tttContinueBtn.style.display = 'none';
        } else if (state === 1n) {
            tttShareBtn.style.display = 'none';
            tttContinueBtn.style.display = 'none';
            const turnIsX = game[3] === 1n;
            const myTurn = (turnIsX && me === pX.toLowerCase()) || (!turnIsX && me === pO.toLowerCase());

            if (myTurn) {
                statusText.textContent = "YOUR TURN!";
                statusText.style.color = "var(--accent-green)";
            } else {
                statusText.textContent = "Opponent's turn...";
                statusText.style.color = "var(--accent-amber)";
            }
        } else if (state === 2n) {
            tttShareBtn.style.display = 'none';
            tttContinueBtn.style.display = 'inline-flex';
            lastWagerAmount = ethers.formatEther(game[2]);
            const winner = game[5];
            if (winner === ethers.ZeroAddress) {
                statusText.textContent = "DRAW!";
                statusText.style.color = "var(--text-primary)";
            } else if (winner.toLowerCase() === me) {
                statusText.textContent = "YOU WON! 🎉";
                statusText.style.color = "var(--accent-purple)";
            } else {
                statusText.textContent = "YOU LOST 💀";
                statusText.style.color = "var(--accent-red)";
            }
            stopPolling();
        }

    } catch (err) {
        console.error("Fetch State Error", err);
    }
}

async function makeMove(index) {
    if (currentGameId === null || !getSigner()) return;

    // Optimistic UI checks happens in contract, but let's avoid bad clicks
    const cell = cells[index];
    if (cell.classList.contains('occupied')) return;

    try {
        moveSpinner.style.display = 'block';
        const tx = await contract.makeMove(currentGameId, index);
        await tx.wait();
        fetchGameState();
    } catch (err) {
        console.error(err);
        showToast(err.reason || "Invalid move", "error");
    } finally {
        moveSpinner.style.display = 'none';
    }
}

function resetBoardUI() {
    cells.forEach(c => {
        c.textContent = "";
        c.className = "ttt-cell";
    });
    statusText.textContent = "Loading...";
    statusText.style.color = "var(--text-primary)";
    playerXEl.textContent = "...";
    playerOEl.textContent = "...";
    moveSpinner.style.display = 'none';
}
