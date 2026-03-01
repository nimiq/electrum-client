import svelte from 'rollup-plugin-svelte';
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import alias from '@rollup/plugin-alias';
import virtual from '@rollup/plugin-virtual';
import inject from '@rollup/plugin-inject';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';

const production = !process.env.ROLLUP_WATCH;

function serve() {
	let server;

	function toExit() {
		if (server) server.kill(0);
	}

	return {
		writeBundle() {
			if (server) return;
			server = require('child_process').spawn('npm', ['run', 'start', '--', '--dev'], {
				stdio: ['ignore', 'inherit', 'inherit'],
				shell: true
			});

			process.on('SIGTERM', toExit);
			process.on('exit', toExit);
		}
	};
}

export default {
	input: 'src/main.js',
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file: 'public/build/bundle.js',
	},
	plugins: [
		svelte({
			// enable run-time checks when not in production
			dev: !production,
			// we'll extract any component CSS out into
			// a separate file - better for performance
			css: css => {
				css.write('public/build/bundle.css');
			}
		}),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration -
		// consult the documentation for details:
		// https://github.com/rollup/plugins/tree/master/packages/commonjs
		resolve({
			browser: true, // use browser versions of packages if defined in their package.json
			preferBuiltins: false, // process node builtins to use polyfill packages buffer, readable-stream, etc.
			modulePaths: `${process.cwd()}/node_modules`, // look in example's node_modules, not parent node_modules
			dedupe: ['svelte']
		}),
		commonjs(),
		json(), // required for import of bitcoin-ops/index.json imported by bitcoinjs-lib

		// Node polyfills
		alias({
			entries: {
				// Polyfill node's builtin stream module via readable-stream, which is essentially node's stream put
				// into an npm package. stream is for example used by bitcoinjs-lib > create-hash > cipher-base
				stream: 'readable-stream',
			},
		}),
		virtual({
			// Polyfill node's global.
			globalPolyfill: 'export default globalThis;',
		}),
		inject({
			// Polyfill node's global Buffer by automatically adding "import { Buffer } from 'buffer'" when node's
			// Buffer global is used. The global Buffer is for example used by bitcoinjs-lib > tiny-secp256k1.
			Buffer: ['buffer', 'Buffer'],
			// Polyfill node's global object by automatically adding "import global from 'globalPolyfill'" when node's
			// global variable 'global' is used. It is for example used by bitcoinjs-lib > randombytes.
			global: 'globalPolyfill',
		}),

		// In dev mode, call `npm run start` once
		// the bundle has been generated
		!production && serve(),

		// Watch the `public` directory and refresh the
		// browser on changes when not in production
		!production && livereload('public'),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		// production && terser(),
	],
	watch: {
		clearScreen: false
	}
};
