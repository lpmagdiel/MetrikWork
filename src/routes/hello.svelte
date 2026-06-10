<script>
  import { onMount } from "svelte";
  import { Mail } from "lucide-svelte";
  import { navigateTo } from "../router";
  import LoadingSpinner from "../components/LoadingSpinner.svelte";
  import SliceContainer from "../components/SliceContainer.svelte";
  import {
    userStore,
    updateUserProfile,
    updateSettings,
    MINIMUM_USER_AGE,
    normalizeBirthDate,
    getLatestAllowedBirthDate,
    isAtLeastMinimumAge,
  } from "../data/stores";
  import {
    LEGAL_PRIVACY_VERSION,
    LEGAL_TERMS_VERSION,
  } from "../data/legalContent.js";
  import { auth, googleProvider } from "../data/firebase";
  import { showErrorAlert, showSuccessAlert } from "../data/alerts.js";
  import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    updateProfile,
    getAdditionalUserInfo,
    signOut,
  } from "firebase/auth";

  let loadingShow = $state(false);
  let openMailForm = $state(false);

  let email = $state("");
  let password = $state("");
  let name = $state("");
  let birthDate = $state("");
  let acceptedLegalTerms = $state(false);
  let isRegistering = $state(false);

  let skipAutoRedirect = false;
  const latestAllowedBirthDate = getLatestAllowedBirthDate();
  const pendingLegalAcceptanceKey = "metricwork:pending-legal-acceptance";

  onMount(() => {
    // Revisa si regresamos de un inicio de sesión con redirección
    getRedirectResult(auth).then(async (result) => {
      if (result) {
        skipAutoRedirect = true;
        const additionalInfo = getAdditionalUserInfo(result);
        if (additionalInfo?.isNewUser) {
          if (!hasPendingLegalAcceptance()) {
            await showErrorAlert(
              "Aceptacion requerida",
              "Para crear una cuenta debes aceptar los Terminos y la Politica de Privacidad.",
            );
            await signOut(auth);
            clearPendingLegalAcceptance();
            return;
          }
          await saveLegalAcceptance(result.user.uid);
          clearPendingLegalAcceptance();
          navigateTo("/tour");
        } else {
          navigateTo("/");
        }
      }
    }).catch((error) => {
      console.error("Redirect login error:", error);
      showErrorAlert("Error de autenticación", error.message);
    });

    const unsubscribe = userStore.subscribe((value) => {
      if (value && value.email && !skipAutoRedirect) {
        navigateTo("/");
      }
    });
    return unsubscribe;
  });

  const handleLogin = async (provider) => {
    console.log(provider);
    if (provider === "mail") {
      openMailForm = true;
    } else if (provider === "google") {
      if (isRegistering && !acceptedLegalTerms) {
        showErrorAlert("Aceptacion requerida", "Acepta los Terminos y la Politica de Privacidad para registrarte.");
        return;
      }

      loadingShow = true;
      skipAutoRedirect = true;
      try {
        const credential = await signInWithPopup(auth, googleProvider);
        const additionalInfo = getAdditionalUserInfo(credential);
        if (additionalInfo?.isNewUser) {
          await saveLegalAcceptance(credential.user.uid);
          navigateTo("/tour");
        } else {
          navigateTo("/");
        }
      } catch (error) {
        console.log(error);
        if (error.code === 'auth/popup-blocked') {
          console.warn("Popup bloqueado por el navegador, intentando con redirección...");
          try {
            if (isRegistering) markPendingLegalAcceptance();
            await signInWithRedirect(auth, googleProvider);
            return; // El navegador redireccionará
          } catch (redirectError) {
            console.error("Redirect login failed", redirectError);
            showErrorAlert("Error", redirectError.message);
          }
        } else {
          console.error("Google login failed", error);
          showErrorAlert("Error", error.message);
        }
      } finally {
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

    let normalizedBirthDate = "";
    if (isRegistering) {
      if (!acceptedLegalTerms) {
        showErrorAlert("Aceptacion requerida", "Acepta los Terminos y la Politica de Privacidad para registrarte.");
        return;
      }

      normalizedBirthDate = normalizeBirthDate(birthDate);
      if (!normalizedBirthDate) {
        showErrorAlert("Fecha requerida", "Indica tu fecha de nacimiento para crear la cuenta.");
        return;
      }
      if (!isAtLeastMinimumAge(normalizedBirthDate)) {
        showErrorAlert("Edad mínima", `Debes tener al menos ${MINIMUM_USER_AGE} años para registrarte.`);
        return;
      }
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
        await updateUserProfile(userCredential.user.uid, {
          birthDate: normalizedBirthDate,
        });
        await saveLegalAcceptance(userCredential.user.uid);
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
        birthDate = "";
        acceptedLegalTerms = false;
        if (isNewUser) {
          navigateTo("/tour");
        } else {
          navigateTo("/");
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

  function getLegalAcceptancePayload() {
    const now = new Date().toISOString();
    return {
      legalTermsAccepted: true,
      legalTermsVersion: LEGAL_TERMS_VERSION,
      privacyPolicyAccepted: true,
      privacyPolicyVersion: LEGAL_PRIVACY_VERSION,
      legalAcceptedAt: now,
    };
  }

  async function saveLegalAcceptance(uid) {
    if (!uid) return;
    await updateSettings(uid, getLegalAcceptancePayload());
  }

  function markPendingLegalAcceptance() {
    try {
      sessionStorage.setItem(pendingLegalAcceptanceKey, JSON.stringify(getLegalAcceptancePayload()));
    } catch {
      // Si no se puede persistir, la ruta de redireccion pedira aceptar de nuevo.
    }
  }

  function hasPendingLegalAcceptance() {
    try {
      return Boolean(sessionStorage.getItem(pendingLegalAcceptanceKey));
    } catch {
      return false;
    }
  }

  function clearPendingLegalAcceptance() {
    try {
      sessionStorage.removeItem(pendingLegalAcceptanceKey);
    } catch {
      // No hay nada mas que limpiar.
    }
  }
</script>

<div class="hello-page">
  <LoadingSpinner show={loadingShow} />
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
            onclick={() => handleLogin("google")}>
            <img src="/google.png" alt="" width="22" aria-hidden="true" />
            <span>Google</span>
          </button>
        </div>
      </div>

      {#if isRegistering}
        <label class="legal-check">
          <input type="checkbox" bind:checked={acceptedLegalTerms} />
          <span>
            Acepto los <a href="/terms">Terminos y condiciones</a> y la
            <a href="/privacy">Politica de privacidad</a>.
          </span>
        </label>
      {/if}

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

          <label for="birthDate">Fecha de nacimiento</label>
          <input
            type="date"
            id="birthDate"
            bind:value={birthDate}
            max={latestAllowedBirthDate}
            autocomplete="bday"
          />

          <label class="legal-check form-check">
            <input type="checkbox" bind:checked={acceptedLegalTerms} />
            <span>
              Acepto los <a href="/terms">Terminos y condiciones</a> y la
              <a href="/privacy">Politica de privacidad</a>.
            </span>
          </label>
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

      <div class="legal-links">
        <a href="/terms">Terminos</a>
        <a href="/privacy">Privacidad</a>
        <a href="/cookies">Cookies</a>
        <a href="/legal">Aviso legal</a>
      </div>
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

  .legal-check {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: flex-start;
    gap: 10px;
    color: var(--text-secondary);
    font-size: 13px;
    line-height: 1.4;
    font-weight: 650;
  }

  .legal-check input {
    width: 18px;
    height: 18px;
    margin-top: 1px;
    accent-color: var(--accent-strong);
  }

  .legal-check a,
  .legal-links a {
    color: var(--text-primary);
    font-weight: 850;
  }

  .form-check {
    margin-top: 2px;
  }

  .legal-links {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: center;
    font-size: 12px;
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

  .legal-check input[type="checkbox"] {
    width: 18px;
    height: 18px;
    min-width: 18px;
    margin-top: 1px;
    padding: 0;
    box-shadow: none;
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
