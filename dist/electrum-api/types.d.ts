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
    script: Uint8Array;
    transactionHash: string;
    address: string | null;
    witness: Array<number | Uint8Array>;
    index: number;
    outputIndex: number;
};
export declare type PlainOutput = {
    script: Uint8Array;
    address: string;
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
    blockHash: string | null;
    blockHeight: number | null;
    timestamp: number | null;
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
