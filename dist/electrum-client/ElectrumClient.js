import { transactionFromPlain } from '../electrum-api';
import { Transport } from '../electrum-api/types';
import { Agent, Event as AgentEvent } from './Agent';
import { ConsensusState, TransactionState, } from './types';
import { BlockStore, TransactionStore } from './Stores';
import { GenesisConfig, Network } from './GenesisConfig';
export class ElectrumClient {
    constructor(options = {}) {
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
            extraSeedPeers: [],
            ...options,
        };
        this.resetPeers();
        this.connect();
    }
    getHeadHash() {
        var _a;
        return (_a = this.head) === null || _a === void 0 ? void 0 : _a.blockHash;
    }
    getHeadHeight() {
        var _a;
        return (_a = this.head) === null || _a === void 0 ? void 0 : _a.blockHeight;
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
            if (firstUnwantedHistoryIndex > -1) {
                history = history.slice(0, firstUnwantedHistoryIndex);
            }
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
        var _a, _b;
        let tx;
        let sendError;
        for (const agent of this.agents) {
            try {
                tx = await agent.broadcastTransaction(serializedTx);
            }
            catch (error) {
                sendError = error;
                console.warn(`Client: failed to broadcast transaction to ${agent.peer.host}:`, error.message);
            }
        }
        if (!tx) {
            throw (sendError || new Error('Could not send transaction'));
        }
        if (tx.onChain) {
            const address = ((_a = tx.inputs.find(input => input.address)) === null || _a === void 0 ? void 0 : _a.address) || ((_b = tx.outputs.find(output => output.address)) === null || _b === void 0 ? void 0 : _b.address);
            const receipts = await this.getTransactionReceiptsByAddress(address);
            const blockHeight = receipts.find(receipt => receipt.transactionHash === tx.transactionHash).blockHeight;
            const block = await this.getBlockAt(blockHeight);
            return this.onMinedTransaction(block, tx, this.head || undefined);
        }
        this.onPendingTransaction(tx);
        return {
            ...tx,
            state: TransactionState.PENDING,
            confirmations: 0,
        };
    }
    async estimateFees(targetBlocks = [25, 10, 5, 2]) {
        const estimates = [];
        for (const agent of this.agents) {
            try {
                estimates.push(await agent.estimateFees(targetBlocks));
            }
            catch (error) {
                console.warn(`Client: failed to get fee estimate from ${agent.peer.host}:`, error.message);
            }
        }
        if (!estimates.length) {
            throw new Error(`Failed to get fee estimates`);
        }
        function median(array) {
            if (!array.length)
                return undefined;
            const middleIndex = Math.floor(array.length / 2);
            const sorted = [...array].sort();
            return array.length % 2 !== 0
                ? sorted[middleIndex]
                : Math.round((sorted[middleIndex - 1] + sorted[middleIndex]) / 2);
        }
        ;
        const result = {};
        for (const target of targetBlocks) {
            const i = targetBlocks.indexOf(target);
            const feesForTarget = estimates.map(estimate => estimate[i]).filter(estimate => estimate > 0);
            result[target] = median(feesForTarget);
        }
        return result;
    }
    async getMempoolFees() {
        for (const agent of this.agents) {
            try {
                return await agent.getFeeHistogram();
            }
            catch (error) {
                console.warn(`Client: failed to get mempool fees from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get mempool fees`);
    }
    async getMinimumRelayFee() {
        for (const agent of this.agents) {
            try {
                return await agent.getMinimumRelayFee();
            }
            catch (error) {
                console.warn(`Client: failed to get relay fee from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get relay fee`);
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
        const addressSet = new Set(addresses);
        for (const address of addressSet) {
            this.subscribedAddresses.add(address);
        }
        if (this.consensusState === ConsensusState.ESTABLISHED) {
            for (const agent of this.agents) {
                agent.subscribe([...addressSet.values()]);
            }
        }
        const listenerId = this.listenerId++;
        this.transactionListeners.set(listenerId, { listener, addresses: addressSet });
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
        if (this.addressBook.size === 0)
            this.resetPeers();
        let peers = [];
        for (const transport of [Transport.WSS, Transport.SSL, Transport.TCP]) {
            peers = [...this.addressBook.values()].filter((peer) => {
                const protocol = [null, 'tcp', 'ssl', 'wss'][transport];
                if (!peer.ports[protocol])
                    return false;
                if (peer.preferTransport && peer.preferTransport < transport)
                    return false;
                return true;
            });
            if (peers.length > 0)
                break;
        }
        const highPriorityPeers = peers.filter(peer => peer.highPriority);
        if (highPriorityPeers.length > 0)
            peers = highPriorityPeers;
        const peer = peers[Math.floor(Math.random() * peers.length)];
        const agentOptions = this.options.websocketProxy
            ? {
                tcpProxyUrl: this.options.websocketProxy.tcp,
                sslProxyUrl: this.options.websocketProxy.ssl,
            }
            : undefined;
        const agent = new Agent(peer, agentOptions);
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
            this.removePeer(agent.peer, agent.transport);
            agent.close(error.message);
            return;
        }
        this.addPeers(await agent.getPeers());
    }
    resetPeers() {
        if (this.addressBook.size > 0)
            this.addressBook.clear();
        this.addPeers(GenesisConfig.SEED_PEERS);
        this.addPeers(this.options.extraSeedPeers);
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
    removePeer(peer, transport) {
        if (peer.highPriority) {
            peer.highPriority = false;
            this.addressBook.set(peer.host, peer);
            return;
        }
        switch (transport) {
            case Transport.WSS:
                if (peer.ports['ssl']) {
                    peer.preferTransport = Transport.SSL;
                    this.addressBook.set(peer.host, peer);
                    return;
                }
            case Transport.SSL:
                if (peer.ports['tcp']) {
                    peer.preferTransport = Transport.TCP;
                    this.addressBook.set(peer.host, peer);
                    return;
                }
            case Transport.TCP:
                delete peer.preferTransport;
                this.addressBook.delete(peer.host);
                return;
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
    onConsensusChanged(state) {
        if (state === this.consensusState)
            return;
        this.consensusState = state;
        for (const listener of this.consensusChangedListeners.values()) {
            listener(state);
        }
        if (state === ConsensusState.ESTABLISHED) {
            for (const agent of this.agents) {
                agent.subscribe([...this.subscribedAddresses.values()]);
            }
            if (!this.head)
                return;
            for (const listener of this.headChangedListeners.values()) {
                listener(this.head, 'established', [], [this.head.blockHash]);
            }
        }
    }
    onConsensusFailed(agent, reason) {
        if (agent) {
            agent.allOff(AgentEvent.SYNCING);
            agent.allOff(AgentEvent.SYNCED);
            agent.allOff(AgentEvent.BLOCK);
            agent.allOff(AgentEvent.TRANSACTION_ADDED);
            agent.allOff(AgentEvent.TRANSACTION_MINED);
            agent.allOff(AgentEvent.CLOSE);
            this.agents.delete(agent);
        }
        console.debug('Client: Consensus failed: last agent closed');
        this.connect();
    }
    onHeadChanged(block, reason, revertedBlocks, adoptedBlocks) {
        const previousBlock = this.head;
        this.head = block;
        if (this.consensusState === ConsensusState.ESTABLISHED && (!previousBlock || block.blockHash !== previousBlock.blockHash)) {
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
        const details = {
            ...tx,
            state: TransactionState.PENDING,
            confirmations: 0,
        };
        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener(details);
        }
        this.clearTransactionFromConfirm(tx);
        return details;
    }
    onMinedTransaction(block, tx, blockNow) {
        let state = TransactionState.MINED;
        let confirmations = 1;
        if (blockNow) {
            confirmations = (blockNow.blockHeight - block.blockHeight) + 1;
            state = confirmations >= this.options.requiredBlockConfirmations ? TransactionState.CONFIRMED : TransactionState.MINED;
        }
        const details = {
            ...tx,
            blockHash: block.blockHash,
            blockHeight: block.blockHeight,
            timestamp: block.timestamp,
            state,
            confirmations,
        };
        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener(details);
        }
        if (details && details.state === TransactionState.MINED) {
            this.queueTransactionForConfirmation(details);
        }
        return details;
    }
    onConfirmedTransaction(tx, blockNow) {
        const details = {
            ...tx,
            state: TransactionState.CONFIRMED,
            confirmations: blockNow.blockHeight - tx.blockHeight,
        };
        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener(details);
        }
        return details;
    }
    getListenersForTransaction(tx) {
        return [...this.transactionListeners.values()].filter(({ addresses }) => tx.inputs.some(input => input.address && addresses.has(input.address))
            || tx.outputs.some(output => output.address && addresses.has(output.address)));
    }
}
