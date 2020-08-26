import { ElectrumApi } from '../electrum-api/ElectrumApi';
import { Observable } from './Observable';
import { PlainBlockHeader, Peer, Receipt } from '../electrum-api/types';
import { GenesisConfig, Network } from './GenesisConfig';
import { /* TransactionStore, */ BlockStore } from './Stores';

export enum Event {
    BLOCK = 'block',
    TRANSACTION = 'transaction',
}

export class Agent extends Observable {
    private connection: ElectrumApi | null = null;
    private syncing = false;
    private synced = false;
    private orphanedBlocks: PlainBlockHeader[] = [];
    private knownReceipts = new Map</* address */ string, Map</* transactionHash */ string, Receipt>>();

    constructor(peer: Peer) {
        super();

        if (peer.ports.wss) {
            console.debug(`Agent: Connecting to wss://${peer.host}:${peer.ports.wss}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: `wss://${peer.host}:${peer.ports.wss}`,
                proxy: false,
                // token: undefined,
            });
        } else if (peer.ports.ssl) {
            console.debug(`Agent: Connecting to ssl://${peer.host}:${peer.ports.ssl}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50003', // SSL-enabled proxy
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        } else if (peer.ports.tcp) {
            console.debug(`Agent: Connecting to tcp://${peer.host}:${peer.ports.tcp}`);

            this.connection = new ElectrumApi({
                network: GenesisConfig.NETWORK_NAME,
                endpoint: 'wss://api.nimiqwatch.com:50002', // TCP proxy
                proxy: true,
                token: `${this.networkToTokenPrefix(GenesisConfig.NETWORK_NAME)}:${peer.host}`
            });
        } else {
            throw new Error('No suitable connection protocol and port for peer');
        }
    }

    public async sync() {
        if (this.syncing || this.synced) return;
        this.syncing = true;

        await this.handshake();
        if (!this.connection) return;

        const promise = new Promise<boolean>((resolve, reject) => {
            this.once(Event.BLOCK, () => resolve(this.synced));
            // setTimeout(reject, 10 * 1000);
        });

        this.requestHead();

        return promise;
    }

    public async getBalance(address: string) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getBalance(address);
    }

    public async getTransactionReceipts(address: string) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getReceipts(address);
    }

    public async getTransactionHistory(address: string, sinceBlockHeight = 0, knownReceipts = [] as Receipt[], limit = Infinity) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getHistory(address, sinceBlockHeight, knownReceipts, limit);
    }

    public async getTransaction(hash: string, height?: number) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getTransaction(hash, height);
    }

    public async getBlockHeader(height: number) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getBlockHeader(height);
    }

    public async getFeeHistogram() {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getFeeHistogram();
    }

    public async broadcastTransaction(rawTx: string) {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.broadcastTransaction(rawTx);
    }

    public async subscribe(addresses: string | string[]) {
        if (!this.synced) throw new Error('Agent not synced');
        if (typeof addresses === 'string') addresses = [addresses];
        for (const address of addresses) {
            // TODO: Apply timeout
            return this.connection!.subscribeReceipts(address, (receipts: Receipt[]) => this.onReceipts(address, receipts));
        }
    }

    public async getPeers() {
        if (!this.synced) throw new Error('Agent not synced');
        // TODO: Apply timeout
        return this.connection!.getPeers();
    }

    public on(event: Event, callback: Function) {
        return super.on(event, callback);
    }

    public once(event: Event, callback: Function) {
        return super.once(event, callback);
    }

    public off(event: Event, id: number) {
        return super.off(event, id);
    }

    public allOff(event: Event) {
        return super.allOff(event);
    }

    private async handshake() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }

        // TODO: Add timeout
        const features = await this.connection.getFeatures();
        if (features.genesis_hash !== GenesisConfig.GENESIS_HASH) {
            this.close();
            return false;
        }
        return true;
    }

    private requestHead() {
        if (!this.connection) {
            throw new Error('Agent not connected');
        }
        this.connection.subscribeHeaders(this.onBlock.bind(this));
    }

    private async onBlock(block: PlainBlockHeader) {
        if (this.syncing) {
            this.syncing = false;
            this.synced = true;
        }

        // TODO: Move into Client
        let prevBlock = BlockStore.get(block.blockHeight - 1);
        if (!prevBlock && block.blockHeight > 0) {
            prevBlock = await this.connection!.getBlockHeader(block.blockHeight - 1);
            BlockStore.set(prevBlock.blockHeight, prevBlock);
        }
        if (!prevBlock || prevBlock.blockHash === block.prevHash) {
            BlockStore.set(block.blockHeight, block);
            this.fire(Event.BLOCK, block);
        } else {
            console.warn('Agent: Received non-consecutive block:', block);
        }
    }

    private onReceipts(address: string, receipts: Receipt[]) {
        if (!this.knownReceipts.has(address)) {
            // This is the initial callback after subscribing and is used to store the current state
            this.knownReceipts.set(address, new Map(receipts.map(receipt => [receipt.transactionHash, receipt])));
            return;
        }

        const knownReceipts = this.knownReceipts.get(address)!;

        // Check which receipts have changed and request those transactions
        for (const receipt of receipts) {
            const knownReceipt = knownReceipts.get(receipt.transactionHash);
            if (knownReceipt && knownReceipt.blockHeight === receipt.blockHeight) continue;

            // TODO: Use already received transactions if available to reduce network requests
            // const storedTransaction = TransactionStore.get(receipt.transactionHash);
            const storedBlock = BlockStore.get(receipt.blockHeight);

            // TODO: Differentiate between 'transaction-added' and 'transaction-mined'? If not here, somewhere else?

            this.connection!.getTransaction(receipt.transactionHash, storedBlock || receipt.blockHeight).then(tx => this.fire(Event.TRANSACTION, tx));
        }
    }

    private close() {
        // this.connection.close();
        this.connection = null;
        this.syncing = false;
        this.synced = false;
    }

    private networkToTokenPrefix(name: string) {
        if (name === Network.MAIN) return 'mainnet';
        if (name === Network.TEST) return 'testnet';
    }
}
