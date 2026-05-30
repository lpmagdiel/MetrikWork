<script>
  import { onMount } from "svelte";
  import { currentPath, navigateTo } from "./router.js";
  import {
    userStore,
    authReady,
    selectedTeam,
    selectedTeamId,
    settingsStore,
  } from "./data/stores.js";
  import NavBar from "./components/NavBar.svelte";
  import LoadingSpinner from "./components/LoadingSpinner.svelte";
  import Toast from "./components/Toast.svelte";
  import UpdateFeaturesModal from "./components/UpdateFeaturesModal.svelte";
  import { updateData } from "./data/updateFeatures.js";
  import { injectSpeedInsights } from "@vercel/speed-insights";
  import { inject } from "@vercel/analytics";

  // Modal de novedades
  let showUpdateModal = $state(false);

  let cleanPath = $derived($currentPath.split("?")[0]);
  let speedInsights = $state(null);
  let hasCheckedUpdate = false;
  let isOnline = $state(true);
  let showConnectionToast = $state(false);
  let connectionToastType = $state("info");
  let connectionToastMessage = $state("");

  const teamThemeVars = [
    "--team-primary",
    "--accent-color",
    "--accent-strong",
    "--accent-ink",
    "--bg-accent-subtle",
  ];

  onMount(() => {
    inject();
    speedInsights = injectSpeedInsights({
      framework: "svelte",
      route: cleanPath,
    });

    let connectionCheckId = 0;
    let showToastTimeout = null;

    function showConnectionStatusToast(type, message) {
      window.clearTimeout(showToastTimeout);
      connectionToastType = type;
      connectionToastMessage = message;
      showConnectionToast = false;

      showToastTimeout = window.setTimeout(() => {
        showConnectionToast = true;
      }, 0);
    }

    function updateConnectionState(nextOnline, notify = false) {
      const wasOnline = isOnline;
      isOnline = nextOnline;

      if (!notify || wasOnline === nextOnline) return;

      if (nextOnline) {
        showConnectionStatusToast(
          "success",
          "Conexión restablecida. Sincronizando cambios pendientes.",
        );
      } else {
        showConnectionStatusToast(
          "warning",
          "Sin conexión. Puedes seguir usando las funciones disponibles.",
        );
      }
    }

    async function confirmConnectionState() {
      if (typeof window === "undefined") return;

      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 2500);

      try {
        await fetch(`/__metricwork_connectivity_check__?t=${Date.now()}`, {
          method: "HEAD",
          cache: "no-store",
          signal: controller.signal,
        });
        return true;
      } catch {
        return typeof navigator === "undefined" ? true : navigator.onLine !== false;
      } finally {
        window.clearTimeout(timeoutId);
      }
    }

    const setOnline = () => {
      connectionCheckId += 1;
      updateConnectionState(true, true);
    };

    const setOffline = async () => {
      const checkId = ++connectionCheckId;
      const stillOnline = await confirmConnectionState();
      if (checkId !== connectionCheckId) return;
      updateConnectionState(stillOnline, true);
    };

    const syncConnectionFromNavigator = () => {
      if (typeof navigator === "undefined") return;
      if (navigator.onLine === false) {
        setOffline();
      } else if (!isOnline) {
        setOnline();
      }
    };

    const browserReportsOnline =
      typeof navigator === "undefined" ? true : navigator.onLine !== false;
    isOnline = true;
    if (!browserReportsOnline) setOffline();

    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    window.addEventListener("focus", syncConnectionFromNavigator);
    document.addEventListener("visibilitychange", syncConnectionFromNavigator);

    return () => {
      window.clearTimeout(showToastTimeout);
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
      window.removeEventListener("focus", syncConnectionFromNavigator);
      document.removeEventListener("visibilitychange", syncConnectionFromNavigator);
    };
  });

  $effect(() => {
    speedInsights?.setRoute(cleanPath);
  });

  $effect(() => {
    // Solo mostrar si el usuario está autenticado y no está en login/hello/tour
    if (
      !hasCheckedUpdate &&
      $authReady &&
      $userStore &&
      ["/hello", "/login", "/tour"].indexOf(cleanPath) === -1
    ) {
      const lastSeen = localStorage.getItem("lastUpdateFeaturesVersion");
      if (lastSeen !== updateData.version) {
        showUpdateModal = true;
      }
      hasCheckedUpdate = true;
    }
  });

  function closeUpdateModal() {
    showUpdateModal = false;
    localStorage.setItem("lastUpdateFeaturesVersion", updateData.version);
  }

  const routeLoaders = {
    "/": () => import("./routes/home.svelte"),
    "/teams": () => import("./routes/teams.svelte"),
    "/login": () => import("./routes/login.svelte"),
    "/hello": () => import("./routes/hello.svelte"),
    "/settings": () => import("./routes/settings.svelte"),
    "/calendar": () => import("./routes/calendar.svelte"),
    "/requests": () => import("./routes/requests.svelte"),
    "/notifications": () => import("./routes/notifications.svelte"),
    "/inventory": () => import("./routes/inventory.svelte"),
    "/calculator": () => import("./routes/calculator.svelte"),
    "/notes": () => import("./routes/notes.svelte"),
    "/locations": () => import("./routes/locations.svelte"),
    "/tasks": () => import("./routes/tasks.svelte"),
    "/team": () => import("./routes/team.svelte"),
    "/chat": () => import("./routes/chat.svelte"),
    "/team-payments": () => import("./routes/team-payments.svelte"),
    "/pay": () => import("./routes/pay.svelte"),
    "/timer": () => import("./routes/Timer.svelte"),
    "/tour": () => import("./routes/tour.svelte"),
  };

  const teamRouteLoaders = {
    tasks: routeLoaders["/tasks"],
    inventory: routeLoaders["/inventory"],
    chat: routeLoaders["/chat"],
    payments: routeLoaders["/team-payments"],
    settings: () => import("./routes/team-settings.svelte"),
    stats: () => import("./routes/team-stats.svelte"),
    "my-stats": () => import("./routes/user-stats.svelte"),
    planning: () => import("./routes/planning.svelte"),
    locations: () => import("./routes/team-locations.svelte"),
  };

  const routeReloadStorageKey = "metricwork:route-reload-url";
  const dynamicImportErrorPattern =
    /dynamically imported module|failed to fetch dynamically imported module|importing a module script failed|loading chunk|unable to preload css|module script/i;

  function getErrorMessage(error) {
    if (!error) return "";
    if (typeof error === "string") return error;
    return [error.message, error.name, error.stack].filter(Boolean).join("\n");
  }

  function isDynamicImportError(error) {
    return dynamicImportErrorPattern.test(getErrorMessage(error));
  }

  function reloadOnceForFreshRoute() {
    if (typeof window === "undefined") return false;

    const currentUrl = window.location.href;
    try {
      if (sessionStorage.getItem(routeReloadStorageKey) === currentUrl) return false;
      sessionStorage.setItem(routeReloadStorageKey, currentUrl);
    } catch {
      // If storage is blocked, reloading is still the least surprising recovery.
    }

    window.location.reload();
    return true;
  }

  async function loadRouteModule(loader) {
    try {
      return await loader();
    } catch (error) {
      if (isDynamicImportError(error)) {
        reloadOnceForFreshRoute();
      }
      throw error;
    }
  }

  let routeInfo = $derived.by(() => {
    // 1. Handle nested team routes: /teams/:teamId/:subpage
    if (cleanPath.startsWith("/teams/")) {
      const parts = cleanPath.split("/");
      const teamId = parts[2];
      const subpage = parts[3];

      if (teamId !== "create") {
        return {
          loader: teamRouteLoaders[subpage] || routeLoaders["/team"],
          teamId,
        };
      }

      if (teamId === "create") {
        return { loader: routeLoaders["/pay"], teamId: null };
      }
    }

    // 2. Fallback to static routes
    return { loader: routeLoaders[cleanPath] || routeLoaders["/"], teamId: null };
  });

  let routeModulePromise = $derived(loadRouteModule(routeInfo.loader));

  let canRender = $derived(
    $authReady &&
      ($userStore || cleanPath === "/hello" || cleanPath === "/login"),
  );
  let showNav = $derived(
    $authReady && !["/hello", "/login", "/tour"].includes(cleanPath),
  );

  // Sync selectedTeamId store
  $effect.pre(() => {
    if (routeInfo.teamId) {
      selectedTeamId.set(routeInfo.teamId);
    } else if (
      !cleanPath.startsWith("/teams") &&
      cleanPath !== "/inventory" &&
      cleanPath !== "/tasks" &&
      cleanPath !== "/chat"
    ) {
      selectedTeamId.set(null);
    }
  });

  // Auth redirection
  $effect(() => {
    if (!$authReady) return;
    if (
      !$userStore &&
      cleanPath !== "/hello" &&
      cleanPath !== "/login"
    ) {
      navigateTo("/hello");
    }
  });

  // Dark mode sync
  $effect(() => {
    if ($settingsStore?.darkMode) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  });

  $effect(() => {
    const root = document.documentElement;
    const primaryColor = normalizeHexColor($selectedTeam?.themePrimaryColor);

    teamThemeVars.forEach((name) => root.style.removeProperty(name));
    if (!primaryColor) return;

    root.style.setProperty("--team-primary", primaryColor);
    root.style.setProperty("--accent-color", primaryColor);
    root.style.setProperty("--accent-strong", primaryColor);
    root.style.setProperty("--accent-ink", getReadableInk(primaryColor));
    root.style.setProperty(
      "--bg-accent-subtle",
      `color-mix(in srgb, ${primaryColor} 18%, var(--bg-card))`,
    );
  });

  function normalizeHexColor(value) {
    const color = String(value || "").trim();
    if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
    if (/^#[0-9a-fA-F]{3}$/.test(color)) {
      return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    }
    return "";
  }

  function getReadableInk(hexColor) {
    const hex = normalizeHexColor(hexColor).slice(1);
    if (!hex) return "#000000";
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);
    const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
    return luminance > 145 ? "#000000" : "#ffffff";
  }
</script>

<main>
  {#if !canRender}
    <LoadingSpinner show={true} />
  {:else}
    {#await routeModulePromise}
      <LoadingSpinner show={true} overlay={false} />
    {:then routeModule}
      {@const RouteComponent = routeModule.default}
      {#key cleanPath}
        <RouteComponent />
      {/key}
    {:catch error}
      <section class="route-error">
        <h1>No se pudo cargar esta vista</h1>
        <p>{error?.message || "Inténtalo de nuevo en unos segundos."}</p>
        <button type="button" onclick={() => window.location.reload()}>
          Recargar app
        </button>
      </section>
    {/await}
  {/if}
  <UpdateFeaturesModal open={showUpdateModal} onClose={closeUpdateModal} />
  <Toast
    message={connectionToastMessage}
    type={connectionToastType}
    duration={3500}
    bind:show={showConnectionToast}
  />
</main>

{#if showNav}
  <NavBar />
{/if}

<style>
  main {
    position: relative;
    z-index: 1;
    height: 100dvh;
    width: 100%;
    box-sizing: border-box;
    background-color: var(--bg-page);
    overflow: hidden;
  }

  @supports not (height: 100dvh) {
    main {
      height: 100vh;
    }
  }

  .route-error {
    display: grid;
    align-content: center;
    gap: 0.75rem;
    min-height: 100%;
    padding: 2rem;
    text-align: center;
    color: var(--text-primary);
  }

  .route-error h1 {
    margin: 0;
    font-size: 1.25rem;
  }

  .route-error p {
    margin: 0;
    color: var(--text-secondary);
  }

  .route-error button {
    justify-self: center;
    border: 0;
    border-radius: 8px;
    padding: 0.8rem 1rem;
    background: var(--accent-color, #e3654e);
    color: var(--accent-ink, #ffffff);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }

</style>
