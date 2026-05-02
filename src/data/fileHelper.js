/**
 * 
 * @param {string} file 
 * @param {string} preset 
 * @returns 
 */
export const uploader = async (file, preset = 'MetricWork') => {
    const cloudName = 'lpzmagdiel';
    const uploadPreset = preset;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', uploadPreset);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Error al subir la imagen');
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
export const resizer = async (fileURL, max = 800) => {
    const image = await loadImage(fileURL);
    const { width, height } = calcMaxDimensions(image.width, image.height, max);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = width;
    canvas.height = height;
    if (!ctx) {
        throw new Error('No se pudo obtener el contexto del canvas');
    }
    ctx.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL();
}

/**
 * 
 * @param {*} fileURL 
 * @returns 
 */
const loadImage = (fileURL) => {
    return new Promise((resolve) => {
        const image = new Image();
        image.src = fileURL;
        image.onload = () => {
            resolve(image);
        };
    });
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
      img.src = URL.createObjectURL(file);

      img.onload = () => {
        const size = Math.min(img.width, img.height);

        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;

        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("No se pudo obtener el contexto del canvas"));
          return;
        }

        ctx.drawImage(
          img,
          startX, startY, size, size,
          0, 0, size, size
        );
        resolve(canvas.toDataURL());
      };
      img.onerror = reject;
    });
}