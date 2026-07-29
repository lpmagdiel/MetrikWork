export const updateData = {
  version: "0.9.88", // Actualiza este valor en cada release
  message: "Novedades de MetricWork 0.9.88 - Beta",
  features: [
    "Adjuntar tickets y facturas como imagen en los gastos manuales: hasta 10 fotos por gasto con vista previa, miniaturas en la lista y lightbox a pantalla completa con navegación.",
    "Búsqueda de gastos por el nombre del archivo adjunto y limpieza automática de las imágenes borradas en Cloudinary al editar o eliminar el gasto.",
    "Corrección del error en consola 'A ServiceWorker intercepted the request and encountered an unexpected error' al combinar el Service Worker PWA con los canales de Firestore.",
    "Firestore fuerza long-polling para ser 100% compatible con el Service Worker y se excluyen los endpoints de Firebase del caché y del navigateFallback de Workbox.",
    "Scroll vertical restaurado en la pantalla de gastos en iPhone gracias a un contexto de altura y scroll interno con inercia táctil.",
  ]
};
