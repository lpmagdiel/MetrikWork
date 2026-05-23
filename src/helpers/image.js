export function optimizeCloudinary(url, width = 150) {
    if (!url || typeof url !== 'string' || !url.includes('cloudinary.com/image/upload')) {
        return url;
    }
    
    // Si ya está optimizada con auto formato y calidad, la devolvemos
    if (url.includes('q_auto') && url.includes('f_auto')) {
        return url;
    }

    // Dividimos la URL por /upload/
    const [baseUrl, rest] = url.split('/upload/');
    
    // Verificamos si ya tiene transformaciones
    const parts = rest.split('/');
    let pathStartsAt = 0;
    
    // Si la primera parte después de upload tiene guión bajo y no empieza por v (versión)
    if (parts.length > 1 && parts[0].includes('_') && !parts[0].match(/^v\d+$/)) {
        pathStartsAt = 1; // Saltamos la transformación existente
    }
    
    const imagePath = parts.slice(pathStartsAt).join('/');
    
    // Inyectamos las transformaciones de optimización
    return `${baseUrl}/upload/w_${width},c_fill,q_auto,f_auto/${imagePath}`;
}
