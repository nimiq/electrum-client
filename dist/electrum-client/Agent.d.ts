import { Observable } from './Observable';
import { PlainBlockHeader, Peer, Receipt, PlainTransaction } from '../electrum-api/types';
export declare enum Event {
    BLOCK = "block",
    TRANSACTION_ADDED = "transaction-added",
    TRANSACTION_MINED = "transaction-mined",
    SYNCING = "syncing",
    SYNCED = "synced",
    CLOSE = "close"
}
export declare type ElectrumAgentOptions = {
    tcpProxyUrl: string | false;
    sslProxyUrl: string | false;
};
export declare class Agent extends Observable {
    peer: Peer;
    private options;
    private connection;
    private handshaking;
    private syncing;
    private synced;
    private orphanedBlocks;
    private knownReceipts;
    private pingInterval;
    constructor(peer: Peer, options?: Partial<ElectrumAgentOptions>);
    sync(): Promise<boolean | undefined>;
    getBalance(address: string): Promise<import("../electrum-api/types").Balance>;
    getTransactionReceipts(address: string): Promise<Receipt[]>;
    getTransaction(hash: string, block?: PlainBlockHeader): Promise<PlainTransaction>;
    getBlockHeader(height: number): Promise<PlainBlockHeader>;
    getFeeHistogram(): Promise<[number, number][]>;
    getMinimumRelayFee(): Promise<number>;
    broadcastTransaction(rawTx: string): Promise<PlainTransaction>;
    subscribe(addresses: string | string[]): Promise<void>;
    getPeers(): Promise<Peer[]>;
    close(reason: string): void;
    on(event: Event, callback: Function): number;
    once(event: Event, callback: Function): void;
    off(event: Event, id: number): void;
    allOff(event: Event): void;
    private handshake;
    private ping;
    private requestHead;
    private onBlock;
    private onReceipts;
    private networkToTokenPrefix;
}
