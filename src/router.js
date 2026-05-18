import { writable } from 'svelte/store';

export const normalizePath = (path) => {
    const rawPath = typeof path === 'string' && path.trim() ? path.trim() : '/';
    const absolutePath = rawPath.startsWith('/') ? rawPath : '/' + rawPath;

    try {
        const url = new URL(absolutePath, window.location.origin);
        const pathname = url.pathname.replace(/\/+$/, '') || '/';
        return `${pathname}${url.search}${url.hash}`;
    } catch (err) {
        return absolutePath.replace(/\/+$/, '') || '/';
    }
};

export const currentPath = writable(normalizePath(window.location.pathname + window.location.search + window.location.hash));

export const navigateTo = (path) => {
    const cleanPath = normalizePath(path);
    currentPath.set(cleanPath);

    const currentUrl = window.location.pathname + window.location.search + window.location.hash;
    if (currentUrl !== cleanPath) {
        window.history.pushState({}, '', cleanPath);
    }
};

window.addEventListener('popstate', () => {
    currentPath.set(normalizePath(window.location.pathname + window.location.search + window.location.hash));
});

// Interceptar clicks en enlaces para hacer navegación SPA sin recargar
window.addEventListener('click', (e) => {
    // Buscar el enlace más cercano al clic
    const a = e.target.closest('a');
    
    // Si no es un enlace, no tiene href, tiene target="_blank" o atributo download, dejar que el navegador actúe normal
    if (!a || !a.href || a.target === '_blank' || a.hasAttribute('download')) return;

    // Solo interceptar si el enlace es del mismo origen (mismo dominio)
    try {
        const url = new URL(a.href);
        if (url.origin === window.location.origin) {
            e.preventDefault();
            navigateTo(url.pathname + url.search + url.hash);
        }
    } catch (err) {
        // Ignorar errores de parsing de URL
    }
});
