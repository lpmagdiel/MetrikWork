<script>
  import { onMount } from "svelte";
  import { Mail } from "lucide-svelte";
  import { currentPath } from "../router";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import Alert from "../components/Alert.svelte";
  import { userStore } from "../data/stores";
  import { auth, googleProvider } from "../data/firebase";
  import { BETA_TESTERS_MODE } from "../data/features.js";
  import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    getAdditionalUserInfo,
  } from "firebase/auth";

  let loadingShow = $state(false);
  let openMailForm = $state(false);
  let showAlert = $state(false);
  let alertType = $state('info');
  let alertTitle = $state('');
  let alertMessage = $state('');

  let email = $state("");
  let password = $state("");
  let name = $state("");
  let isRegistering = $state(false);

  function showErrorAlert(title, message) {
    alertType = 'error';
    alertTitle = title;
    alertMessage = message;
    showAlert = true;
  }

  function showSuccessAlert(title, message) {
    alertType = 'success';
    alertTitle = title;
    alertMessage = message;
    showAlert = true;
  }

  function showInfoAlert(title, message) {
    alertType = 'info';
    alertTitle = title;
    alertMessage = message;
    showAlert = true;
  }

  let skipAutoRedirect = false;

  onMount(() => {
    // Revisa si regresamos de un inicio de sesión con redirección
    getRedirectResult(auth).then((result) => {
      if (result) {
        skipAutoRedirect = true;
        const additionalInfo = getAdditionalUserInfo(result);
        if (additionalInfo?.isNewUser) {
          $currentPath = "/tour";
        } else {
          $currentPath = "/";
        }
      }
    }).catch((error) => {
      console.error("Redirect login error:", error);
      showErrorAlert("Error de autenticación", error.message);
    });

    const unsubscribe = userStore.subscribe((value) => {
      if (value && value.email && !skipAutoRedirect) {
        $currentPath = "/";
      }
    });
    return unsubscribe;
  });

  const handleLogin = async (provider) => {
    console.log(provider);
    if (provider === "mail") {
      openMailForm = true;
    } else if (provider === "google") {
      if (BETA_TESTERS_MODE) {
        showInfoAlert(
          "No disponible",
          "Esa opción no está disponible en la versión de pruebas.",
        );
        return;
      }
      loadingShow = true;
      skipAutoRedirect = true;
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        const additionalInfo = getAdditionalUserInfo(credential);
        if (additionalInfo?.isNewUser) {
          $currentPath = "/tour";
        } else {
          $currentPath = "/";
        }
        loadingShow = false;
      } catch (error) {
        console.log(error);
        if (error.code === 'auth/popup-blocked') {
          console.warn("Popup bloqueado por el navegador, intentando con redirección...");
          try {
            const credential = await signInWithRedirect(auth, googleProvider);
            const additionalInfo = getAdditionalUserInfo(credential);
            console.log(additionalInfo);
            if (additionalInfo?.isNewUser) {
              $currentPath = "/tour";
            } else {
              $currentPath = "/";
            }
        loadingShow = false;
            //return; // Detener aquí porque la página se va a recargar
          } catch (redirectError) {
            console.error("Redirect login failed", redirectError);
            showErrorAlert("Error", redirectError.message);
          }
        } else {
          console.error("Google login failed", error);
          showErrorAlert("Error", error.message);
        }
        skipAutoRedirect = false;
        loadingShow = false;
      }
    }
  };

  const handleMailLogin = async () => {
    if (!email || !password) {
      showErrorAlert("Campos requeridos", "Por favor ingresa correo y contraseña");
      return;
    }
    loadingShow = true;

    try {
      skipAutoRedirect = true;
      let isNewUser = false;
      if (isRegistering) {
        // Register
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );
        isNewUser = true;
        if (name) {
          await updateProfile(userCredential.user, {
            displayName: name,
          });
        }
        showSuccessAlert("¡Bienvenido!", "Tu cuenta ha sido creada exitosamente");
      } else {
        // Login
        await signInWithEmailAndPassword(auth, email, password);
        showSuccessAlert("¡Éxito!", "Has iniciado sesión correctamente");
      }
      setTimeout(() => {
        openMailForm = false;
        email = "";
        password = "";
        name = "";
        if (isNewUser) {
          $currentPath = "/tour";
        } else {
          $currentPath = "/";
        }
      }, 1500);
    } catch (error) {
      skipAutoRedirect = false;
      console.error("Mail login failed", error);
      showErrorAlert("Error de autenticación", error.message);
    } finally {
      loadingShow = false;
    }
  };
</script>

<div class="hello-page">
  <LoadingSpinner show={loadingShow} />
  <Alert bind:show={showAlert} type={alertType} title={alertTitle} message={alertMessage} duration={4000} />
  <div class="hello-card">
    <div class="hero-row">
      <div class="hero-copy">
        <h1>Gestiona tus equipos con claridad y ritmo.</h1>
        <p>
          Controla tareas, métricas y pagos en una sola vista optimizada para equipos modernos.
        </p>
      </div>
      <div class="hero-visual">
        <img src="/team.png" alt="Trabajo en equipo" />
      </div>
    </div>

    <div class="auth-card">

      <div class="login-actions">
        <div class="center">
          <small>
            {isRegistering
              ? "Regístrate con tu método preferido"
              : "Inicia sesión con tu método preferido"}
          </small>
        </div>
        <div class="login-form">
          <button class="login-option" onclick={() => handleLogin("mail")}> 
            <Mail size={24} />
            <span>Email</span>
          </button>

          <button
            type="button"
            class="login-option google"
            class:google-disabled={BETA_TESTERS_MODE}
            onclick={() => handleLogin("google")}
            aria-disabled={BETA_TESTERS_MODE ? "true" : undefined}
          >
            <img src="/google.png" alt="" width="22" aria-hidden="true" />
            <span>Google</span>
          </button>
        </div>
      </div>

      <button class="toggle-mode" type="button" onclick={() => (isRegistering = !isRegistering)}>
        {isRegistering
          ? "¿Ya tienes cuenta? Inicia sesión"
          : "¿No tienes cuenta? Regístrate"}
      </button>
    </div>
  </div>

  <SliceContainer bind:show={openMailForm}>
    <div class="mail-form-container">
      <h2>{isRegistering ? "Regístrate" : "Inicia Sesión"}</h2>
      <p class="form-subtitle">{isRegistering
        ? "Crea tu cuenta con tu correo"
        : "Accede con tu correo y contraseña"}
      </p>

      <form class="mail-form" onsubmit={(e) => { e.preventDefault(); handleMailLogin(); }}>
        <label for="email">Correo electrónico</label>
        <input
          type="email"
          id="email"
          bind:value={email}
          placeholder="correo@ejemplo.com"
        />

        <label for="password">Contraseña</label>
        <input
          type="password"
          id="password"
          bind:value={password}
          placeholder="Contraseña"
        />

        {#if isRegistering}
          <label for="name">Nombre completo</label>
          <input
            type="text"
            id="name"
            bind:value={name}
            placeholder="Tu nombre"
          />
        {/if}

        <button class="submit-btn" type="submit">
          {isRegistering ? "Registrarse" : "Entrar"}
        </button>
      </form>

      <button class="toggle-auth-mode" type="button" onclick={() => (isRegistering = !isRegistering)}>
        {isRegistering
          ? "¿Ya tienes cuenta? Inicia sesión"
          : "¿No tienes cuenta? Regístrate"}
      </button>
    </div>
  </SliceContainer>
</div>

<style>
  .hello-page {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 32px 16px;
    padding-top: var(--page-top-safe);
    background: radial-gradient(circle at top, rgba(167, 243, 208, 0.28), transparent 35%),
      linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    color: var(--text-primary);
    overflow-y: auto;
    overflow-x: hidden;
    box-sizing: border-box;
  }

  .hello-card {
    width: min(100%, 1040px);
    display: grid;
    gap: 18px;
  }

  .hero-row {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr;
    gap: 32px;
    align-items: center;
  }

  .hero-copy {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .hero-copy h1 {
    font-size: clamp(2rem, 3vw, 3rem);
    line-height: 1.05;
  }

  .hero-copy p {
    color: var(--text-secondary);
    max-width: 560px;
  }

  .hero-visual {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .hero-visual img {
    width: min(100%, 320px);
    border-radius: 24px;
  }

  .auth-card {
    padding: 28px;
    display: grid;
    gap: 20px;
  }

  .login-actions small {
    color: var(--text-secondary);
    display: block;
    margin-bottom: 12px;
  }

  .login-form {
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: row;
    gap: 20px;
    margin: 12px 0;
  }

  .login-option {
    width: 48px;
    height: 48px;
    border: 1px solid rgba(0, 0, 0, 0.2);
    background: var(--bg-card);
    border-radius: 50%;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }

  .login-option:hover {
    transform: translateY(-2px);
    border-color: var(--accent-color);
    box-shadow: var(--shadow-button);
  }

  .login-option span {
    display: none;
  }

  .login-option.google {
    background: #ffffff;
  }

  .login-option.google.google-disabled {
    background: #e5e7eb;
    border-color: rgba(0, 0, 0, 0.12);
    opacity: 0.75;
    cursor: pointer;
  }

  .login-option.google.google-disabled:hover {
    transform: none;
    box-shadow: none;
    border-color: rgba(0, 0, 0, 0.12);
  }

  .login-option.google.google-disabled img {
    filter: grayscale(1);
    opacity: 0.65;
  }

  .mail-form {
    display: grid;
    gap: 14px;
  }

  label {
    font-size: 0.95rem;
    color: var(--text-secondary);
  }

  input {
    width: 100%;
    padding: 14px 16px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-color);
    background: var(--bg-input);
    color: var(--text-primary);
  }

  input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 4px rgba(167, 243, 208, 0.18);
  }

  .submit-btn {
    width: 100%;
    padding: 14px 18px;
    border-radius: 16px;
    border: none;
    background: var(--accent-strong);
    color: var(--bg-page);
    font-weight: 700;
    cursor: pointer;
    box-shadow: var(--shadow-button);
    transition: transform 0.2s ease, opacity 0.2s ease;
  }

  .submit-btn:hover {
    transform: translateY(-1px);
    opacity: 0.95;
  }

  .toggle-mode {
    width: 100%;
    border: none;
    background: none;
    color: var(--text-secondary);
    text-decoration: underline;
    cursor: pointer;
    padding: 12px 0 0;
  }

  .mail-form-container {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .mail-form-container h2 {
    font-size: 1.5rem;
    margin-bottom: 8px;
  }

  .form-subtitle {
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .toggle-auth-mode {
    width: 100%;
    border: none;
    background: none;
    color: var(--text-secondary);
    text-decoration: underline;
    cursor: pointer;
    padding: 12px 0 0;
    font-size: 0.95rem;
  }

  .toggle-auth-mode:hover {
    color: var(--text-primary);
  }

  @media (max-width: 900px) {
    .hero-row {
      grid-template-columns: 1fr;
    }

    .hero-copy h1 {
      font-size: 2.4rem;
    }

    .hero-visual img {
      width: 100%;
      max-width: 100%;
    }
  }

  @media (max-width: 640px) {
    .hello-page {
      padding: 20px 12px;
    }

    .hello-card {
      padding: 24px;
    }
  }
</style>