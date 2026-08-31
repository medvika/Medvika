
window.MedvikaUI = {
  safe(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  },

  money(value) {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 2
    }).format(Number(value || 0));
  },

  toast(message, type = "success") {
    const container =
      document.getElementById("toastContainer");

    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3500);
  },

  openSidebar() {
    document.getElementById("sidebar")
      .classList.add("open");

    document.getElementById("sidebarBackdrop")
      .classList.add("open");
  },

  closeSidebar() {
    document.getElementById("sidebar")
      .classList.remove("open");

    document.getElementById("sidebarBackdrop")
      .classList.remove("open");
  },

  bindGlobalUi() {
    const menuButton =
      document.getElementById("menuButton");

    const backdrop =
      document.getElementById("sidebarBackdrop");

    const userButton =
      document.getElementById("userMenuButton");

    const dropdown =
      document.getElementById("userDropdown");

    menuButton.onclick = () =>
      this.openSidebar();

    backdrop.onclick = () =>
      this.closeSidebar();

    userButton.onclick = () =>
      dropdown.classList.toggle("open");

    document.addEventListener("click", (event) => {
      if (
        !event.target.closest(".user-menu-wrap")
      ) {
        dropdown.classList.remove("open");
      }
    });
  },

  bindGlobalSearch() {
    const input =
      document.getElementById("globalSearch");

    const results =
      document.getElementById("globalSearchResults");

    input.oninput = () => {
      const query =
        input.value.trim().toLowerCase();

      if (!query) {
        results.classList.remove("open");
        results.innerHTML = "";
        return;
      }

      const items =
        window.MedvikaNavigation
          .getSearchableItems()
          .filter((item) =>
            `${item.label} ${item.group}`
              .toLowerCase()
              .includes(query)
          );

      results.innerHTML = items.length
        ? items.map((item) => `
            <button
              type="button"
              class="search-result-button"
              data-search-route="${item.route}"
            >
              <b>${item.label}</b>
              <br>
              <small>${item.group}</small>
            </button>
          `).join("")
        : `
          <div style="padding:12px">
            No module found
          </div>
        `;

      results.classList.add("open");

      results
        .querySelectorAll("[data-search-route]")
        .forEach((button) => {
          button.onclick = () => {
            window.MedvikaRouter.navigate(
              button.dataset.searchRoute
            );

            input.value = "";
            results.classList.remove("open");
          };
        });
    };
  }
};
