# Electrum API for Browsers: Example App

This example is a [Svelte](https://svelte.dev) app created from
[this template](https://github.com/sveltejs/template).

## Get running

First you need to build the ElectrumApi. In the root folder of this project, run

```bash
npm install && npm run build
# or
yarn && yarn build
```

Then change back into this `example` folder and install the dependencies:

```bash
npm install
# or
yarn
```

Then run it:

```bash
npm run dev
# or
yarn dev
```

Navigate to [localhost:5000](http://localhost:5000). You should see the app running
and displaying the latest Bitcoin block height and how long ago it was mined.

## Providing the BitcoinJS library

The [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) project is made
for usage in NodeJS. To be used in browsers, it must be built with polyfills via
Browerify:

```bash
browserify -r bitcoinjs-lib -s BitcoinJS | terser > public/bitcoinjs.min.js
```

This is done automatically for you in this example app when running the `dev` or
`build` scripts. The resulting `public/bitcoinjs.min.js` file is referenced as a
global script in `public/index.html`. The `bitcoinjs-lib` import in the library is
declared as _external_ in the [Rollup config](../rollup.config.js), so that it is
not included in the app bundle.

> I also tried to include the `bitcoinjs-lib` dependency directly via Rollup and
> polyfill it's NodeJS dependencies via the
> [`rollup-plugin-node-polyfills`](https://github.com/ionic-team/rollup-plugin-node-polyfills)
> plugin, but it was not able to correctly detect and polyfill all required NodeJS
> globals and work well together with Rollup's CommonJS plugin.
>
> If anybody wants to experiment futher in this direction, feel free to reach out!
