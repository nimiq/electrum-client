import { transactionFromPlain, transactionToPlain } from '../electrum-api';
import { Agent, Event as AgentEvent } from './Agent';
import { ConsensusState, TransactionState, } from './types';
import { BlockStore, TransactionStore } from './Stores';
import { GenesisConfig, Network } from './GenesisConfig';
export class ElectrumClient {
    constructor(options) {
        this.consensusState = ConsensusState.CONNECTING;
        this.head = null;
        this.agents = new Set();
        this.addressBook = new Map();
        this.subscribedAddresses = new Set();
        this.consensusChangedListeners = new Map();
        this.headChangedListeners = new Map();
        this.transactionListeners = new Map();
        this.listenerId = 0;
        this.transactionsWaitingForConfirmation = new Map();
        this.options = {
            requiredBlockConfirmations: 6,
            ...options,
        };
        this.addPeers(GenesisConfig.SEED_PEERS);
        this.connect();
    }
    getHeadHash() {
        return this.head?.blockHash;
    }
    getHeadHeight() {
        return this.head?.blockHeight;
    }
    getHeadBlock() {
        return this.head || undefined;
    }
    async getBlockAt(height) {
        const storedBlock = BlockStore.get(height);
        if (storedBlock)
            return storedBlock;
        for (const agent of this.agents) {
            try {
                return await agent.getBlockHeader(height);
            }
            catch (error) {
                console.warn(`Client: failed to get block header at ${height} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get block header at ${height}`);
    }
    async getBalance(address) {
        for (const agent of this.agents) {
            try {
                return await agent.getBalance(address);
            }
            catch (error) {
                console.warn(`Client: failed to get balance for ${address} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get balance for ${address}`);
    }
    async getTransaction(hash, block) {
        if (!block) {
            const storedTransaction = TransactionStore.get(hash);
            if (storedTransaction)
                return storedTransaction;
        }
        for (const agent of this.agents) {
            try {
                return await agent.getTransaction(hash, block);
            }
            catch (error) {
                console.warn(`Client: failed to get transaction ${hash} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get transaction ${hash}`);
    }
    async getTransactionReceiptsByAddress(address) {
        for (const agent of this.agents) {
            try {
                return await agent.getTransactionReceipts(address);
            }
            catch (error) {
                console.warn(`Client: failed to get transaction receipts for ${address} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get transaction receipts for ${address}`);
    }
    async getTransactionsByAddress(address, sinceBlockHeight = 0, knownTransactions = [], limit = Infinity) {
        const knownTxs = new Map();
        if (knownTransactions) {
            for (const tx of knownTransactions) {
                knownTxs.set(tx.transactionHash, tx);
            }
        }
        let history = await this.getTransactionReceiptsByAddress(address);
        if (limit < Infinity) {
            history = history.slice(0, limit);
        }
        if (sinceBlockHeight > 0) {
            const firstUnwantedHistoryIndex = history.findIndex(receipt => receipt.blockHeight > 0 && receipt.blockHeight < sinceBlockHeight);
            history = history.slice(0, firstUnwantedHistoryIndex);
        }
        const blocks = new Map();
        const txs = [];
        for (const { transactionHash, blockHeight } of history) {
            const knownTx = knownTxs.get(transactionHash);
            if (knownTx && knownTx.blockHeight === Math.max(blockHeight, 0) && knownTx.state === TransactionState.CONFIRMED) {
                continue;
            }
            try {
                let block = blocks.get(blockHeight);
                if (!block && blockHeight > 0) {
                    block = await this.getBlockAt(blockHeight);
                    blocks.set(blockHeight, block);
                }
                try {
                    const tx = await this.getTransaction(transactionHash, block);
                    let confirmations = 0;
                    let state = TransactionState.PENDING;
                    if (block) {
                        confirmations = this.head.blockHeight - block.blockHeight + 1;
                        const confirmed = confirmations >= this.options.requiredBlockConfirmations;
                        state = confirmed ? TransactionState.CONFIRMED : TransactionState.MINED;
                    }
                    const details = {
                        ...tx,
                        state,
                        confirmations,
                        ...(block ? {
                            blockHash: block.blockHash,
                            blockHeight: block.blockHeight,
                            timestamp: block.timestamp,
                        } : {}),
                    };
                    if (details.state === TransactionState.MINED)
                        this.queueTransactionForConfirmation(details);
                    txs.push(details);
                }
                catch (error) {
                    console.warn(error);
                    continue;
                }
            }
            catch (error) {
                console.warn(error);
                return txs;
            }
        }
        for (const details of knownTxs.values()) {
            if ((details.state === TransactionState.NEW || details.state === TransactionState.PENDING)
                && !txs.some((tx) => tx.transactionHash === details.transactionHash)) {
                txs.push(await this.sendTransaction(transactionFromPlain(details).toHex()));
            }
        }
        return txs;
    }
    async sendTransaction(serializedTx) {
        let tx;
        for (const agent of this.agents) {
            try {
                tx = await agent.broadcastTransaction(serializedTx);
            }
            catch (error) {
                console.warn(`Client: failed to broadcast transaction to ${agent.peer.host}:`, error.message);
            }
        }
        if (!tx) {
            return {
                ...transactionToPlain(serializedTx),
                state: TransactionState.NEW,
                confirmations: 0,
            };
        }
        return {
            ...tx,
            state: TransactionState.PENDING,
            confirmations: 0,
        };
    }
    addConsensusChangedListener(listener) {
        const listenerId = this.listenerId++;
        this.consensusChangedListeners.set(listenerId, listener);
        return listenerId;
    }
    addHeadChangedListener(listener) {
        const listenerId = this.listenerId++;
        this.headChangedListeners.set(listenerId, listener);
        return listenerId;
    }
    addTransactionListener(listener, addresses) {
        const set = new Set(addresses);
        for (const address of set) {
            this.subscribedAddresses.add(address);
        }
        if (this.consensusState === ConsensusState.ESTABLISHED) {
            for (const agent of this.agents) {
                agent.subscribe([...this.subscribedAddresses.values()]);
            }
        }
        const listenerId = this.listenerId++;
        this.transactionListeners.set(listenerId, { listener, addresses: set });
        return listenerId;
    }
    removeListener(handle) {
        this.consensusChangedListeners.delete(handle);
        this.headChangedListeners.delete(handle);
        this.transactionListeners.delete(handle);
        if (this.transactionListeners.size === 0) {
            this.transactionsWaitingForConfirmation.clear();
        }
    }
    async waitForConsensusEstablished() {
        return new Promise(resolve => {
            if (this.consensusState === ConsensusState.ESTABLISHED) {
                resolve();
            }
            else {
                const handle = this.addConsensusChangedListener(state => {
                    if (state === ConsensusState.ESTABLISHED) {
                        this.removeListener(handle);
                        resolve();
                    }
                });
            }
        });
    }
    async connect() {
        this.onConsensusChanged(ConsensusState.CONNECTING);
        const peer = [...this.addressBook.values()][Math.floor(Math.random() * this.addressBook.size)];
        const agent = new Agent(peer);
        agent.on(AgentEvent.SYNCING, () => this.onConsensusChanged(ConsensusState.SYNCING));
        agent.on(AgentEvent.SYNCED, () => {
            this.agents.add(agent);
            this.onConsensusChanged(ConsensusState.ESTABLISHED);
        });
        agent.on(AgentEvent.BLOCK, (block) => this.onHeadChanged(block, 'extended', [], [block]));
        agent.on(AgentEvent.TRANSACTION_ADDED, (tx) => this.onPendingTransaction(tx));
        agent.on(AgentEvent.TRANSACTION_MINED, (tx, block) => this.onMinedTransaction(block, tx, block));
        agent.on(AgentEvent.CLOSE, (reason) => this.onConsensusFailed(agent, reason));
        try {
            await agent.sync();
        }
        catch (error) {
            console.warn(error);
            agent.close();
            return;
        }
        this.addPeers(await agent.getPeers());
    }
    addPeers(peers) {
        peers = peers.filter(peer => {
            if (peer.host.endsWith('.onion'))
                return false;
            if (peer.ports.ssl && peer.ports.ssl !== (GenesisConfig.NETWORK_NAME === Network.MAIN ? 50002 : 60002))
                return false;
            if (peer.ports.tcp && peer.ports.tcp !== (GenesisConfig.NETWORK_NAME === Network.MAIN ? 50001 : 60001))
                return false;
            return true;
        });
        for (const peer of peers) {
            this.addressBook.set(peer.host, peer);
        }
    }
    getConfirmationHeight(blockHeight) {
        return blockHeight + this.options.requiredBlockConfirmations - 1;
    }
    queueTransactionForConfirmation(tx) {
        if (!tx.blockHeight)
            return;
        const confirmationHeight = this.getConfirmationHeight(tx.blockHeight);
        const map = this.transactionsWaitingForConfirmation.get(confirmationHeight) || new Map();
        map.set(tx.transactionHash, tx);
        this.transactionsWaitingForConfirmation.set(confirmationHeight, map);
    }
    clearTransactionFromConfirm(tx) {
        for (const [key, value] of this.transactionsWaitingForConfirmation.entries()) {
            if (value.has(tx.transactionHash)) {
                value.delete(tx.transactionHash);
                if (value.size === 0) {
                    this.transactionsWaitingForConfirmation.delete(key);
                    break;
                }
            }
        }
    }
    async onConsensusChanged(state) {
        if (state === this.consensusState)
            return;
        this.consensusState = state;
        for (const listener of this.consensusChangedListeners.values()) {
            listener(state);
        }
        if (state === ConsensusState.ESTABLISHED) {
            if (this.subscribedAddresses.size > 0) {
                for (const agent of this.agents) {
                    agent.subscribe([...this.subscribedAddresses.values()]);
                }
            }
            if (!this.head)
                return;
            for (const listener of this.headChangedListeners.values()) {
                listener(this.head, 'established', [], [this.head.blockHash]);
            }
        }
    }
    onConsensusFailed(agent, reason) {
        this.agents.delete(agent);
        this.connect();
    }
    async onHeadChanged(block, reason, revertedBlocks, adoptedBlocks) {
        if (this.consensusState === ConsensusState.ESTABLISHED && (!this.head || block.blockHash !== this.head.blockHash)) {
            this.head = block;
            for (const listener of this.headChangedListeners.values()) {
                listener(block, reason, revertedBlocks.map(b => b.blockHash), adoptedBlocks.map(b => b.blockHash));
            }
        }
        if (this.transactionListeners.size > 0) {
            const revertedTxs = new Set();
            for (const block of revertedBlocks) {
                const confirmationHeight = this.getConfirmationHeight(block.blockHeight);
                const map = this.transactionsWaitingForConfirmation.get(confirmationHeight);
                if (map) {
                    for (const tx of map.values()) {
                        revertedTxs.add(tx);
                    }
                    this.transactionsWaitingForConfirmation.delete(confirmationHeight);
                }
            }
            for (const tx of revertedTxs.values()) {
                this.onPendingTransaction(tx);
            }
            for (const block of adoptedBlocks) {
                const map = this.transactionsWaitingForConfirmation.get(block.blockHeight);
                if (map) {
                    for (const tx of map.values()) {
                        this.onConfirmedTransaction(tx, adoptedBlocks[adoptedBlocks.length - 1]);
                    }
                    this.transactionsWaitingForConfirmation.delete(block.blockHeight);
                }
            }
        }
    }
    onPendingTransaction(tx) {
        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener({
                ...tx,
                state: TransactionState.PENDING,
                confirmations: 0,
            });
        }
        this.clearTransactionFromConfirm(tx);
    }
    onMinedTransaction(block, tx, blockNow) {
        let details = undefined;
        for (const { listener } of this.getListenersForTransaction(tx)) {
            let state = TransactionState.MINED;
            let confirmations = 1;
            if (blockNow) {
                confirmations = (blockNow.blockHeight - block.blockHeight) + 1;
                state = confirmations >= this.options.requiredBlockConfirmations ? TransactionState.CONFIRMED : TransactionState.MINED;
            }
            details = details || {
                ...tx,
                blockHash: block.blockHash,
                blockHeight: block.blockHeight,
                timestamp: block.timestamp,
                state,
                confirmations,
            };
            listener(details);
        }
        if (details && details.state === TransactionState.MINED) {
            this.queueTransactionForConfirmation(details);
        }
    }
    onConfirmedTransaction(tx, blockNow) {
        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener({
                ...tx,
                state: TransactionState.CONFIRMED,
                confirmations: blockNow.blockHeight - tx.blockHeight,
            });
        }
    }
    getListenersForTransaction(tx) {
        return [...this.transactionListeners.values()].filter(({ addresses }) => tx.inputs.some(input => input.address && addresses.has(input.address))
            || tx.outputs.some(output => output.address && addresses.has(output.address)));
    }
}
