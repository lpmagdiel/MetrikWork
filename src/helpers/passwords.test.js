import { describe, expect, it } from 'vitest';
import {
    DEFAULT_GENERATED_PASSWORD_LENGTH,
    generateSecurePassword,
    getPasswordStrength
} from './passwords.js';

describe('generateSecurePassword', () => {
    it('genera una contraseña con la longitud por defecto', () => {
        expect(generateSecurePassword()).toHaveLength(DEFAULT_GENERATED_PASSWORD_LENGTH);
    });

    it('incluye mayúsculas, minúsculas, números y símbolos', () => {
        const password = generateSecurePassword(16);

        expect(password).toHaveLength(16);
        expect(password).toMatch(/[A-Z]/);
        expect(password).toMatch(/[a-z]/);
        expect(password).toMatch(/[0-9]/);
        expect(password).toMatch(/[^A-Za-z0-9]/);
    });

    it('no genera contraseñas iguales seguidas', () => {
        const passwords = new Set(Array.from({ length: 12 }, () => generateSecurePassword()));
        expect(passwords.size).toBeGreaterThan(1);
    });

    it('respeta el mínimo y el máximo de longitud', () => {
        expect(generateSecurePassword(4)).toHaveLength(12);
        expect(generateSecurePassword(80)).toHaveLength(32);
    });
});

describe('getPasswordStrength', () => {
    it('informa de una contraseña vacía', () => {
        expect(getPasswordStrength('')).toEqual({ score: 0, label: 'Sin contraseña' });
    });

    it('clasifica las contraseñas por robustez', () => {
        expect(getPasswordStrength('corta').label).toBe('Débil');
        expect(getPasswordStrength('Clave1234').label).toBe('Aceptable');
        expect(getPasswordStrength('Clave1234!Segura2026').label).toBe('Segura');
    });
});
