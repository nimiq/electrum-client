export type Balance = {
    confirmed: number,
    unconfirmed: number,
}

export type Receipt = {
    blockHeight: number,
    transactionHash: string,
    fee?: number,
}

export type PlainInput = {
    script: string,
    transactionHash: string,
    address: string | null,
    witness: Array<number | string>,
    index: number,
    outputIndex: number,
}

export type PlainOutput = {
    script: string,
    address: string,
    value: number,
    index: number,
}

export type PlainTransaction = {
    transactionHash: string,
    inputs: PlainInput[],
    outputs: PlainOutput[],
    version: number,
    vsize: number,
    isCoinbase: boolean,
    weight: number,
    blockHash: string | null,
    blockHeight: number | null,
    timestamp: number | null,
}

export type PlainBlockHeader = {
    blockHash: string,
    blockHeight: number,
    timestamp: number,
    bits: number,
    nonce: number,
    version: number,
    weight: number,
    prevHash: string | null,
    merkleRoot: string | null,
}
