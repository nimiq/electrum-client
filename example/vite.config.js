import { defineConfig, searchForWorkspaceRoot } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
	plugins: [svelte()],
	server: {
		fs: {
			// Allow serving the library's files, as the app imports it from the parent folder.
			allow: [searchForWorkspaceRoot(process.cwd()), '..'],
		},
	},
});
