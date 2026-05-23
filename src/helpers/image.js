const CLOUDINARY_UPLOAD_SEGMENT = '/image/upload/';
const TRANSFORMATION_PART = /^[a-z][a-z0-9]*_[^/]+$/i;
const TRANSFORMATION_KEYS = new Set([
    'a',
    'ar',
    'b',
    'bo',
    'c',
    'co',
    'dpr',
    'e',
    'f',
    'fl',
    'g',
    'h',
    'l',
    'o',
    'q',
    'r',
    't',
    'u',
    'w',
    'x',
    'y',
    'z',
]);

const normalizeSize = (value) => {
    const size = Math.round(Number(value));
    return Number.isFinite(size) && size > 0 ? size : null;
};

const isVersionSegment = (segment) => /^v\d+$/.test(segment);

const isTransformationSegment = (segment) => (
    segment
        .split(',')
        .every((part) => (
            TRANSFORMATION_PART.test(part) &&
            TRANSFORMATION_KEYS.has(part.slice(0, part.indexOf('_')))
        ))
);

export function optimizeCloudinary(url, width = 150, options = {}) {
    if (!url || typeof url !== 'string') return url;

    const uploadIndex = url.indexOf(CLOUDINARY_UPLOAD_SEGMENT);
    if (uploadIndex === -1 || !url.includes('cloudinary.com')) return url;

    const baseUrl = url.slice(0, uploadIndex + CLOUDINARY_UPLOAD_SEGMENT.length);
    const rest = url.slice(uploadIndex + CLOUDINARY_UPLOAD_SEGMENT.length);
    const parts = rest.split('/');
    let pathStartsAt = 0;

    while (
        pathStartsAt < parts.length &&
        !isVersionSegment(parts[pathStartsAt]) &&
        isTransformationSegment(parts[pathStartsAt])
    ) {
        pathStartsAt += 1;
    }

    const imagePath = parts.slice(pathStartsAt).join('/');
    if (!imagePath) return url;

    const targetWidth = normalizeSize(width);
    const targetHeight = normalizeSize(options.height);
    const crop = options.crop || (targetHeight ? 'fill' : 'limit');
    const transformations = [
        targetWidth ? `w_${targetWidth}` : null,
        targetHeight ? `h_${targetHeight}` : null,
        `c_${crop}`,
        options.gravity ? `g_${options.gravity}` : null,
        'q_auto',
        'f_auto',
    ].filter(Boolean);

    return `${baseUrl}${transformations.join(',')}/${imagePath}`;
}
