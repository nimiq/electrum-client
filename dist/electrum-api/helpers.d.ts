import * as BitcoinJS from 'bitcoinjs-lib';
import { PlainTransaction, PlainBlockHeader } from './types';
export declare function blockHeaderToPlain(header: string | BitcoinJS.Block, height: number): PlainBlockHeader;
export declare function transactionToPlain(tx: string | BitcoinJS.Transaction, network?: BitcoinJS.Network): PlainTransaction;
export declare function transactionFromPlain(plain: PlainTransaction): BitcoinJS.Transaction;
