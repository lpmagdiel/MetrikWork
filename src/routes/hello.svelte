<script>
  import { onMount } from "svelte";
  import { Mail } from "lucide-svelte";
  import { currentPath } from "../router";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import { userStore } from "../data/stores";
  import { auth, googleProvider } from "../data/firebase";
  import {
    signInWithPopup,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
  } from "firebase/auth";

  let loadingShow = $state(false);
  let openMailForm = $state(false);

  let email = $state("");
  let password = $state("");
  let name = $state("");
  let isRegistering = $state(false);
  let errorMessage = $state("");

  onMount(() => {
    const unsubscribe = userStore.subscribe((value) => {
      if (value && value.email) {
        $currentPath = "#/";
      }
    });
    return unsubscribe;
  });

  const handleLogin = async (provider) => {
    if (provider === "mail") {
      openMailForm = true;
      errorMessage = "";
    } else if (provider === "google") {
      loadingShow = true;
      errorMessage = "";
      try {
        await signInWithPopup(auth, googleProvider);
        // Auth state listener in stores.js will handle the rest
        $currentPath = "#/";
      } catch (error) {
        console.error("Google login failed", error);
        errorMessage = error.message;
      } finally {
        loadingShow = false;
      }
    }
  };

  const handleMailLogin = async () => {
    if (!email || !password) {
      errorMessage = "Por favor ingresa correo y contraseña";
      return;
    }
    loadingShow = true;
    errorMessage = "";

    try {
      if (isRegistering) {
        // Register
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (name) {
          await updateProfile(userCredential.user, {
            displayName: name,
          });
          // Trigger store update manually or wait for listener? Listener should check displayName.
          // But onAuthStateChanged might fire before updateProfile completes.
          // For now, let's rely on the listener.
        }
      } else {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
      }
      openMailForm = false;
      $currentPath = "#/";
    } catch (error) {
      console.error("Mail login failed", error);
      errorMessage = error.message;
    } finally {
      loadingShow = false;
    }
  };
</script>

<div class="hello-page">
  <LoadingSpinner show={loadingShow} />
  <h1>MetricWork</h1>
  <div class="center">
    <h2>Trabaja en equipo!</h2>
    <img src="/team.png" alt="Trabajo en equipo" />
    <p><b>Planea, organiza, colabora...</b></p>
  </div>
  <div class="center">
    <small>Iniciar sesión con:</small>
    <div class="login-form">
      <button class="log-icon" onclick={() => handleLogin("mail")}>
        <Mail size={28} color="#ffffff" strokeWidth={2} />
      </button>
      <div class="spacer">|</div>
      <button class="log-icon" onclick={() => handleLogin("google")}>
        <img src="/google.png" alt="Google" width="28" />
      </button>
    </div>
  </div>

  <SliceContainer bind:show={openMailForm}>
    <div style="padding: 20px;">
      <h2>{isRegistering ? "Registro" : "Inicio de Sesión"}</h2>

      <div style="margin-bottom: 15px;">
        <label for="email" style="display: block; margin-bottom: 5px;"
          >Correo electrónico</label
        >
        <input
          type="email"
          id="email"
          bind:value={email}
          placeholder="correo@ejemplo.com"
          style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1);"
        />
      </div>

      <div style="margin-bottom: 15px;">
        <label for="password" style="display: block; margin-bottom: 5px;"
          >Contraseña</label
        >
        <input
          type="password"
          id="password"
          bind:value={password}
          placeholder="Contraseña"
          style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1);"
        />
      </div>

      {#if isRegistering}
        <div style="margin-bottom: 15px;">
          <label for="name" style="display: block; margin-bottom: 5px;"
            >Nombre completo</label
          >
          <input
            type="text"
            id="name"
            bind:value={name}
            placeholder="Tu nombre"
            style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid #ccc; background: rgba(255,255,255,0.1);"
          />
        </div>
      {/if}

      {#if errorMessage}
        <div style="color: #ff6b6b; margin-bottom: 10px; font-size: 0.9em;">
          {errorMessage}
        </div>
      {/if}

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button
          onclick={handleMailLogin}
          style="flex: 1; padding: 10px; background: #6b4c7b; border: none; border-radius: 5px; cursor: pointer;"
        >
          {isRegistering ? "Registrarse" : "Entrar"}
        </button>
      </div>

      <div style="margin-top: 15px; text-align: center;">
        <button
          onclick={() => (isRegistering = !isRegistering)}
          style="background: none; border: none; color: #ccc; cursor: pointer; text-decoration: underline;"
        >
          {isRegistering
            ? "¿Ya tienes cuenta? Inicia sesión"
            : "¿No tienes cuenta? Regístrate"}
        </button>
      </div>
    </div>
  </SliceContainer>
</div>

<style>
  .hello-page {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-direction: column;
    height: 100vh;
    width: 100%;
    background: linear-gradient(to right, #4d2e52 0%, #372741 100%);
    color: white;
  }
  .hello-page .center {
    flex-direction: column;
  }
  h1 {
    background-color: rgba(0, 0, 0, 0.3);
    padding: 8px 16px;
  }
  img {
    max-width: 300px;
  }
  .login-form {
    margin-top: 5px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 20px;
    flex-direction: row;
    margin-bottom: 40px;
    width: 100%;
  }
  .login-form{
    color: #383737 !important;
  }
  label{
    color: #383737 !important;
  }
  .log-icon {
    background: none;
    border: 1px solid rgba(255, 255, 255, 0.3);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
