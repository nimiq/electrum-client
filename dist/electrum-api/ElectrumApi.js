import * as BitcoinJS from 'bitcoinjs-lib';
import { ElectrumWS, bytesToHex, hexToBytes, } from '../electrum-ws/index';
import { transactionToPlain, blockHeaderToPlain, } from './helpers';
export class ElectrumApi {
    constructor(options = {}) {
        if (typeof options.network === 'string') {
            options.network = BitcoinJS.networks[options.network];
        }
        this.options = options;
        const wsOptions = {};
        if ('proxy' in this.options)
            wsOptions.proxy = this.options.proxy;
        if ('token' in this.options)
            wsOptions.token = this.options.token;
        if ('reconnect' in this.options)
            wsOptions.reconnect = this.options.reconnect;
        this.socket = new ElectrumWS(this.options.endpoint, wsOptions);
    }
    async getBalance(address) {
        return this.socket.request('blockchain.scripthash.get_balance', await this.addressToScriptHash(address));
    }
    async getReceipts(addressOrScriptHash) {
        const receipts = await this.socket.request('blockchain.scripthash.get_history', addressOrScriptHash.length === 64
            ? addressOrScriptHash
            : await this.addressToScriptHash(addressOrScriptHash));
        receipts.sort((a, b) => (Math.max(0, b.height) || Number.MAX_SAFE_INTEGER) - (Math.max(0, a.height) || Number.MAX_SAFE_INTEGER));
        return receipts.map((r) => ({
            blockHeight: r.height,
            transactionHash: r.tx_hash,
            ...(r.fee ? { fee: r.fee } : {}),
        }));
    }
    async getTransaction(hash, block) {
        if (block)
            this.proofTransaction(hash, block);
        const raw = await this.socket.request('blockchain.transaction.get', hash);
        return transactionToPlain(raw);
    }
    async proofTransaction(hash, block) {
        const transactionMerkleRoot = await this.getTransactionMerkleRoot(hash, block.blockHeight);
        if (transactionMerkleRoot !== block.merkleRoot) {
            throw new Error(`Invalid transaction merkle proof for block height: ${hash}, ${block.blockHeight}`);
        }
        return true;
    }
    async getTransactionMerkleRoot(hash, height) {
        const proof = await this.socket.request('blockchain.transaction.get_merkle', hash, height);
        if (proof.block_height !== height) {
            throw new Error('Invalid reference block height received in transaction merkle proof');
        }
        let i = proof.pos;
        let node = hexToBytes(hash).reverse();
        for (const pairHash of proof.merkle) {
            const pairNode = hexToBytes(pairHash).reverse();
            const concatenated = new Uint8Array(i % 2 === 0
                ? [...node, ...pairNode]
                : [...pairNode, ...node]);
            node = new Uint8Array(await crypto.subtle.digest('SHA-256', await crypto.subtle.digest('SHA-256', concatenated)));
            i = Math.floor(i / 2);
        }
        return bytesToHex(node.reverse());
    }
    async getBlockHeader(height) {
        const raw = await this.socket.request('blockchain.block.header', height);
        return blockHeaderToPlain(raw, height);
    }
    async getFeeHistogram() {
        return this.socket.request('mempool.get_fee_histogram');
    }
    async broadcastTransaction(rawTx) {
        const hash = await this.socket.request('blockchain.transaction.broadcast', rawTx);
        const tx = transactionToPlain(rawTx);
        if (hash === tx.transactionHash)
            return tx;
        else
            throw new Error(hash);
    }
    async subscribeReceipts(address, callback) {
        this.socket.subscribe('blockchain.scripthash', async (scriptHash, status) => {
            callback(!status ? [] : await this.getReceipts(scriptHash));
        }, await this.addressToScriptHash(address));
    }
    async subscribeHeaders(callback) {
        this.socket.subscribe('blockchain.headers', async (headerInfo) => {
            callback(blockHeaderToPlain(headerInfo.hex, headerInfo.height));
        });
    }
    async getFeatures() {
        return this.socket.request('server.features');
    }
    async getPeers() {
        const peers = await this.socket.request('server.peers.subscribe');
        return peers.map(peer => {
            const ip = peer[0];
            const host = peer[1];
            let version = '';
            let pruningLimit = undefined;
            let tcp = null;
            let ssl = null;
            let wss = null;
            for (const meta of peer[2]) {
                switch (meta.charAt(0)) {
                    case 'v':
                        version = meta.substring(1);
                        break;
                    case 'p':
                        pruningLimit = Number.parseInt(meta.substring(1), 10);
                        break;
                    case 't':
                        {
                            if (meta.substring(1).length === 0) {
                                switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                    case BitcoinJS.networks.testnet:
                                        tcp = 60001;
                                        break;
                                    default:
                                        tcp = 50001;
                                        break;
                                }
                            }
                            else {
                                tcp = Number.parseInt(meta.substring(1), 10);
                            }
                        }
                        break;
                    case 's':
                        {
                            if (meta.substring(1).length === 0) {
                                switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                    case BitcoinJS.networks.testnet:
                                        ssl = 60002;
                                        break;
                                    default:
                                        ssl = 50002;
                                        break;
                                }
                            }
                            else {
                                ssl = Number.parseInt(meta.substring(1), 10);
                            }
                        }
                        break;
                    case 'w':
                        {
                            if (meta.substring(1).length === 0) {
                                switch (this.options.network || BitcoinJS.networks.bitcoin) {
                                    case BitcoinJS.networks.testnet:
                                        wss = 60004;
                                        break;
                                    default:
                                        wss = 50004;
                                        break;
                                }
                            }
                            else {
                                wss = Number.parseInt(meta.substring(1), 10);
                            }
                        }
                        break;
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
    close() {
        this.socket.close();
    }
    async addressToScriptHash(addr) {
        const outputScript = BitcoinJS.address.toOutputScript(addr, this.options.network);
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', outputScript));
        return bytesToHex(hash.reverse());
    }
}
