import { writable } from 'svelte/store';
import { ElectrumClient, GenesisConfig } from '../..';

// Set up once per page load. This is not part of App.svelte, because hot module replacement runs it again on changes.
GenesisConfig.main();

export const client = new ElectrumClient();
window.client = client;

export const consensus = writable('connecting');
export const head = writable(null);

client.addConsensusChangedListener(state => {
	console.log("Consensus:", state);
	consensus.set(state);
});
client.addHeadChangedListener(block => {
	console.log("Block:", block);
	head.set(block);
});
