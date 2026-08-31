window.MedvikaApp = {
  async start() {
    let stage = "startup";

    try {
      stage = "auth.initialize";
      const authenticated = await window.MedvikaAuth.initialize();
      if (!authenticated) return;

      stage = "profile";
      const profile = window.MedvikaAuth?.profile || {};

      stage = "user header";
      const userName = document.getElementById("userName");
      const userRole = document.getElementById("userRole");
      const userInitials = document.getElementById("userInitials");

      if (userName) userName.textContent = window.MedvikaAuth.getDisplayName();
      if (userRole) userRole.textContent = window.MedvikaAuth.formatRole(profile.role || "user");
      if (userInitials) userInitials.textContent = window.MedvikaAuth.getInitials();

      stage = "expiry notifications";
      if (typeof window.MedvikaExpiryNotifications?.initialize === "function") {
        await window.MedvikaExpiryNotifications.initialize();
      }

      stage = "navigation.render";
      if (!window.MedvikaNavigation) throw new Error("MedvikaNavigation is not loaded.");
      window.MedvikaNavigation.render();

      stage = "ui.bindGlobalUi";
      if (typeof window.MedvikaUI?.bindGlobalUi === "function") {
        window.MedvikaUI.bindGlobalUi();
      }

      stage = "ui.bindGlobalSearch";
      if (typeof window.MedvikaUI?.bindGlobalSearch === "function") {
        window.MedvikaUI.bindGlobalSearch();
      }

      stage = "logout handlers";
      const logoutButton = document.getElementById("logoutButton");
      if (logoutButton) logoutButton.onclick = () => window.MedvikaAuth.logout();

      const dropdownLogoutButton = document.getElementById("dropdownLogoutButton");
      if (dropdownLogoutButton) dropdownLogoutButton.onclick = () => window.MedvikaAuth.logout();

      stage = "show app";
      const loader = document.getElementById("appLoader");
      const app = document.getElementById("app");
      if (loader) loader.classList.add("hidden");
      if (app) app.classList.remove("hidden");

      stage = "router.start";
      if (!window.MedvikaRouter) throw new Error("MedvikaRouter is not loaded.");
      window.MedvikaRouter.start();

    } catch (error) {
      console.error("Medvika ERP startup error at stage:", stage, error);

      const loader = document.getElementById("appLoader");
      if (!loader) return;

      const safe = (value) =>
        window.MedvikaUI?.safe
          ? window.MedvikaUI.safe(String(value ?? ""))
          : String(value ?? "")
              .replaceAll("&", "&amp;")
              .replaceAll("<", "&lt;")
              .replaceAll(">", "&gt;");

      loader.innerHTML = `
        <div class="card" style="max-width:850px;margin:40px auto">
          <h2>ERP could not start</h2>
          <p><b>Failed stage:</b> ${safe(stage)}</p>
          <p><b>Error:</b> ${safe(error?.message || error)}</p>
          <details open>
            <summary>Technical detail</summary>
            <pre style="white-space:pre-wrap;overflow:auto">${safe(error?.stack || "No stack available")}</pre>
          </details>
          <button type="button" id="erpStartupRetry">Retry</button>
        </div>
      `;

      const retry = document.getElementById("erpStartupRetry");
      if (retry) retry.onclick = () => location.reload();
    }
  }
};

window.addEventListener("DOMContentLoaded", () => {
  window.MedvikaApp.start();
});
