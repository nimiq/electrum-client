<main>
	<h1>Hello ElectrumX!</h1>

	<p>Consensus:</p>
	<span>{ consensus }</span>

	<p>Latest Bitcoin block:</p>
	<code>#{head ? head.blockHeight : '...'} ({timeago} ago)</code><br>
	<a href="{`https://blockstream.info/block/${head ? head.blockHash : ''}`}">
		<code>{head ? head.blockHash : '...'}</code>
	</a>
</main>

<script>
	import { ElectrumClient, GenesisConfig } from '../..';
	import { hexToBytes, bytesToHex } from '../..';
	import { BlockStore } from '../..';

	window.hexToBytes = hexToBytes;
	window.bytesToHex = bytesToHex;
	window.BlockStore = BlockStore;

	let consensus = 'connecting';
	let head = null;

	GenesisConfig.main();

	const client = new ElectrumClient();
	window.client = client;
	client.addConsensusChangedListener(state => {
		console.log("Consensus:", state);
		consensus = state;
	});
	client.addHeadChangedListener(block => {
		console.log("Block:", block);
		head = block;
	});

	// Create self-updating timeago counter
	let now = 0;
	function updateNow() {
		now = Math.floor(Date.now() / 1000);
	}
	setInterval(updateNow, 1000);
	updateNow();

	$: timeagoSecs = head ? now - head.timestamp : 0;
	$: timeago = `${Math.floor(timeagoSecs / 60).toString().padStart(2, '0')}m${Math.floor(timeagoSecs % 60).toString().padStart(2, '0')}s`
</script>

<style>
	main {
		text-align: center;
		padding: 1em;
		max-width: 240px;
		margin: 0 auto;
	}

	h1 {
		color: #ff3e00;
		font-size: 4em;
		font-weight: 100;
	}

	@media (min-width: 640px) {
		main {
			max-width: none;
		}
	}
</style>
