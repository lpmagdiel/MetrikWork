const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnopqrstuvwxyz';
const DIGITS = '23456789';
const SYMBOLS = '!@#$%^&*-_=+';

const ALL_CHARACTERS = `${UPPERCASE}${LOWERCASE}${DIGITS}${SYMBOLS}`;

export const DEFAULT_GENERATED_PASSWORD_LENGTH = 14;

/**
 * Genera una contraseña aleatoria segura para entregar al usuario.
 *
 * Garantiza al menos una mayúscula, una minúscula, un número y un símbolo, y
 * evita caracteres que se confunden entre sí (0/O, 1/l/I).
 */
export function generateSecurePassword(length = DEFAULT_GENERATED_PASSWORD_LENGTH) {
    const size = Math.max(12, Math.min(32, Number(length) || DEFAULT_GENERATED_PASSWORD_LENGTH));
    const groups = [pickRandom(UPPERCASE), pickRandom(LOWERCASE), pickRandom(DIGITS), pickRandom(SYMBOLS)];
    const characters = [...groups];

    while (characters.length < size) {
        characters.push(pickRandom(ALL_CHARACTERS));
    }

    return shuffle(characters).join('');
}

/**
 * Calcula una estimación de la robustez de una contraseña.
 */
export function getPasswordStrength(password) {
    const value = String(password ?? '');
    if (!value) return { score: 0, label: 'Sin contraseña' };

    let score = 0;
    if (value.length >= 8) score += 1;
    if (value.length >= 12) score += 1;
    if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score += 1;
    if (/\d/.test(value)) score += 1;
    if (/[^\w\s]/.test(value)) score += 1;
    if (value.length >= 16) score += 1;

    if (score <= 2) return { score, label: 'Débil' };
    if (score <= 4) return { score, label: 'Aceptable' };
    return { score, label: 'Segura' };
}

function pickRandom(source) {
    return source[randomIndex(source.length)];
}

function randomIndex(length) {
    if (length <= 0) return 0;

    const cryptoApi = globalThis.crypto;
    if (cryptoApi?.getRandomValues) {
        const buffer = new Uint32Array(1);
        cryptoApi.getRandomValues(buffer);
        return buffer[0] % length;
    }

    return Math.floor(Math.random() * length);
}

function shuffle(characters) {
    const result = [...characters];

    for (let index = result.length - 1; index > 0; index -= 1) {
        const target = randomIndex(index + 1);
        [result[index], result[target]] = [result[target], result[index]];
    }

    return result;
}
