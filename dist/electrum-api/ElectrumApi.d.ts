import * as BitcoinJS from 'bitcoinjs-lib';
import { Balance, PlainBlockHeader, PlainTransaction, Receipt, PeerFeatures, Peer } from './types';
export declare type ElectrumApiOptions = {
    endpoint?: string;
    network: BitcoinJS.Network;
    proxy?: boolean;
    token?: string;
    reconnect?: boolean;
};
export declare class ElectrumApi {
    private options;
    private socket;
    constructor(options?: Omit<ElectrumApiOptions, 'network'> & {
        network?: 'bitcoin' | 'testnet' | BitcoinJS.Network;
    });
    getBalance(address: string): Promise<Balance>;
    getReceipts(addressOrScriptHash: string): Promise<Receipt[]>;
    getTransaction(hash: string, block?: PlainBlockHeader): Promise<PlainTransaction>;
    proofTransaction(hash: string, block: PlainBlockHeader): Promise<boolean>;
    getTransactionMerkleRoot(hash: string, height: number): Promise<string>;
    getBlockHeader(height: number): Promise<PlainBlockHeader>;
    estimateFee(targetBlocks: number): Promise<number>;
    getFeeHistogram(): Promise<Array<[number, number]>>;
    getRelayFee(): Promise<number>;
    broadcastTransaction(rawTx: string): Promise<PlainTransaction>;
    subscribeReceipts(address: string, callback: (receipts: Receipt[]) => any): Promise<void>;
    subscribeHeaders(callback: (header: PlainBlockHeader) => any): Promise<void>;
    setProtocolVersion(clientName: string, protocolVersion: string): Promise<string[]>;
    getFeatures(): Promise<PeerFeatures>;
    getPeers(): Promise<Peer[]>;
    ping(): Promise<null>;
    close(reason: string): void;
    private addressToScriptHash;
}
