export declare type Balance = {
    confirmed: number;
    unconfirmed: number;
};
export declare type Receipt = {
    blockHeight: number;
    transactionHash: string;
    fee?: number;
};
export declare type PlainInput = {
    script: string;
    transactionHash: string;
    address: string | null;
    witness: Array<number | string>;
    index: number;
    outputIndex: number;
    sequence: number;
};
export declare type PlainOutput = {
    script: string;
    address: string | null;
    value: number;
    index: number;
};
export declare type PlainTransaction = {
    transactionHash: string;
    inputs: PlainInput[];
    outputs: PlainOutput[];
    version: number;
    vsize: number;
    isCoinbase: boolean;
    weight: number;
    locktime: number;
    replaceByFee: boolean;
};
export declare type PlainBlockHeader = {
    blockHash: string;
    blockHeight: number;
    timestamp: number;
    bits: number;
    nonce: number;
    version: number;
    weight: number;
    prevHash: string | null;
    merkleRoot: string | null;
};
export declare type PeerFeatures = {
    hosts: {
        [hostname: string]: {
            tcp_port: number | null;
            ssl_port: number | null;
            wss_port: number | null;
        };
    };
    genesis_hash: string;
    hash_function: string;
    server_version: string;
    protocol_max: string;
    protocol_min: string;
    pruning: number | null;
};
export declare type Peer = {
    ip: string;
    host: string;
    version: string;
    ports: {
        tcp: number | null;
        ssl: number | null;
        wss: number | null;
    };
    pruningLimit?: number;
};