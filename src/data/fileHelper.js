/**
 * 
 * @param {string} file 
 * @param {string} preset 
 * @returns 
 */
const DEFAULT_CLOUDINARY_CLOUD_NAME =
    import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ||
    import.meta.env.CLOUDINARY_CLOUD_NAME ||
    'lpzmagdiel';

const DEFAULT_CLOUDINARY_PRESET =
    import.meta.env.VITE_CLOUDINARY_PRESET ||
    import.meta.env.CLOUDINARY_PRESET ||
    'MetricWork';

export const uploader = async (file, preset = DEFAULT_CLOUDINARY_PRESET) => {
    const cloudName = DEFAULT_CLOUDINARY_CLOUD_NAME;
    const uploadPreset = preset;

    if (!cloudName || !uploadPreset) {
        throw new Error('Cloudinary no está configurado correctamente');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let message = 'Error al subir la imagen';
            try {
                const errorData = await response.json();
                message = errorData.error?.message || errorData.error || message;
            } catch {
                // Some network/proxy failures do not return JSON.
            }
            throw new Error(message);
        }

        const result = await response.json();
        return result.secure_url;
    } catch (error) {
        console.error('Error en uploader:', error);
        throw error;
    }
}

/**
 * Extrae el public_id de una URL de Cloudinary
 * @param {string} url 
 * @returns {string|null}
 */
export const getPublicIdFromUrl = (url) => {
    if (!url || !url.includes('cloudinary.com')) return null;
    
    const parts = url.split('/');
    const uploadIndex = parts.indexOf('upload');
    if (uploadIndex === -1) return null;
    
    // Saltamos 'upload' y la versión (v12345678) si existe
    const afterUpload = parts.slice(uploadIndex + 1);
    if (afterUpload[0].startsWith('v') && !isNaN(afterUpload[0].substring(1))) {
        afterUpload.shift();
    }
    
    // El resto es el public_id + extensión
    const publicIdWithExt = afterUpload.join('/');
    // Quitamos la extensión (.jpg, .png, etc)
    return publicIdWithExt.split('.')[0];
}

/**
 * Elimina una imagen de Cloudinary a través de un proxy del servidor
 * @param {string} url 
 */
export const destroyer = async (url) => {
    const publicId = getPublicIdFromUrl(url);
    if (!publicId) return;

    try {
        const response = await fetch('/api/delete-cloudinary', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ publicId })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Error al eliminar la imagen');
        }
        
        return await response.json();
    } catch (error) {
        console.error('Error en destroyer:', error);
        throw error;
    }
}

/**
 * 
 * @param {string} fileURL 
 * @param {number} max 
 * @returns 
 */
export const resizer = async (fileURL, max = 800, options = {}) => {
    const image = await loadImage(fileURL);
    const { width, height } = calcMaxDimensions(image.width, image.height, max);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    if (!ctx) {
        throw new Error('No se pudo obtener el contexto del canvas');
    }
    ctx.fillStyle = options.background || '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);
    return canvasToDataUrl(canvas, options.type || "image/webp", options.quality ?? 0.7);
}

export const resizeImageFile = async (file, max = 800, options = {}) => {
    if (!file || (file.type && !file.type.startsWith('image/'))) {
        throw new Error('Selecciona un archivo de imagen válido');
    }

    const objectUrl = URL.createObjectURL(file);

    try {
        return await resizer(objectUrl, max, options);
    } finally {
        URL.revokeObjectURL(objectUrl);
    }
}

/**
 * 
 * @param {*} fileURL 
 * @returns 
 */
const loadImage = (fileURL) => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        let settled = false;
        const timeout = setTimeout(() => {
            settle(() => reject(new Error('La imagen tardó demasiado en cargar')));
        }, 15000);

        function settle(callback) {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            callback();
        }

        image.onload = () => {
            settle(() => resolve(image));
        };
        image.onerror = () => {
            settle(() => reject(new Error('El formato de imagen no es compatible')));
        };
        image.src = fileURL;
    });
}

const canvasToDataUrl = (canvas, preferredType = 'image/webp', quality = 0.7) => {
    const types = [...new Set([preferredType, 'image/jpeg', 'image/png'])].filter(Boolean);

    for (const type of types) {
        const dataUrl = canvas.toDataURL(type, quality);
        if (dataUrl.startsWith(`data:${type}`)) return dataUrl;
    }

    return canvas.toDataURL();
}

/**
 * 
 * @param {number} width 
 * @param {number} height 
 * @param {number} max 
 * @returns 
 */
const calcMaxDimensions = (width, height, max) => {
    const maxOrintation = width > height ? width : height;
    if (maxOrintation <= max) {
        return { width, height };
    }
    const proportion = max / maxOrintation;
    const newSize = {
        width: Math.floor(width * proportion),
        height: Math.floor(height * proportion)
    };
    return newSize;
}


/**
 * 
 * @param {*} file 
 * @returns 
 */
export const cropToSquare = async (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        const size = Math.min(img.width, img.height);

        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error("No se pudo obtener el contexto del canvas"));
          return;
        }

        ctx.drawImage(
          img,
          startX, startY, size, size,
          0, 0, size, size
        );
        resolve(canvas.toDataURL());
        URL.revokeObjectURL(objectUrl);
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("El formato de imagen no es compatible"));
      };
      img.src = objectUrl;
    });
}
