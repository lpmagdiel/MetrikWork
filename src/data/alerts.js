import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const confirmButtonColor = '#111827';
const cancelButtonColor = '#6b7280';
const dangerButtonColor = '#dc2626';

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

export function showAlert({ title, text, html, icon = 'info', confirmButtonText = 'Aceptar', timer } = {}) {
    return Swal.fire({
        title,
        text,
        html,
        icon,
        timer,
        confirmButtonText,
        confirmButtonColor,
    });
}

export function showSuccessAlert(title, text, options = {}) {
    return showAlert({ title, text, icon: 'success', ...options });
}

export function showErrorAlert(title, text, options = {}) {
    return showAlert({ title, text, icon: 'error', ...options });
}

export function showInfoAlert(title, text, options = {}) {
    return showAlert({ title, text, icon: 'info', ...options });
}

export async function confirmAlert({
    title,
    text,
    html,
    icon = 'warning',
    confirmButtonText = 'Sí, continuar',
    cancelButtonText = 'Cancelar',
    danger = false,
} = {}) {
    const result = await Swal.fire({
        title,
        text,
        html,
        icon,
        showCancelButton: true,
        confirmButtonText,
        cancelButtonText,
        confirmButtonColor: danger ? dangerButtonColor : confirmButtonColor,
        cancelButtonColor,
        reverseButtons: true,
    });

    return result.isConfirmed;
}

export async function promptAlert({
    title,
    text,
    input = 'text',
    inputLabel,
    inputPlaceholder,
    confirmButtonText = 'Aceptar',
    cancelButtonText = 'Cancelar',
    inputValue = '',
    requiredMessage = 'Este campo es obligatorio',
} = {}) {
    const result = await Swal.fire({
        title,
        text,
        input,
        inputLabel,
        inputPlaceholder,
        inputValue,
        showCancelButton: true,
        confirmButtonText,
        cancelButtonText,
        confirmButtonColor,
        cancelButtonColor,
        reverseButtons: true,
        inputValidator: (value) => {
            if (!String(value || '').trim()) return requiredMessage;
            return null;
        },
    });

    return result.isConfirmed ? String(result.value || '').trim() : null;
}

export function showUpdateFeaturesAlert(updateData) {
    const features = (updateData?.features || [])
        .map((feature) => `<li>${escapeHtml(feature)}</li>`)
        .join('');

    return showAlert({
        title: updateData?.message || 'Novedades de MetricWork',
        html: features ? `<ul class="swal-feature-list">${features}</ul>` : '',
        icon: 'info',
        confirmButtonText: 'Cerrar',
    });
}
