<script>
  import {
    notificationsStore,
    markNotificationAsRead,
    deleteNotification,
    deleteAllNotifications,
  } from "../data/stores.js";
  import { ChevronLeft, Bell, CheckCheck, Trash2 } from "lucide-svelte";
  import { currentPath } from "../router.js";
  import { fly } from "svelte/transition";
  import Toast from "../components/Toast.svelte";
  import ConfirmToast from "../components/ConfirmToast.svelte";

  let notifications = $derived($notificationsStore);
  let swipedNotificationId = $state(null);
  let showToast = $state(false);
  let showConfirmToast = $state(false);
  let messageToast = $state("");
  let typeToast = $state("");
  let unreadCount = $derived(notifications.filter((n) => !n.opened).length);

  // --- Swipe logic (native touch/pointer) ---
  const SWIPE_THRESHOLD = 60; // px mínimos para activar el swipe
  let pointerStartX = 0;
  let pointerStartY = 0;
  let activePointerId = null;

  function onPointerDown(e, notificationId) {
    // Solo el primer dedo/puntero
    if (activePointerId !== null) return;
    activePointerId = e.pointerId;
    pointerStartX = e.clientX;
    pointerStartY = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerUp(e, notificationId) {
    if (e.pointerId !== activePointerId) return;
    activePointerId = null;

    const dx = e.clientX - pointerStartX;
    const dy = e.clientY - pointerStartY;

    // Ignorar si el movimiento vertical domina (scroll)
    if (Math.abs(dy) > Math.abs(dx)) return;

    if (dx < -SWIPE_THRESHOLD) {
      // Swipe izquierda → mostrar botón delete
      swipedNotificationId = notificationId;
    } else if (dx > SWIPE_THRESHOLD) {
      // Swipe derecha → ocultar botón delete
      if (swipedNotificationId === notificationId) {
        swipedNotificationId = null;
      }
    }
  }

  function onPointerCancel(e) {
    if (e.pointerId === activePointerId) {
      activePointerId = null;
    }
  }

  // --- Acciones ---
  function formatDate(isoString) {
    if (!isoString) return "";
    const date = new Date(isoString);
    return date.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleNotificationClick(notification) {
    if (!notification.opened) {
      await markNotificationAsRead(notification.id);
    }
  }

  async function handleDelete(notificationId) {
    try {
      await deleteNotification(notificationId);
      if (swipedNotificationId === notificationId) swipedNotificationId = null;
    } catch (e) {
      messageToast = "Error al eliminar";
      typeToast = "error";
      showToast = true;
    }
  }

  function openDeleteAllConfirm() {
    showConfirmToast = true;
  }

  async function handleDeleteAll() {
    try {
      await deleteAllNotifications();
      showConfirmToast = false;
      messageToast = "Notificaciones eliminadas";
      typeToast = "success";
      showToast = true;
    } catch (e) {
      messageToast = "Error al eliminar notificaciones";
      typeToast = "error";
      showToast = true;
    }
  }

  function goBack() {
    $currentPath = "/";
  }
</script>

<div class="notifications-page">
  <Toast
    type={typeToast}
    message={messageToast}
    duration={3000}
    show={showToast}
  />
  <ConfirmToast
    message="¿Estás seguro de que deseas eliminar todas las notificaciones?"
    duration={3000}
    bind:show={showConfirmToast}
    onConfirm={handleDeleteAll}
  />
  <header>
    <button class="back-btn" onclick={goBack}>
      <ChevronLeft size={24} />
    </button>
    <div class="title-block">
      <h1>Notificaciones</h1>
      <p>
        {#if unreadCount > 0}
          {unreadCount} sin leer
        {:else}
          Todo al día
        {/if}
      </p>
    </div>
    {#if notifications.length > 0}
      <button
        class="delete-all"
        onclick={openDeleteAllConfirm}
        title="Eliminar todas"
        aria-label="Eliminar todas las notificaciones"
      >
        <Trash2 size={20} />
      </button>
    {/if}
  </header>

  {#if notifications.length > 0}
    <section class="summary-card">
      <div class="summary-icon">
        <Bell size={22} />
      </div>
      <div>
        <span class="summary-label">Centro de avisos</span>
        <strong>{notifications.length}</strong>
      </div>
      <span class="summary-badge">{unreadCount} nuevas</span>
    </section>
  {/if}

  <div class="notifications-list">
    {#if notifications.length > 0}
      {#each notifications as notification (notification.id)}
        <div
          class="notification-wrapper"
          transition:fly={{ x: -200, duration: 300 }}
          onpointerdown={(e) => onPointerDown(e, notification.id)}
          onpointerup={(e) => onPointerUp(e, notification.id)}
          onpointercancel={onPointerCancel}
        >
          <!-- Botón de fondo rojo que aparece al hacer swipe left -->
          <button
            class="delete-bg-btn"
            onclick={() => handleDelete(notification.id)}
            aria-label="Eliminar notificación"
          >
            <Trash2 size={22} />
          </button>

          <!-- Tarjeta deslizante -->
          <div
            class="card-slider"
            class:swiped={swipedNotificationId === notification.id}
          >
            <button
              class="notification-card {notification.opened ? 'read' : 'unread'}"
              onclick={() => handleNotificationClick(notification)}
            >
              <div class="icon-container">
                {#if notification.opened}
                  <CheckCheck size={20} />
                {:else}
                  <Bell size={20} />
                {/if}
              </div>
              <div class="notification-content">
                <span class="date">{formatDate(notification.date)}</span>
                <h3>{notification.title}</h3>
                <p>{notification.message}</p>
              </div>
              {#if !notification.opened}
                <span class="unread-indicator" aria-label="Sin leer"></span>
              {/if}
            </button>
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty-state">
        <div class="empty-icon">
          <Bell size={48} />
        </div>
        <h2>No tienes notificaciones</h2>
        <p>Cuando haya novedades importantes aparecerán aquí.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .notifications-page {
    padding: 24px 24px var(--bottom-nav-clearance);
    padding-top: var(--page-top-safe);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
  }

  header {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 24px;
  }

  .back-btn {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    color: var(--text-primary);
    flex-shrink: 0;
  }

  .title-block {
    flex: 1;
    min-width: 0;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .title-block p {
    margin: 4px 0 0;
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 600;
  }

  .delete-all {
    width: 44px;
    height: 44px;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--bg-danger-subtle);
    color: var(--danger-color);
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: var(--shadow-card);
    cursor: pointer;
    flex-shrink: 0;
  }

  .summary-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
    padding: 18px;
    margin-bottom: 18px;
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 14px;
  }

  .summary-icon {
    width: 48px;
    height: 48px;
    border-radius: var(--radius-md);
    background: var(--accent-color);
    color: var(--accent-ink);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .summary-label {
    display: block;
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .summary-card strong {
    display: block;
    color: var(--text-primary);
    font-size: 28px;
    line-height: 1;
    margin-top: 4px;
  }

  .summary-badge {
    background: var(--bg-accent-subtle);
    color: var(--success-color);
    border-radius: 100px;
    padding: 6px 10px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
  }

  .notifications-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 8px;
  }

  /* Wrapper que contiene la tarjeta y el fondo rojo */
  .notification-wrapper {
    position: relative;
    border-radius: var(--radius-lg);
    overflow: hidden;
    touch-action: pan-y; /* permite scroll vertical, capturamos horizontal manualmente */
    user-select: none;
  }

  /* Botón rojo oculto detrás de la tarjeta */
  .delete-bg-btn {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 80px;
    background: var(--bg-danger-subtle, #fef2f2);
    color: var(--danger-color, #ef4444);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0 var(--radius-lg) var(--radius-lg) 0;
    cursor: pointer;
    z-index: 1;
    transition: background 0.15s;
  }

  .delete-bg-btn:active {
    background: var(--danger-color, #ef4444);
    color: white;
  }

  /* Tarjeta que se desliza para revelar el botón */
  .card-slider {
    position: relative;
    z-index: 2;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .card-slider.swiped {
    transform: translateX(-80px);
  }
  .card-slider.swiped .notification-card{
    border-top-right-radius: 0;
    border-bottom-right-radius: 0;
  }

  .notification-card {
    background: var(--bg-card);
    border: 1px solid var(--border-color);
    padding: 16px;
    border-radius: var(--radius-lg);
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: flex-start;
    gap: 14px;
    text-align: left;
    cursor: pointer;
    box-shadow: var(--shadow-card);
    position: relative;
    width: 100%;
    min-height: 96px;
  }

  .notification-card:active {
    transform: scale(0.98);
  }

  .notification-card.unread {
    border-color: var(--accent-color);
    box-shadow: var(--shadow-soft);
  }

  /* Estado leído: sin opacidad (evita transparentar el fondo rojo),
     se diferencia visualmente mediante colores apagados */
  .notification-card.read {
    background: var(--bg-card);
    border-color: var(--border-color);
  }

  .notification-card.read .notification-content h3 {
    color: var(--text-secondary);
    font-weight: 600;
  }

  .notification-card.read .notification-content p {
    color: var(--text-muted);
  }

  .notification-card.read .date {
    color: var(--text-muted);
  }

  .notification-card.read .icon-container {
    background: var(--bg-input);
    color: var(--text-muted);
  }

  .icon-container {
    width: 44px;
    height: 44px;
    border-radius: var(--radius-sm);
    background: var(--bg-input);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .notification-card.unread .icon-container {
    background: var(--accent-color);
    color: var(--accent-ink);
  }

  .notification-content {
    min-width: 0;
  }

  .notification-content h3 {
    margin: 4px 0 6px;
    font-size: 16px;
    font-weight: 800;
    color: var(--text-primary);
    line-height: 1.25;
    overflow-wrap: anywhere;
  }

  .date {
    display: block;
    font-size: 12px;
    color: var(--text-muted);
    font-weight: 700;
  }

  .notification-content p {
    margin: 0;
    font-size: 14px;
    color: var(--text-secondary);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .unread-indicator {
    width: 10px;
    height: 10px;
    background: var(--accent-strong);
    border-radius: 50%;
    margin-top: 6px;
    box-shadow: 0 0 0 4px var(--bg-accent-subtle);
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 72px 24px;
    color: var(--text-secondary);
    gap: 12px;
    text-align: center;
  }

  .empty-icon {
    width: 80px;
    height: 80px;
    background: var(--bg-input);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--text-primary);
    margin-bottom: 4px;
  }

  .empty-state h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: var(--text-primary);
  }

  .empty-state p {
    margin: 0;
    font-size: 14px;
    line-height: 1.45;
    max-width: 260px;
  }

  @media (max-width: 420px) {
    .notifications-page {
      padding-inline: 18px;
    }

    .summary-card {
      grid-template-columns: auto 1fr;
    }

    .summary-badge {
      grid-column: 1 / -1;
      justify-self: start;
    }
  }
</style>
