import '@testing-library/jest-dom/vitest';

// happy-dom no implementa la Web Animations API, que usan las transiciones de
// Svelte (por ejemplo al abrir el detalle de una tarea). Se añade un stub
// mínimo para que los componentes con transiciones se puedan renderizar.
if (typeof Element !== 'undefined' && !Element.prototype.animate) {
    Element.prototype.animate = function animate() {
        const animation = {
            finished: Promise.resolve(),
            onfinish: null,
            oncancel: null,
            cancel() {},
            finish() {},
            pause() {},
            play() {},
            reverse() {},
            addEventListener() {},
            removeEventListener() {},
        };
        // Svelte espera que la animación termine para continuar la transición.
        queueMicrotask(() => {
            if (typeof animation.onfinish === 'function') animation.onfinish();
        });
        return animation;
    };
}
