#!/usr/bin/node

const fetch = require('node-fetch');
const fs = require('fs/promises');

/**
 * Fetch seedlist from Electrum Wallet Github and convert to use in our GenesisConfig
 * @param {'main' | 'test'} network
 */
async function getSeeds(network) {
    const filename = network === 'main' ? 'servers.json' : 'servers_testnet.json';

    const electrum_seeds = await fetch(`https://raw.githubusercontent.com/spesmilo/electrum/master/electrum/${filename}`).then(res => res.json());

    const lines = [];

    for (const host in electrum_seeds) {
        // Websockify proxy does (currently) not support TOR nodes
        if (host.endsWith('.onion')) continue;

        const details = electrum_seeds[host];

        const default_ssl_port = network === 'main' ? '50002' : '60002';
        const default_tcp_port = network === 'main' ? '50001' : '60001';

        // Websockify proxy only allows standard ports
        if (details.s && details.s !== default_ssl_port) continue;
        if (details.t && details.t !== default_tcp_port) continue;

        lines.push(`{host: '${host}', ports: {wss: null, ssl: ${details.s || 'null'}, tcp: ${details.t || 'null'}}, ip: '', version: '${details.version}'},`);
    }

    return lines;
}

/**
 * Write seeds to GenesisConfig.ts file
 * @param {'main' | 'test'} network
 */
async function writeSeeds(network) {
    const lines = await getSeeds(network);

    const config = await fs.readFile('./electrum-client/GenesisConfig.ts', {
        encoding: 'utf8',
    });

    const NETWORK = network === 'main' ? 'MAINNET' : 'TESTNET'

    const startMarker = `\n                // GENERATED ${NETWORK} SEEDS >>>`;
    const endMarker = `// <<< GENERATED ${NETWORK} SEEDS\n`;

    const firstSplit = config.split(startMarker);
    const secondSplit = firstSplit[1].split(endMarker);

    const prefix = firstSplit[0];
    const suffix = secondSplit[1];

    const glue = '\n                ';

    const middle = lines.join(glue);

    const file = [prefix + startMarker, middle, endMarker + suffix].join(glue);

    await fs.writeFile('./electrum-client/GenesisConfig.ts', file, 'utf8');
}

async function main() {
    console.log('Updating mainnet seeds...');
    writeSeeds('main');

    console.log('Updating testnet seeds...');
    await writeSeeds('test');

    console.log('Done');
}

main();
