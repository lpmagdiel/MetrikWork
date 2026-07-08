import { describe, expect, it } from 'vitest';
import {
    SYSTEM_ADMIN_EMAILS,
    isConfiguredSystemAdmin,
    normalizeSystemAdminEmail
} from './systemAdminConfig.js';

describe('system admin configuration', () => {
    it('reconoce únicamente los correos administradores configurados', () => {
        expect(SYSTEM_ADMIN_EMAILS).toEqual([
            'lpzcode@yahoo.com',
            'lopmag.lopez@gmail.com',
            'fabiansolares719@gmail.com'
        ]);
        expect(isConfiguredSystemAdmin(' LPZCODE@YAHOO.COM ')).toBe(true);
        expect(isConfiguredSystemAdmin('usuario@example.com')).toBe(false);
    });

    it('corrige espacios accidentales al normalizar el correo', () => {
        expect(normalizeSystemAdminEmail('fabian solares719@gmail.com'))
            .toBe('fabiansolares719@gmail.com');
        expect(isConfiguredSystemAdmin('fabian solares719@gmail.com')).toBe(true);
    });
});
