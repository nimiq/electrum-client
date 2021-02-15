import * as BitcoinJS from 'bitcoinjs-lib';
import { PlainTransaction, PlainBlockHeader, PlainInput, PlainOutput } from './types';
export declare function blockHeaderToPlain(header: string | BitcoinJS.Block, height: number): PlainBlockHeader;
export declare function transactionToPlain(tx: string | BitcoinJS.Transaction, network: BitcoinJS.Network): PlainTransaction;
export declare function inputToPlain(input: BitcoinJS.TxInput, index: number, network: BitcoinJS.Network): PlainInput;
export declare function outputToPlain(output: BitcoinJS.TxOutput, index: number, network: BitcoinJS.Network): PlainOutput;
export declare function deriveAddressFromInput(input: BitcoinJS.TxInput, network: BitcoinJS.Network): string | undefined;
export declare function transactionFromPlain(plain: PlainTransaction): BitcoinJS.Transaction;
export declare function inputFromPlain(plain: PlainInput): BitcoinJS.TxInput;
export declare function outputFromPlain(plain: PlainOutput): BitcoinJS.TxOutput;