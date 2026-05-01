<script>
    let { message, duration, show = $bindable(false), onConfirm} = $props();

    const onCancel = () => {
        show = false;
    };

    $effect(() => {
        if (show) {
            setTimeout(() => {
                show = false;
            }, duration);
        }
    });
</script>

<div class="confirm-toast" class:show={show}>
    <div class="confirm-toast-content">
        <div class="confirm-toast-message">
            <p>{message}</p>
        </div>
        <div class="confirm-toast-actions">
            <button class="confirm-toast-btn confirm-toast-btn-cancel" onclick={onCancel}>Cancelar</button>
            <button class="confirm-toast-btn confirm-toast-btn-confirm" onclick={onConfirm}>Confirmar</button>
        </div>
    </div>
</div>

<style>
    .confirm-toast {
        position: fixed;
        bottom: var(--floating-action-bottom);
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 12px;
        padding: 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        display: none;
        z-index: 1000;
    }

    .confirm-toast.show {
        display: block;
    }

    .confirm-toast-content {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .confirm-toast-message {
        display: flex;
        flex-direction: column;
    }

    .confirm-toast-message p {
        margin: 0;
        font-size: 14px;
        color: #333;
    }

    .confirm-toast-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
    }

    .confirm-toast-btn {
        background: white;
        border: none;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
    }

    .confirm-toast-btn-cancel {
        color: #666;
    }

    .confirm-toast-btn-confirm {
        color: #4CAF50;
    }
</style>
