import { ElectrumApi } from '../electrum-api/ElectrumApi';
import { Observable } from './Observable';
import { GenesisConfig, Network } from './GenesisConfig';
import { TransactionStore, BlockStore } from './Stores';
export var Event;
(function (Event) {
    Event["BLOCK"] = "block";
    Event["TRANSACTION_ADDED"] = "transaction-added";
    Event["TRANSACTION_MINED"] = "transaction-mined";
    Event["SYNCING"] = "syncing";
    Event["SYNCED"] = "synced";
    Event["CLOSE"] = "close";
})(Event || (Event = {}));
const HANDSHAKE_TIMEOUT = 3000;
export class Agent extends Observable {
    constructor(peer) {
        super();
        this.connection = null;
        this.syncing = false;
        this.synced = false;
        this.orphanedBlocks = [];
        this.knownReceipts = new Map();
        this.peer = peer;
        if (peer.ports.wss) {
            console.debug(`Agent: Connecting to wss://${peer.host}:${peer.ports.wss}`);
            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: `wss://${peer.host}:${peer.ports.wss}`,
                proxy: false,
            });
        }
        else if (peer.ports.ssl) {
            console.debug(`Agent: Connecting to ssl://${peer.host}:${peer.ports.ssl}`);
            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50003',
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        }
        else if (peer.ports.tcp) {
            console.debug(`Agent: Connecting to tcp://${peer.host}:${peer.ports.tcp}`);
            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50002',
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        }
        else {
            throw new Error('No suitable connection protocol and port for peer');
        }
    }
    async sync() {
        if (this.syncing || this.synced)
            return;
        this.syncing = true;
        this.fire(Event.SYNCING);
        await this.handshake();
        const promise = new Promise((resolve, reject) => {
            this.once(Event.BLOCK, () => {
                clearTimeout(timeout);
                resolve(this.synced);
            });
            const timeout = setTimeout(() => reject(new Error('Block timeout')), HANDSHAKE_TIMEOUT);
        });
        this.requestHead();
        return promise;
    }
    async getBalance(address) {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getBalance(address);
    }
    async getTransactionReceipts(address) {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getReceipts(address);
    }
    async getTransaction(hash, block) {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getTransaction(hash, block);
    }
    async getBlockHeader(height) {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getBlockHeader(height);
    }
    async getFeeHistogram() {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getFeeHistogram();
    }
    async broadcastTransaction(rawTx) {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.broadcastTransaction(rawTx);
    }
    async subscribe(addresses) {
        if (!this.synced)
            throw new Error('Agent not synced');
        if (typeof addresses === 'string')
            addresses = [addresses];
        for (const address of addresses) {
            return this.connection.subscribeReceipts(address, (receipts) => this.onReceipts(address, receipts));
        }
    }
    async getPeers() {
        if (!this.synced)
            throw new Error('Agent not synced');
        return this.connection.getPeers();
    }
    close(reason) {
        if (this.connection)
            this.connection.close();
        this.connection = null;
        this.syncing = false;
        this.synced = false;
        this.fire(Event.CLOSE, reason);
    }
    on(event, callback) {
        return super.on(event, callback);
    }
    once(event, callback) {
        return super.once(event, callback);
    }
    off(event, id) {
        return super.off(event, id);
    }
    allOff(event) {
        return super.allOff(event);
    }
    async handshake() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Handshake timeout')), HANDSHAKE_TIMEOUT);
            this.connection.getFeatures().then(features => {
                clearTimeout(timeout);
                if (features.genesis_hash === GenesisConfig.GENESIS_HASH) {
                    resolve(true);
                }
                else {
                    this.close();
                    reject(new Error('Wrong genesis hash'));
                }
            });
        });
    }
    requestHead() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }
        this.connection.subscribeHeaders(this.onBlock.bind(this));
    }
    async onBlock(block) {
        if (this.syncing) {
            this.syncing = false;
            this.synced = true;
            this.fire(Event.SYNCED);
        }
        let prevBlock = BlockStore.get(block.blockHeight - 1);
        if (!prevBlock && block.blockHeight > 0) {
            prevBlock = await this.connection.getBlockHeader(block.blockHeight - 1);
            BlockStore.set(prevBlock.blockHeight, prevBlock);
        }
        if ((!prevBlock && block.blockHeight === 0) || prevBlock.blockHash === block.prevHash) {
            BlockStore.set(block.blockHeight, block);
            this.fire(Event.BLOCK, block);
        }
        else {
            console.warn('Agent: Received non-consecutive block:', block);
        }
    }
    async onReceipts(address, receipts) {
        if (!this.knownReceipts.has(address)) {
            this.knownReceipts.set(address, new Map(receipts.map(receipt => [receipt.transactionHash, receipt])));
            return;
        }
        const knownReceipts = this.knownReceipts.get(address);
        for (const receipt of receipts) {
            const knownReceipt = knownReceipts.get(receipt.transactionHash);
            if (knownReceipt && knownReceipt.blockHeight === receipt.blockHeight)
                continue;
            let block = undefined;
            if (receipt.blockHeight > 0) {
                block = BlockStore.get(receipt.blockHeight);
                if (!block) {
                    block = await this.getBlockHeader(receipt.blockHeight);
                    BlockStore.set(block.blockHeight, block);
                }
            }
            const storedTransaction = TransactionStore.get(receipt.transactionHash);
            let txCheck;
            if (!storedTransaction) {
                txCheck = this.connection.getTransaction(receipt.transactionHash, block);
                txCheck.then(tx => TransactionStore.set(tx.transactionHash, tx)).catch(() => { });
            }
            else {
                txCheck = block
                    ? this.connection.proofTransaction(storedTransaction.transactionHash, block).then(() => storedTransaction)
                    : Promise.resolve(storedTransaction);
            }
            txCheck.then(tx => {
                if (block)
                    this.fire(Event.TRANSACTION_MINED, tx, block);
                else
                    this.fire(Event.TRANSACTION_ADDED, tx);
            }).catch(error => console.error(error));
        }
    }
    networkToTokenPrefix(name) {
        if (name === Network.MAIN)
            return 'mainnet';
        if (name === Network.TEST)
            return 'testnet';
    }
}