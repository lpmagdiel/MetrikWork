import { writable, get } from 'svelte/store';

export const currentPath = writable(window.location.hash || '#/');

export const navigateTo = (path) => {
    currentPath.set('#/' + path);
    window.location.hash = '#/' + path;
};

window.addEventListener('hashchange', () => {
    currentPath.set(window.location.hash || '#/');
});
