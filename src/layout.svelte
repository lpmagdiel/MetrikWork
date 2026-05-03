<script>
  import { onMount, tick } from "svelte";
  import { currentPath } from "./router.js";
  import {
    userStore,
    authReady,
    selectedTeamId,
    settingsStore,
  } from "./data/stores.js";
  import NavBar from "./components/NavBar.svelte";
  import LoadingSpinner from "./components/LoadingSpinner.svelte";

  // Static Imports
  import Home from "./routes/home.svelte";
  import Login from "./routes/login.svelte";
  import Hello from "./routes/hello.svelte";
  import Teams from "./routes/teams.svelte";
  import Team from "./routes/team.svelte";
  import Settings from "./routes/settings.svelte";
  import Calendar from "./routes/calendar.svelte";
  import Notifications from "./routes/notifications.svelte";
  import Inventory from "./routes/inventory.svelte";
  import Calculator from "./routes/calculator.svelte";
  import Notes from "./routes/notes.svelte";
  import Tasks from "./routes/tasks.svelte";
  import Chat from "./routes/chat.svelte";
  import TeamPayments from "./routes/team-payments.svelte";
  import Pay from "./routes/pay.svelte";
  import Timer from "./routes/Timer.svelte";
  import Tour from "./routes/tour.svelte";
  import Planning from "./routes/planning.svelte";

  // Basic Route Map
  const routes = {
    "/": Home,
    "/teams": Teams,
    "/login": Login,
    "/hello": Hello,
    "/settings": Settings,
    "/calendar": Calendar,
    "/notifications": Notifications,
    "/inventory": Inventory,
    "/calculator": Calculator,
    "/notes": Notes,
    "/tasks": Tasks,
    "/team": Team,
    "/chat": Chat,
    "/team-payments": TeamPayments,
    "/pay": Pay,
    "/timer": Timer,
    "/tour": Tour,
  };

  let cleanPath = $derived($currentPath.split("?")[0]);

  let routeInfo = $derived.by(() => {
    // 1. Handle nested team routes: /teams/:teamId/:subpage
    if (cleanPath.startsWith("/teams/")) {
      const parts = cleanPath.split("/");
      const teamId = parts[2];
      const subpage = parts[3];

      if (teamId !== "create") {
        let component = Team;
        if (subpage === "tasks") component = Tasks;
        else if (subpage === "inventory") component = Inventory;
        else if (subpage === "chat") component = Chat;
        else if (subpage === "payments") component = TeamPayments;
        else if (subpage === "planning") component = Planning;
        return { component, teamId };
      }

      if (teamId === "create") {
        return { component: Pay, teamId: null };
      }
    }

    // 2. Fallback to static routes
    return { component: routes[cleanPath] || Home, teamId: null };
  });

  // Derived component to render
  let Component = $derived(routeInfo.component);

  let canRender = $derived(
    $authReady &&
      ($userStore || $currentPath === "/hello" || $currentPath === "/login"),
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
      $currentPath !== "/hello" &&
      $currentPath !== "/login"
    ) {
      $currentPath = "/hello";
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
    <Component />
  {/if}
</main>

{#if $authReady && $currentPath !== "/hello" && $currentPath !== "/login" && $currentPath !== "/tour"}
  <NavBar />
{/if}

<style>
  main {
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
</style>
