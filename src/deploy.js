import { ethers } from 'ethers';
import abiStr from '../build/contracts_TicTacToe_sol_TicTacToe.abi?raw';
import binStr from '../build/contracts_TicTacToe_sol_TicTacToe.bin?raw';

const btn = document.getElementById('deployBtn');
const status = document.getElementById('status');

// Helper to format ABI string into object if raw import comes back as string
const ABI = JSON.parse(abiStr);
const BYTECODE = binStr.trim(); // remove any newlines

btn.addEventListener('click', async () => {
    try {
        if (!window.ethereum) {
            throw new Error("MetaMask is not installed!");
        }

        btn.disabled = true;
        status.className = '';
        status.textContent = 'Requesting account access...';

        const provider = new ethers.BrowserProvider(window.ethereum);
        await provider.send("eth_requestAccounts", []);
        const signer = await provider.getSigner();
        const address = await signer.getAddress();

        status.textContent = `Connected as ${address}\nPreparing deployment...`;

        const factory = new ethers.ContractFactory(ABI, BYTECODE, signer);

        status.textContent = `Sending transaction to Somnia Testnet... Please confirm in MetaMask.`;

        const contract = await factory.deploy();

        status.textContent = `Transaction sent! Waiting for confirmation...\nTx Hash: ${contract.deploymentTransaction().hash}`;

        await contract.waitForDeployment();
        const contractAddress = await contract.getAddress();

        status.className = 'success';
        status.innerHTML = `
            <strong>Deploy Successful!</strong><br/><br/>
            Contract Address:<br/>
            <span style="font-family: monospace; font-size: 1.2em; color: #fff;">${contractAddress}</span><br/><br/>
            <strong style="color: #fff;">ACTION REQUIRED:</strong><br/>
            Copy the address above, open <code>src/minigames.js</code>, and paste it into the <code>TICTACTOE_ADDRESS</code> constant on Line 6.<br/><br/>
            Then you can return to the Dashboard and play!
        `;

    } catch (err) {
        console.error(err);
        status.className = 'error';
        status.textContent = `Error: ${err.message || err.reason || "Deployment failed"}`;
        btn.disabled = false;
    }
});
