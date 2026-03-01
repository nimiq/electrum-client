# Electrum API for Browsers

Access Bitcoin ElectrumX servers from browsers via a WebSocket-to-TCP proxy.

## Installation

There is no NPM package yet, so you need to set the `#build` branch of this repo
as the package source:

```bash
npm install @nimiq/electrum-client@https://github.com/nimiq/electrum-client#build
# or
yarn add @nimiq/electrum-client@https://github.com/nimiq/electrum-client#build
```

## Providing bitcoinjs-lib

@nimiq/electrum-client depends on [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib)
which makes use of built-in modules and globals native to NodeJS. For use in browsers, they must
be polyfilled as part of the build process.

Note that @nimiq/electrum-client does not include these polyfills as it does not even bundle
`bitcoinjs-lib`. This is to avoid duplicate bundling of `bitcoinjs-lib` and the polyfills,
if your app itself bundles `bitcoinjs-lib` or the polyfills, too. This way, also no polyfills
are unnecessarily included if using the library in NodeJs instead of a browser, and specific
polyfills can be picked by the app author.

Example instructions for bundling the polyfills with various bundlers follow in the next sections,
roughly sorted from easiest to set up but least preferable to harder to set up but preferable.

### browserify

[browserify](https://github.com/browserify/browserify) supports bundling apps with polyfills.
You can either use it to bundle your entire app, or to bundle just the @nimiq/electrum-client
as a standalone file. The following example bundles the lib to a standalone file:

```bash
browserify -r @nimiq/electrum-client -s ElectrumClient | terser --compress --mangle > electrum-client.min.js
```

Note that bundling to a separate file can lead to duplicate bundling of `bitcoinjs-lib` and
the polyfills between the standalone file and the rest of your app. Therefore, using a different
bundler is recommended.

### rollup with plugin `rollup-plugin-polyfill-node`

The [rollup](https://rollupjs.org/) plugin
[`rollup-plugin-polyfill-node`](https://github.com/FredKSchott/rollup-plugin-polyfill-node)
can be used to automatically handle polyfills of NodeJS features. An example configuration can be found
[here](https://github.com/nimiq/ledger-api/blob/639d7dc35c1cd121d48a9bc7a6ec814939881147/rollup.config.js).

Note that `rollup-plugin-polyfill-node` has not been updated much recently, and provided polyfills might
not be the most up-to-date. You might want to look for a more modern fork or manually provide the polyfills
yourself.

### Manually providing polyfills

Manually providing polyfills comes with a bit of extra setup but allows you to specify the polyfills yourself,
with the ability to keep them up-to-date manually.

Notable built-in NodeJS features used by bitcoinjs-lib and suggested polyfills are:
- NodeJS module `buffer` can be polyfilled by npm package
  [`buffer`](https://www.npmjs.com/package/buffer).
- NodeJS module `stream` can be polyfilled by npm package
  [`readable-stream`](https://www.npmjs.com/package/readable-stream).
- NodeJS global variable `global` can be polyfilled as
  [`globalThis`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/globalThis).
- NodeJS global variable `Buffer` can be polyfilled by automatically injecting `import { Buffer } from 'buffer'`
  wherever `Buffer` is used, as part of your build task.

Basically, npm packages `buffer` and `readable-stream` need to be added as dependencies, `stream` has to be aliased as
`readable-stream`, imports of `buffer` should be injected whenever `Buffer` is used, and `global` should be replaced
with `globalThis`.

For an example setup with [rollup](https://rollupjs.org/) check out the
[rollup.config.js of @nimiq/electrum-client's example app](https://github.com/nimiq/electrum-client/blob/master/example/rollup.config.js).

For an example setup with [webpack](https://webpack.js.org/) checkout out the
[vue.config.js of the Nimiq Hub](https://github.com/nimiq/hub/blob/master/vue.config.js).

## Use bitcoinjs-lib^7.0.0

Starting with bitcoinjs-lib version 7.0, the library depends less on NodeJS features, and for example replaces `buffer`s
with plain `Uint8Array`s. You might be able to use bitcoinjs-lib starting with version 7.0 without any polyfills, but
we have not tested that yet.

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
     * Can be either a import('bitcoinjs-lib').Network object or either of
     * 'bitcoin' | 'testnet'.
     *
     * [optional]
     * Default: (await import('bitcoinjs-lib')).networks.bitcoin
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
