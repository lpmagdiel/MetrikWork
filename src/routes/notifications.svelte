<script>
  import { onMount } from "svelte";
  import {
    notificationsStore,
    markNotificationAsRead,
    deleteNotification,
    deleteAllNotifications,
    userStore,
  } from "../data/stores.js";
  import { ChevronLeft, Bell, CheckCheck, Trash2 } from "lucide-svelte";
  import { currentPath } from "../router.js";
  import { useSwipe } from "svelte-gestures";
  import { fade, fly } from "svelte/transition";
  import { addDoc, collection } from "firebase/firestore";
  import { db } from "../data/firebase.js";
  import Toast from "../components/Toast.svelte";
  import ConfirmToast from "../components/ConfirmToast.svelte";

  let notifications = $derived($notificationsStore);
  let swipedNotificationId = $state(null);
  let showToast = $state(false);
  let showConfirmToast = $state(false);
  let messageToast = $state("");
  let typeToast = $state("");

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
    // This function is now only for marking as read
    // Card click is removed to allow swipe to work properly
    if (!notification.opened) {
      await markNotificationAsRead(notification.id);
    }
  }

  function handleSwipe(event, notificationId) {
    if (event.detail.direction === "left") {
      swipedNotificationId = notificationId;
    } else if (event.detail.direction === "right") {
      if (swipedNotificationId === notificationId) {
        swipedNotificationId = null;
      }
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

  const handleDeleteAll = () => {
    showConfirmToast = true;
  };

  async function handleSimulate() {
    if (!$userStore) return;
    await addDoc(collection(db, "notifications"), {
      title: "Prueba de Swipe",
      message: "Desliza esta notificación.",
      date: new Date().toISOString(),
      notificationFor: $userStore.uid,
      opened: false,
    });
  }

  function goBack() {
    $currentPath = "#/";
  }
</script>

<div class="notifications-page">
  <Toast
    type="success"
    message={messageToast}
    duration={3000}
    show={showToast}
  />
  <ConfirmToast
    message="¿Estás seguro de que deseas eliminar todas las notificaciones?"
    duration={3000}
    show={showToast}
    onConfirm={handleDeleteAll}
  />
  <header>
    <button class="back-btn" onclick={goBack}>
      <ChevronLeft size={24} />
    </button>
    <h1 style="flex:1">Notificaciones</h1>
    {#if notifications.length > 0}
      <button
        class="back-btn delete-all"
        onclick={handleDeleteAll}
        title="Eliminar todas"
      >
        <Trash2 size={20} color="#ff4d4d" />
      </button>
    {/if}
  </header>

  <div class="notifications-list">
    {#if notifications.length > 0}
      {#each notifications as notification (notification.id)}
        <div
          class="notification-wrapper"
          transition:fly={{ x: -200, duration: 300 }}
          {...useSwipe((e) => handleSwipe(e, notification.id))}
        >
          <button
            class="delete-bg-btn"
            onclick={() => handleDelete(notification.id)}
          >
            <Trash2 size={24} color="white" />
          </button>
          <div
            class="card-slider"
            class:swiped={swipedNotificationId === notification.id}
          >
            <div
              class="notification-card {notification.opened
                ? 'read'
                : 'unread'}"
            >
              <div class="icon-container">
                <Bell
                  size={20}
                  color={notification.opened ? "#ccc" : "#e3654e"}
                />
              </div>
              <div class="content">
                <div class="header-row">
                  <h3>{notification.title}</h3>
                  <span class="date">{formatDate(notification.date)}</span>
                </div>
                <p>{notification.message}</p>
              </div>
              {#if !notification.opened}
                <div class="unread-indicator"></div>
              {/if}
            </div>
          </div>
        </div>
      {/each}
    {:else}
      <div class="empty-state">
        <div class="empty-icon">
          <Bell size={48} />
        </div>
        <p>No tienes notificaciones</p>
      </div>
    {/if}
  </div>
</div>
```

<style>
  .notifications-page {
    padding: 24px 24px var(--bottom-nav-clearance);
    height: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    background-color: var(--bg-page);
  }

  header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 24px;
  }

  .back-btn {
    background: var(--bg-card);
    border: none;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    color: var(--text-primary);
  }

  h1 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--text-primary);
  }

  .notifications-list {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-bottom: 8px;
  }

  .notification-wrapper {
    position: relative;
    border-radius: 16px;
    overflow: hidden;
  }

  .delete-bg-btn {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    width: 70px;
    background: var(--bg-danger-subtle);
    color: var(--accent-color);
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 0 16px 16px 0;
    cursor: pointer;
    z-index: 1;
  }

  .card-slider {
    position: relative;
    z-index: 2;
    transition: transform 0.2s ease-out;
    background: transparent;
  }

  .card-slider.swiped {
    transform: translateX(-70px);
  }

  .notification-card {
    background: var(--bg-card);
    border: none;
    padding: 16px;
    border-radius: 16px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
    position: relative;
    width: 100%;
  }

  .notification-card:active {
    transform: scale(0.98);
  }

  .notification-card.unread {
    background: var(--bg-card);
    border-left: 4px solid #e3654e;
  }

  .notification-card.read {
    background: var(--bg-input);
  }

  .icon-container {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--bg-input);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .notification-card.unread .icon-container {
    background: var(--bg-accent-subtle);
  }

  .content {
    flex: 1;
  }

  .header-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }

  .content h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .date {
    font-size: 11px;
    color: #aaa;
    white-space: nowrap;
    margin-left: 8px;
  }

  .content p {
    margin: 0;
    font-size: 13px;
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .unread-indicator {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 8px;
    height: 8px;
    background: #e3654e;
    border-radius: 50%;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding-top: 60px;
    color: #ccc;
    gap: 16px;
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
  }
</style>
