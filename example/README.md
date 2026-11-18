# Electrum API for Browsers: Example App

This example is a [Svelte](https://svelte.dev) app built with [Vite](https://vite.dev), set up like
`npm create vite` with the `svelte` option.

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

Navigate to [localhost:5173](http://localhost:5173). You should see the app running
and displaying the latest Bitcoin block height and how long ago it was mined.
