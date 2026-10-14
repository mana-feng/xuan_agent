import { defineConfig } from 'vite';
import uni from '@dcloudio/vite-plugin-uni';
import path from 'node:path';

// Native H5 controls preserve browser date/time pickers and form validation.
// Prefixing avoids uni-app rewriting them to its cross-platform components.
export default defineConfig({
	cacheDir: path.resolve(__dirname, '../../.local-dev/ui-draft/vite-cache'),
	server: { host: '127.0.0.1', port: 4173, strictPort: true },
	resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
	plugins: [
		uni({
			vueOptions: {
				template: {
					compilerOptions: {
						isCustomElement: (tag: string) => tag.startsWith('h5-'),
						nodeTransforms: [
							(node: any) => {
								if (node.type === 1 && node.tag.startsWith('h5-'))
									return () => {
										node.tag = node.tag.slice(3);
									};
							},
						],
					},
				},
			},
		}),
	],
});
