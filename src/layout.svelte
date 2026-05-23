<script>
  import { currentPath, navigateTo } from "./router.js";
  import {
    userStore,
    authReady,
    selectedTeamId,
    settingsStore,
  } from "./data/stores.js";
  import NavBar from "./components/NavBar.svelte";
  import LoadingSpinner from "./components/LoadingSpinner.svelte";
  import UpdateFeaturesModal from "./components/UpdateFeaturesModal.svelte";
  import { updateData } from "./data/updateFeatures.js";
  // Modal de novedades
  let showUpdateModal = $state(false);

  let cleanPath = $derived($currentPath.split("?")[0]);
  let hasCheckedUpdate = false;

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

  let routeModulePromise = $derived(routeInfo.loader());

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
</script>

<main>
  {#if !canRender}
    <LoadingSpinner show={true} />
  {:else}
    {#await routeModulePromise}
      <LoadingSpinner show={true} overlay={false} />
    {:then routeModule}
      {@const RouteComponent = routeModule.default}
      <RouteComponent />
    {:catch error}
      <section class="route-error">
        <h1>No se pudo cargar esta vista</h1>
        <p>{error?.message || "Inténtalo de nuevo en unos segundos."}</p>
      </section>
    {/await}
  {/if}
  <UpdateFeaturesModal open={showUpdateModal} onClose={closeUpdateModal} />
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
</style>
