import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [
        svelte({
            // El plugin controla automáticamente `generate`; solo añadimos
            // ajustes que no rompen su funcionamiento interno.
        })
    ],
    resolve: {
        // Evita que el resolver elija el build server de Svelte.
        conditions: ['browser']
    },
    test: {
        environment: 'happy-dom',
        globals: true,
        setupFiles: ['./src/test/setup.js'],
        include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: [
                'dist/**',
                'dev-dist/**',
                'node_modules/**',
                'src/test/**',
                '**/*.config.js',
                '**/*.config.ts'
            ]
        }
    }
});