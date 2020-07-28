# Electrum API for Browsers

Access Bitcoin ElectrumX servers from browsers via a WebSocket-to-TCP proxy.

> This package is called `electrum-client` but does not yet include the actual
> client. Currently only the underlying `ElectrumWS` (websocket protocol wrapper)
> and `ElectrumApi` (higher-level API) are implemented.

## Quick Start

```javascript
import { ElectrumApi } from '@nimiq/electrum-client'

// Connect to Blockstream Bitcoin Mainnet server via NIMIQ.WATCH proxy
const electrum = new ElectrumApi();

// Get an object with confirmed and unconfirmed balances in sats
const balance = await electrum.getBalance('3G4RSoDDF2HRJujqdqHcL6oW3toETE38CH');

// Get a plain object describing a transaction
const tx = await electrum.getTransaction('18aa...b03f');
```

## Usage

### Initialization

```javascript
import { ElectrumApi } from '@nimiq/electrum-client'

const electrum = new ElectrumApi({
    /**
     * The URL and port of the Websocket-to-TCP proxy or ElectrumX server
     * with Websockets enabled.
     *
     * [optional]
     * Default: 'wss://api.nimiq.watch:50002'
     */
    endpoint: 'wss://api.nimiq.watch:50002',

    /**
     * Specify if you are using a Websocket-to-TCP proxy (set to true)
     * or a native ElectrumX websocket connection (set to false).
     *
     * [optional]
     * Default: true
     */
    proxy: true,

    /**
     * Connection token for Websockify proxies, to specify which server
     * to proxy to. Find tokens for available servers at
     * https://api.nimiqwatch.com:50002/tokens.txt.
     *
     * [optional]
     * Default: 'mainnet:electrum.blockstream.info'
     */
    token: 'mainnet:electrum.blockstream.info',

    /**
     * Which Bitcoin network to use to encode and decode addresses.
     * Can be either a BitcoinJS.Network object or either of
     * 'bitcoin' | 'testnet' | 'regtest'.
     *
     * [optional]
     * Default: BitcoinJS.network.bitcoin
     */
    network: 'bitcoin',
});
```

### Methods

Get the balance for an address:

```javascript
const balance = await electrum.getBalance('3G4RSoDDF2HRJujqdqHcL6oW3toETE38CH');

// Returns an object:
// {
//   confirmed: number,
//   unconfirmed: number,
// }
```

Get transaction receipts for an address:

```javascript
const receipts = await electrum.getReceipts('3G4RSoDDF2HRJujqdqHcL6oW3toETE38CH');

// Returns an array of objects:
// Array<{
//   blockHeight: number,
//   transactionHash: string,
//   fee?: number, // When the transaction is unconfirmed
// }>
```

Get transaction history for an address:

```javascript
const txs = await electrum.getHistory('3G4RSoDDF2HRJujqdqHcL6oW3toETE38CH');

// Returns an array of plain objects describing the address's transactions,
// including block height, block hash and timestamp.
```

Get a specific transaction:

```javascript
const tx = await electrum.getTransaction('18aa...b03f', 641085);
// The second argument (the transaction's block height) is optional.

// Returns a plain object describing the transaction. Includes the block header's
// block height, block hash and timestamp when the block height is given.
```

Get a block header for a block height:

```javascript
const header = await electrum.getBlockHeader(641085);

// Returns a plain object describing the block header.
// {
//   blockHash: string,
//   blockHeight: number,
//   timestamp: number,
//   bits: number,
//   nonce: number,
//   version: number,
//   weight: number,
//   prevHash: string | null,
//   merkleRoot: string | null,
// }
```

Broadcast a raw transaction to the network:

```javascript
const tx = await electrum.broadcastTransaction('0012...13d9');

// Returns a plain object describing the broadcast transaction.
// Throws an error on failure.
```

Subscribe for changing receipts for an address:

```javascript
await electrum.subscribeReceipts('3G4RSoDDF2HRJujqdqHcL6oW3toETE38CH', (receipts) => {
    // See the `getReceipts` function for the format of `receipts`.
});
// Calls the callback with the current receipts and whenever the receipts change
```

Subscribe to blockchain head changes:

```javascript
await electrum.subscribeHeaders((blockHeader) => {
    // See the `getBlockHeader` method for the format of `blockHeader`
});
// Calls the callback with the current header and whenever the header changes
```

## Websockify

This library uses [Websockify](https://github.com/novnc/websockify) as a WebSocket-to-TCP
proxy server for communicating with ElectrumX servers. Most ElectrumX server implementations
support native websocket connections by now, but no publicly listed server has them
enabled.

If you want to use your own ElectrumX server and have native websockets enabled,
you must set the `proxy` setting to `false` (Websockify requires appending a line-break
(`\n`) character at the end of messages, but native ElectrumX websockets do not).

A public Websockify instance is running at https://api.nimiqwatch.com:50002. You
can see the Electrum servers that it can proxy to [here](https://api.nimiqwatch.com:50002/tokens.txt).
