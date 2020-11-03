import * as BitcoinJS from 'bitcoinjs-lib';

import {
    ElectrumWS,
    ElectrumWSOptions,
    bytesToHex,
    hexToBytes,
} from '../electrum-ws/index';

import {
    Balance,
    PlainBlockHeader,
    PlainTransaction,
    Receipt,
    PeerFeatures,
    Peer,
} from './types';

import {
    transactionToPlain,
    blockHeaderToPlain,
} from './helpers';

export type ElectrumApiOptions = {
    endpoint?: string,
    network: BitcoinJS.Network,
    proxy?: boolean,
    token?: string,
    reconnect?: boolean;
}

export class ElectrumApi {
    private options: ElectrumApiOptions;
    private socket: ElectrumWS;

    constructor(options: Omit<ElectrumApiOptions, 'network'> & { network?: 'bitcoin' | 'testnet' | BitcoinJS.Network } = {}) {
        if (typeof options.network === 'string') {
            if (!(options.network in BitcoinJS.networks)) {
                throw new Error('Invalid network name');
            }
            options.network = BitcoinJS.networks[options.network];
        }

        this.options = {
            ...options,
            network: options.network || BitcoinJS.networks.bitcoin,
        };

        const wsOptions: Partial<ElectrumWSOptions> = {};
        if ('proxy' in this.options) wsOptions.proxy = this.options.proxy;
        if ('token' in this.options) wsOptions.token = this.options.token;
        if ('reconnect' in this.options) wsOptions.reconnect = this.options.reconnect;

        this.socket = new ElectrumWS(this.options.endpoint, wsOptions);
    }

    public async getBalance(address: string): Promise<Balance> {
        return this.socket.request('blockchain.scripthash.get_balance', await this.addressToScriptHash(address));
    }

    public async getReceipts(addressOrScriptHash: string): Promise<Receipt[]> {
        const receipts: Array<{height: number, tx_hash: string, fee?: number}> =
            await this.socket.request(
                'blockchain.scripthash.get_history',
                addressOrScriptHash.length === 64
                    ? addressOrScriptHash
                    : await this.addressToScriptHash(addressOrScriptHash),
            );

        // Sort by height DESC
        receipts.sort((a, b) => (Math.max(0, b.height) || Number.MAX_SAFE_INTEGER) - (Math.max(0, a.height) || Number.MAX_SAFE_INTEGER));

        return receipts.map((r) => ({
            blockHeight: r.height,
            transactionHash: r.tx_hash,
            ...(r.fee ? { fee: r.fee } : {}),
        }));
    }

    public async getTransaction(hash: string, block?: PlainBlockHeader): Promise<PlainTransaction> {
        if (block) this.proofTransaction(hash, block); // Throws on failed proof
        const raw: string = await this.socket.request('blockchain.transaction.get', hash);
        return transactionToPlain(raw, this.options.network);
    }

    public async proofTransaction(hash: string, block: PlainBlockHeader): Promise<boolean> {
        const transactionMerkleRoot = await this.getTransactionMerkleRoot(hash, block.blockHeight);
        if (transactionMerkleRoot !== block.merkleRoot) {
            throw new Error(`Invalid transaction merkle proof for block height: ${hash}, ${block.blockHeight}`);
        }
        return true;
    }

    public async getTransactionMerkleRoot(hash: string, height: number): Promise<string> {
        type MerkleProof = {
            block_height: number;
            merkle: string[],
            pos: number,
        };

        const proof: MerkleProof = await this.socket.request('blockchain.transaction.get_merkle', hash, height);

        if (proof.block_height !== height) {
            throw new Error('Invalid reference block height received in transaction merkle proof');
        }

        // All hashes that we have (tx hash and merkle path hashes) are in little-endian byte order and must be reversed into big-endian as we go along
        let i = proof.pos;
        let node = hexToBytes(hash).reverse();
        for (const pairHash of proof.merkle) {
            const pairNode = hexToBytes(pairHash).reverse();

            const concatenated = new Uint8Array(i % 2 === 0
                ? [...node, ...pairNode] // even index
                : [...pairNode, ...node] // uneven index
            );

            // Double SHA256 hash
            node = new Uint8Array(await crypto.subtle.digest('SHA-256', await crypto.subtle.digest('SHA-256', concatenated)));

            // Update index for the next tree level
            i = Math.floor(i / 2);
        }

        // Reverse back into little-endian byte order
        return bytesToHex(node.reverse());
    }

    public async getBlockHeader(height: number): Promise<PlainBlockHeader> {
        const raw: string = await this.socket.request('blockchain.block.header', height);

        return blockHeaderToPlain(raw, height);
    }

    public async getFeeHistogram(): Promise<Array<[number, number]>> {
        return this.socket.request('mempool.get_fee_histogram');
    }

    public async getRelayFee(): Promise<number> {
        const coins: number = await this.socket.request('blockchain.relayfee');
        return Math.round(coins * 1e8);
    }

    public async broadcastTransaction(rawTx: string): Promise<PlainTransaction> {
        const tx = transactionToPlain(rawTx, this.options.network);

        let hash: string;
        try {
            hash = await this.socket.request('blockchain.transaction.broadcast', rawTx);
        } catch (error) {
            if ((error as Error).message.includes('Transaction already in block chain')) {
                tx.onChain = true;
                return tx;
            } else throw error;
        }

        if (hash === tx.transactionHash) return tx;
        else throw new Error(hash); // Protocol v1.0 returns errors as the result string
    }

    public async subscribeReceipts(address: string, callback: (receipts: Receipt[]) => any) {
        return this.socket.subscribe(
            'blockchain.scripthash',
            async (scriptHash: string, status: string | null) => {
                callback(!status ? [] : await this.getReceipts(scriptHash));
            },
            await this.addressToScriptHash(address),
        );
    }

    public async subscribeHeaders(callback: (header: PlainBlockHeader) => any) {
        return this.socket.subscribe('blockchain.headers', (headerInfo: {height: number, hex: string}) => {
            callback(blockHeaderToPlain(headerInfo.hex, headerInfo.height));
        });
    }

    public async setProtocolVersion(clientName: string, protocolVersion: string): Promise<string[]> {
        return this.socket.request('server.version', clientName, protocolVersion);
    }

    public async getFeatures(): Promise<PeerFeatures> {
        return this.socket.request('server.features');
    }

    public async getPeers(): Promise<Peer[]> {
        const peers: Array<[string, string, string[]]> = await this.socket.request('server.peers.subscribe');

        return peers.map(peer => {
            const ip = peer[0];
            const host = peer[1];

            let version: string = '';
            let pruningLimit: number | undefined = undefined;
            let tcp: number | null = null;
            let ssl: number | null = null;
            let wss: number | null = null;

            for (const meta of peer[2]) {
                switch (meta.charAt(0)) {
                    case 'v': version = meta.substring(1); break;
                    case 'p': pruningLimit = Number.parseInt(meta.substring(1), 10); break;
                    case 't': {
                        if (meta.substring(1).length === 0) {
                            // An omitted port number means default port
                            switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                case BitcoinJS.networks.testnet: tcp = 60001; break;
                                default: tcp = 50001; break; // mainnet (bitcoin)
                            }
                        } else {
                            tcp = Number.parseInt(meta.substring(1), 10);
                        }
                    } break;
                    case 's': {
                        if (meta.substring(1).length === 0) {
                            // An omitted port number means default port
                            switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                case BitcoinJS.networks.testnet: ssl = 60002; break;
                                default: ssl = 50002; break; // mainnet (bitcoin)
                            }
                        } else {
                            ssl = Number.parseInt(meta.substring(1), 10);
                        }
                    } break;
                    case 'w': {
                        if (meta.substring(1).length === 0) {
                            // An omitted port number means default port
                            switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                case BitcoinJS.networks.testnet: wss = 60004; break;
                                default: wss = 50004; break; // mainnet (bitcoin)
                            }
                        } else {
                            wss = Number.parseInt(meta.substring(1), 10);
                        }
                    } break;
                }
            }

            return {
                ip,
                host,
                version,
                pruningLimit,
                ports: {
                    tcp,
                    ssl,
                    wss,
                },
            };
        });
    }

    public ping(): Promise<null> {
        return this.socket.request('server.ping');
    }

    public close(reason: string) {
        return this.socket.close(reason);
    }

    private async addressToScriptHash(addr: string) {
        const outputScript = BitcoinJS.address.toOutputScript(addr, this.options.network);

        // Hash with SHA256
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', outputScript));

        // Convert reversed into HEX
        return bytesToHex(hash.reverse());
    }
}
