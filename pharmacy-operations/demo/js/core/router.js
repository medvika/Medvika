window.MedvikaRouter = {
  currentRoute: null,

  removeCurrentModuleAssets() {
    document.querySelectorAll("script[data-module-script], link[data-module-style]")
      .forEach((asset) => asset.remove());
  },

  async loadModuleStyle(routeName, stylePath) {
    document.querySelectorAll("link[data-module-style]")
      .forEach((link) => link.remove());

    if (!stylePath) return;

    await new Promise((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = `${stylePath}?v=${Date.now()}`;
      link.dataset.moduleStyle = routeName;
      link.onload = resolve;
      link.onerror = () => reject(new Error(`Could not load ${stylePath}`));
      document.head.appendChild(link);
    });
  },

  async loadModuleScripts(routeName, scriptPaths) {
    document.querySelectorAll("script[data-module-script]")
      .forEach((script) => script.remove());

    for (const scriptPath of scriptPaths) {
      if (!scriptPath) continue;

      await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = `${scriptPath}?v=${Date.now()}`;
        script.dataset.moduleScript = routeName;
        script.onload = resolve;
        script.onerror = () => reject(new Error(`Could not load ${scriptPath}`));
        document.body.appendChild(script);
      });
    }
  },

  async loadModuleScript(routeName, scriptPath) {
    if (!scriptPath) {
      document.querySelectorAll("script[data-module-script]")
        .forEach((script) => script.remove());
      return;
    }

    await this.loadModuleScripts(routeName, [scriptPath]);
  },

  async loadModuleAssets(routeName, route) {
    await this.loadModuleStyle(routeName, route.style);

    if (Array.isArray(route.scripts) && route.scripts.length) {
      await this.loadModuleScripts(routeName, route.scripts);
    } else {
      await this.loadModuleScript(routeName, route.script);
    }
  },

  getRouteFromHash() {
    return window.location.hash.replace("#", "").trim() || window.MedvikaConfig.defaultRoute;
  },

  async navigate(routeName, updateHash = true) {
    const route = window.MedvikaConfig.routes[routeName];

    if (!route) {
      window.MedvikaUI.toast("Module not found.", "error");
      return;
    }

    if (!window.MedvikaAuth.hasPermission(route.permission)) {
      window.MedvikaUI.toast("You do not have permission to access this module.", "error");
      return;
    }

    /*
     * Changing the hash already triggers start()'s hashchange listener.
     * Return here so a sidebar click cannot start two competing module loads
     * that remove one another's scripts and styles.
     */
    if (updateHash) {
      const currentHash = this.getRouteFromHash();

      if (currentHash !== routeName) {
        window.location.hash = routeName;
        return;
      }
    }

    const container = document.getElementById("pageContainer");
    if (!container) throw new Error("pageContainer element not found.");

    // Each ERP module should open at its own top, not inherit the previous page's scroll position.
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    container.scrollTop = 0;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    container.innerHTML = `<div class="content-loading">Loading ${window.MedvikaUI.safe(route.title)}...</div>`;

    try {
      const response = await fetch(route.file, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${route.file}`);

      container.innerHTML = await response.text();
      await this.loadModuleAssets(routeName, route);

      const pageTitle = document.getElementById("pageTitle");
      const breadcrumb = document.getElementById("breadcrumb");

      if (pageTitle) pageTitle.textContent = route.title;
      if (breadcrumb) breadcrumb.textContent = route.breadcrumb;

      document.title = `${route.title} | ${window.MedvikaConfig.appName}`;
      this.currentRoute = routeName;

      window.MedvikaNavigation.setActive(routeName);
      window.MedvikaUI.closeSidebar();

      const initName = route.init || `init${routeName.replace(/(^|-)(\w)/g, (_, __, character) => character.toUpperCase())}Module`;
      if (typeof window[initName] === "function") await window[initName]();

      // Re-assert top position after asynchronous module rendering and sidebar close.
      requestAnimationFrame(() => {
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });
        container.scrollTop = 0;
      });

    } catch (error) {
      console.error(`Failed to load route "${routeName}":`, error);
      this.removeCurrentModuleAssets();
      container.innerHTML = `<section class="card"><h2>Module could not load</h2><p>${window.MedvikaUI.safe(error.message)}</p></section>`;
      window.MedvikaUI.toast(error.message, "error");
    }
  },

  start() {
    window.addEventListener("hashchange", () => {
      this.navigate(this.getRouteFromHash(), false);
    });

    this.navigate(this.getRouteFromHash(), false);
  }
};
