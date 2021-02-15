import { transactionFromPlain } from '../electrum-api';
import { Peer, PlainTransaction, PlainBlockHeader, Transport, Balance, Receipt } from '../electrum-api/types';

import { Agent, Event as AgentEvent, ElectrumAgentOptions } from './Agent';
import {
    ConsensusState,
    TransactionState,
    Handle,
    ConsensusChangedListener,
    HeadChangedListener,
    TransactionListener,
    TransactionDetails,
} from './types';
import { BlockStore, TransactionStore } from './Stores';
import { GenesisConfig, Network } from './GenesisConfig';

export type ElectrumClientOptions = {
    requiredBlockConfirmations: number,
    websocketProxy?: {
        tcp: string | false,
        ssl: string | false,
    },
    extraSeedPeers: Peer[],
}

export class ElectrumClient {
    private consensusState = ConsensusState.CONNECTING;
    private head: PlainBlockHeader | null = null;

    private agents = new Set<Agent>();
    private addressBook = new Map<string, Peer>();

    private subscribedAddresses = new Set<string>();
    private consensusChangedListeners = new Map<Handle, ConsensusChangedListener>();
    private headChangedListeners = new Map<Handle, HeadChangedListener>();
    private transactionListeners = new Map<Handle, {listener: TransactionListener, addresses: Set<string>}>();
    private listenerId: Handle = 0;

    private transactionsWaitingForConfirmation = new Map<number, Map<string, TransactionDetails>>();

    private options: ElectrumClientOptions;

    constructor(options: Partial<ElectrumClientOptions> = {}) {
        this.options = {
            requiredBlockConfirmations: 6,
            extraSeedPeers: [],
            ...options,
        };

        // Seed addressbook
        this.resetPeers();

        this.connect();
    }

    public getHeadHash() {
        return this.head?.blockHash;
    }

    public getHeadHeight() {
        return this.head?.blockHeight;
    }

    public getHeadBlock() {
        return this.head || undefined;
    }

    public async getBlockAt(height: number): Promise<PlainBlockHeader> {
        const storedBlock = BlockStore.get(height);
        if (storedBlock) return storedBlock;

        for (const agent of this.agents) {
            try {
                return await agent.getBlockHeader(height);
            } catch (error) {
                console.warn(`Client: failed to get block header at ${height} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get block header at ${height}`);
    }

    public async getBalance(address: string): Promise<Balance> {
        for (const agent of this.agents) {
            try {
                return await agent.getBalance(address);
            } catch (error) {
                console.warn(`Client: failed to get balance for ${address} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get balance for ${address}`);
    }

    public async getTransaction(hash: string, block?: PlainBlockHeader): Promise<PlainTransaction> {
        if (!block) {
            const storedTransaction = TransactionStore.get(hash);
            if (storedTransaction) return storedTransaction;
        }

        for (const agent of this.agents) {
            try {
                return await agent.getTransaction(hash, block);
            } catch (error) {
                console.warn(`Client: failed to get transaction ${hash} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get transaction ${hash}`);
    }

    public async getTransactionReceiptsByAddress(address: string): Promise<Receipt[]> {
        for (const agent of this.agents) {
            try {
                return await agent.getTransactionReceipts(address);
            } catch (error) {
                console.warn(`Client: failed to get transaction receipts for ${address} from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get transaction receipts for ${address}`);
    }

    public async getTransactionsByAddress(address: string, sinceBlockHeight = 0, knownTransactions: TransactionDetails[] = [], limit = Infinity): Promise<TransactionDetails[]> {
        // Prepare map of known transactions
        const knownTxs = new Map<string, TransactionDetails>();
        if (knownTransactions) {
            for (const tx of knownTransactions) {
                knownTxs.set(tx.transactionHash, tx);
            }
        }

        let history = await this.getTransactionReceiptsByAddress(address);

        // Reduce history to limit
        if (limit < Infinity) {
            history = history.slice(0, limit);
        }

        // Remove unwanted history
        if (sinceBlockHeight > 0) {
            const firstUnwantedHistoryIndex = history.findIndex(receipt => receipt.blockHeight > 0 && receipt.blockHeight < sinceBlockHeight);
            if (firstUnwantedHistoryIndex > -1) {
                history = history.slice(0, firstUnwantedHistoryIndex);
            }
        }

        const blocks = new Map<number, PlainBlockHeader>();

        // Fetch transactions
        const txs: TransactionDetails[] = [];
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
                    const tx = await this.getTransaction(transactionHash, block); // Validates merkle proof
                    let confirmations = 0;
                    let state = TransactionState.PENDING;
                    if (block) {
                        confirmations = this.head!.blockHeight - block.blockHeight + 1;
                        const confirmed = confirmations >= this.options.requiredBlockConfirmations;
                        state = confirmed ? TransactionState.CONFIRMED : TransactionState.MINED;
                    }

                    const details: TransactionDetails = {
                        ...tx,
                        state,
                        confirmations,
                        ...(block ? {
                            blockHash: block.blockHash,
                            blockHeight: block.blockHeight,
                            timestamp: block.timestamp,
                        } : {}),
                    };

                    if (details.state === TransactionState.MINED) this.queueTransactionForConfirmation(details);

                    txs.push(details);
                } catch (error) {
                    console.warn(error);
                    continue;
                }
            } catch (error) {
                console.warn(error);
                return txs;
            }
        }

        // Track known (new or pending) transactions
        for (const details of knownTxs.values()) {
            if ((details.state === TransactionState.NEW || details.state === TransactionState.PENDING)
                && !txs.some((tx) => tx.transactionHash === details.transactionHash)) {

                // Re-send this transaction
                txs.push(await this.sendTransaction(transactionFromPlain(details).toHex()));
            }
        }

        return txs;
    }

    public async sendTransaction(serializedTx: string): Promise<TransactionDetails> {
        // Relay transaction to all connected peers.
        let tx: PlainTransaction | undefined;
        let sendError: Error | undefined;
        for (const agent of this.agents) {
            try {
                tx = await agent.broadcastTransaction(serializedTx);
            } catch (error) {
                sendError = error;
                console.warn(`Client: failed to broadcast transaction to ${agent.peer.host}:`, error.message);
            }
        }

        if (!tx) {
            throw (sendError || new Error('Could not send transaction'));
        }

        if (tx.onChain) {
            // Get correct number of confirmations
            const address = tx.inputs.find(input => input.address)?.address
                || tx.outputs.find(output => output.address)?.address!;
            const receipts = await this.getTransactionReceiptsByAddress(address);
            const blockHeight = receipts.find(receipt => receipt.transactionHash === tx!.transactionHash)!.blockHeight;
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

    // 25, 10, 5 and 2 are the default FEE_ETA_TARGETS of Electrum wallet
    public async estimateFees(targetBlocks = [25, 10, 5, 2]): Promise<{
        [target: number]: number | undefined;
    }> {
        const estimates: number[][] = [];
        for (const agent of this.agents) {
            try {
                estimates.push(await agent.estimateFees(targetBlocks));
            } catch (error) {
                console.warn(`Client: failed to get fee estimate from ${agent.peer.host}:`, error.message);
            }
        }

        if (!estimates.length) {
            throw new Error(`Failed to get fee estimates`);
        }

        function median(array: number[]) {
            if (!array.length) return undefined;
            const middleIndex = Math.floor(array.length / 2);
            const sorted = [...array].sort();
            return array.length % 2 !== 0
                ? sorted[middleIndex]
                : Math.round((sorted[middleIndex - 1] + sorted[middleIndex]) / 2);
        };

        const result: {[target: number]: number | undefined} = {};

        for (const target of targetBlocks) {
            const i = targetBlocks.indexOf(target);
            const feesForTarget = estimates.map(estimate => estimate[i]).filter(estimate => estimate > 0);
            result[target] = median(feesForTarget);
        }

        return result;
    }

    public async getMempoolFees(): Promise<[number, number][]> {
        for (const agent of this.agents) {
            try {
                return await agent.getFeeHistogram();
            } catch (error) {
                console.warn(`Client: failed to get mempool fees from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get mempool fees`);
    }

    public async getMinimumRelayFee(): Promise<number> {
        for (const agent of this.agents) {
            try {
                return await agent.getMinimumRelayFee();
            } catch (error) {
                console.warn(`Client: failed to get relay fee from ${agent.peer.host}:`, error.message);
            }
        }
        throw new Error(`Failed to get relay fee`);
    }

    public addConsensusChangedListener(listener: ConsensusChangedListener): Handle {
        const listenerId = this.listenerId++;
        this.consensusChangedListeners.set(listenerId, listener);
        return listenerId;
    }

    public addHeadChangedListener(listener: HeadChangedListener): Handle {
        const listenerId = this.listenerId++;
        this.headChangedListeners.set(listenerId, listener);
        return listenerId;
    }

    public addTransactionListener(listener: TransactionListener, addresses: string[]): Handle {
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
        this.transactionListeners.set(listenerId, {listener, addresses: set});
        return listenerId;
    }

    public removeListener(handle: Handle): void {
        this.consensusChangedListeners.delete(handle);
        this.headChangedListeners.delete(handle);
        this.transactionListeners.delete(handle);
        if (this.transactionListeners.size === 0) {
            this.transactionsWaitingForConfirmation.clear();
        }
    }

    public async waitForConsensusEstablished(): Promise<void> {
        return new Promise(resolve => {
            if (this.consensusState === ConsensusState.ESTABLISHED) {
                resolve();
            } else {
                const handle = this.addConsensusChangedListener(state => {
                    if (state === ConsensusState.ESTABLISHED) {
                        this.removeListener(handle);
                        resolve();
                    }
                });
            }
        });
    }

    private async connect(): Promise<void> {
        this.onConsensusChanged(ConsensusState.CONNECTING);

        if (this.addressBook.size === 0) this.resetPeers();

        // Select peer from address book
        let peers: Peer[] = [];
        for (const transport of [Transport.WSS, Transport.SSL, Transport.TCP]) {
            peers = [...this.addressBook.values()].filter((peer) => {
                const protocol = [null, 'tcp', 'ssl', 'wss'][transport] as 'tcp' | 'ssl' | 'wss';
                if (!peer.ports[protocol]) return false;
                if (peer.preferTransport && peer.preferTransport < transport) return false;
                return true;
            });
            if (peers.length > 0) break;
        }

        const highPriorityPeers = peers.filter(peer => peer.highPriority);
        if (highPriorityPeers.length > 0) peers = highPriorityPeers;

        const peer = peers[Math.floor(Math.random() * peers.length)];
        const agentOptions: ElectrumAgentOptions | undefined = this.options.websocketProxy
            ? {
                tcpProxyUrl: this.options.websocketProxy.tcp,
                sslProxyUrl: this.options.websocketProxy.ssl,
            }
            : undefined;

        // Connect to network
        const agent = new Agent(peer, agentOptions);

        agent.on(AgentEvent.SYNCING, () => this.onConsensusChanged(ConsensusState.SYNCING));
        agent.on(AgentEvent.SYNCED, () => {
            this.agents.add(agent);
            this.onConsensusChanged(ConsensusState.ESTABLISHED);
        });
        agent.on(AgentEvent.BLOCK, (block: PlainBlockHeader) => this.onHeadChanged(block, 'extended', [], [block]));
        agent.on(AgentEvent.TRANSACTION_ADDED, (tx: PlainTransaction) => this.onPendingTransaction(tx));
        agent.on(AgentEvent.TRANSACTION_MINED, (tx: PlainTransaction, block: PlainBlockHeader) => this.onMinedTransaction(block, tx, block));
        agent.on(AgentEvent.CLOSE, (reason: string) => this.onConsensusFailed(agent, reason));

        try {
            await agent.sync();
        } catch (error) {
            // console.warn(error);
            this.removePeer(agent.peer, agent.transport);
            agent.close(error.message);
            return;
        }

        // Get more peers
        this.addPeers(await agent.getPeers());
    }

    private resetPeers(): void {
        if (this.addressBook.size > 0) this.addressBook.clear();
        this.addPeers(GenesisConfig.SEED_PEERS);
        this.addPeers(this.options.extraSeedPeers);
    }

    private addPeers(peers: Peer[]): void {
        // Filter out unreachable peers

        peers = peers.filter(peer => {
            // Websockify proxy does (currently) not support TOR nodes
            if (peer.host.endsWith('.onion')) return false;

            // Ignore hosts that are IP addresses
            // if (peer.host.includes(':')) return false;

            // Websockify proxy only allows standard ports
            if (peer.ports.ssl && peer.ports.ssl !== (GenesisConfig.NETWORK_NAME === Network.MAIN ? 50002 : 60002)) return false;
            if (peer.ports.tcp && peer.ports.tcp !== (GenesisConfig.NETWORK_NAME === Network.MAIN ? 50001 : 60001)) return false;

            return true;
        });

        for (const peer of peers) {
            this.addressBook.set(peer.host, peer);
        }
    }

    private removePeer(peer: Peer, transport: Transport): void {
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
                    return
                } // Fallthrough on purpose
            case Transport.SSL:
                if (peer.ports['tcp']) {
                    peer.preferTransport = Transport.TCP;
                    this.addressBook.set(peer.host, peer);
                    return;
                } // Fallthrough on purpose
            case Transport.TCP:
                delete peer.preferTransport;
                this.addressBook.delete(peer.host);
                return;
        }
    }

    private getConfirmationHeight(blockHeight: number): number {
        return blockHeight + this.options.requiredBlockConfirmations - 1;
    }

    private queueTransactionForConfirmation(tx: TransactionDetails): void {
        if (!tx.blockHeight) return;
        const confirmationHeight = this.getConfirmationHeight(tx.blockHeight);
        const map = this.transactionsWaitingForConfirmation.get(confirmationHeight) || new Map<string, TransactionDetails>();
        map.set(tx.transactionHash, tx);
        this.transactionsWaitingForConfirmation.set(confirmationHeight, map);
    }

    private clearTransactionFromConfirm(tx: PlainTransaction): void {
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

    private onConsensusChanged(state: ConsensusState): void {
        if (state === this.consensusState) return;

        this.consensusState = state;
        for (const listener of this.consensusChangedListeners.values()) {
            listener(state);
        }

        if (state === ConsensusState.ESTABLISHED) {
            // Subscribe addresses
            if (this.subscribedAddresses.size > 0) {
                for (const agent of this.agents) {
                    agent.subscribe([...this.subscribedAddresses.values()]);
                }
            }

            // Update head block hash
            // const head = await consensus.getHead();
            // if (head.blockHash === this.head.blockHash) return;
            // this.head = head;

            if (!this.head) return;

            for (const listener of this.headChangedListeners.values()) {
                listener(this.head, 'established', [], [this.head.blockHash]);
            }
        }
    }

    private onConsensusFailed(agent: Agent, reason: string): void {
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

    private onHeadChanged(block: PlainBlockHeader, reason: string, revertedBlocks: PlainBlockHeader[], adoptedBlocks: PlainBlockHeader[]): void {
        const previousBlock = this.head;
        this.head = block; // TODO: Check with consensus

        // Process head-changed listeners.
        if (this.consensusState === ConsensusState.ESTABLISHED && (!previousBlock || block.blockHash !== previousBlock.blockHash)) {
            for (const listener of this.headChangedListeners.values()) {
                listener(block, reason, revertedBlocks.map(b => b.blockHash), adoptedBlocks.map(b => b.blockHash));
            }
        }

        // Process transaction listeners.
        if (this.transactionListeners.size > 0) {
            const revertedTxs = new Set<PlainTransaction>();

            // Gather reverted transactions
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

            // Report all reverted transactions as pending
            for (const tx of revertedTxs.values()) {
                this.onPendingTransaction(tx);
            }

            // Report confirmed transactions
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

    private onPendingTransaction(tx: PlainTransaction): TransactionDetails {
        const details: TransactionDetails = {
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

    private onMinedTransaction(block: PlainBlockHeader, tx: PlainTransaction, blockNow?: PlainBlockHeader): TransactionDetails {
        let state = TransactionState.MINED;
        let confirmations = 1;
        if (blockNow) {
            confirmations = (blockNow.blockHeight - block.blockHeight) + 1;
            state = confirmations >= this.options.requiredBlockConfirmations ? TransactionState.CONFIRMED : TransactionState.MINED;
        }
        const details: TransactionDetails = {
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

    private onConfirmedTransaction(tx: TransactionDetails, blockNow: PlainBlockHeader): TransactionDetails {
        const details: TransactionDetails = {
            ...tx,
            state: TransactionState.CONFIRMED,
            confirmations: blockNow.blockHeight - tx.blockHeight!,
        };

        for (const { listener } of this.getListenersForTransaction(tx)) {
            listener(details);
        }

        return details;
    }

    private getListenersForTransaction(tx: PlainTransaction): {
        listener: TransactionListener;
        addresses: Set<string>;
    }[] {
        return [...this.transactionListeners.values()].filter(({ addresses }) =>
            tx.inputs.some(input => input.address && addresses.has(input.address))
            || tx.outputs.some(output => output.address && addresses.has(output.address)));
    }
}
