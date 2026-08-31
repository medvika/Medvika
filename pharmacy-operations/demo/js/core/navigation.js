window.MedvikaNavigation = {
  groups: [
    {
      title: "Overview",
      icon: "⌂",
      standalone: true,
      items: [
        { route: "dashboard", label: "Dashboard", icon: "⌂" }
      ]
    },

    {
      title: "Masters",
      icon: "◫",
      items: [
        { route: "medicines", label: "Medicines", icon: "💊" },
        { route: "manufacturers", label: "Manufacturers", icon: "🏭" },
        { route: "suppliers", label: "Suppliers", icon: "🚚" },
        { route: "customers", label: "Customers", icon: "🧑" },
        { route: "doctors", label: "Doctors", icon: "🩺" }
      ]
    },

    {
      title: "Transactions",
      icon: "⇄",
      items: [
        { route: "sales", label: "Sales Billing", icon: "🧾" },
        { route: "sales-return", label: "Sales Return", icon: "↩️" },
        { route: "sales-cancelled", label: "Cancelled Sales", icon: "🚫" },

        { route: "purchase", label: "Purchase", icon: "📥" },
        { route: "purchase-order", label: "Purchase Order", icon: "📝" },
        { route: "purchase-return", label: "Purchase Return", icon: "↪️" },
        { route: "pr-memo", label: "PR Memo", icon: "📋" }
      ]
    },

    {
      title: "Stock",
      icon: "▣",
      items: [
        { route: "inventory", label: "Inventory & Batches", icon: "📦" },
        { route: "organization-stock", label: "Search Across Branches", icon: "🔎" },
        { route: "stock-transfer", label: "Stock Transfer", icon: "🔁" },
        { route: "stock-adjustment", label: "Stock Adjustment", icon: "⚖️" },
        { route: "damage-expiry", label: "Damage & Expiry", icon: "⚠️" },
        { route: "near-expiry", label: "Near Expiry Automation", icon: "⏳" },
        { route: "stock-audit", label: "Physical Stock Verification", icon: "✅" }
      ]
    },

    {
      title: "Accounts",
      icon: "₹",
      items: [
        { route: "expenses", label: "Expenses", icon: "💰" },
        { route: "cashbook", label: "Cash Book", icon: "📒" },
        { route: "payments", label: "Payments", icon: "💳" },
        { route: "receipts", label: "Receipts", icon: "🧾" },
        { route: "supplier-ledger", label: "Supplier Ledger", icon: "📕" },
        { route: "customer-ledger", label: "Customer Ledger", icon: "📗" }
      ]
    },

    {
      title: "Reports",
      icon: "▥",
      items: [
        /* Reports & Export hub deliberately removed from the sidebar.
           The Reports heading itself now opens this submenu. */

        { route: "sales-report", label: "Sales Report", icon: "📈" },
        { route: "purchase-report", label: "Purchase Report", icon: "📉" },
        { route: "profit-report", label: "Profit Report", icon: "💹" },
        { route: "margin-report", label: "Margin Report", icon: "📊" },

        { route: "stock-report", label: "Stock Summary & Valuation", icon: "📋" },
        { route: "expiry-report", label: "Expiry Report", icon: "⌛" },
        { route: "return-report", label: "Return Report", icon: "🔄" },
        { route: "bounce-report", label: "Lost Sales / Bounce", icon: "📉" },

        /*
         * Detailed GST modules remain routed from the GST workspace.
         * Keep one sidebar entry so the Reports section stays compact.
         */
        { route: "gst-report", label: "GST & Tax Reports", icon: "🧮" },

        /* Chain-level reports will automatically appear after their
           corresponding MedvikaConfig routes are added. */
        { route: "chain-sales-report", label: "Chain Sales Report", icon: "🏬" },
        { route: "chain-stock-report", label: "Chain Stock Report", icon: "📦" },
        { route: "branch-performance", label: "Branch Performance", icon: "📊" }
      ]
    },

    {
      title: "Compliance",
      icon: "✓",
      items: [
        { route: "compliance", label: "Registers", icon: "📘" },
        { route: "h1-register", label: "Schedule H1 Register", icon: "📙" },
        { route: "nrx-register", label: "NRx Register", icon: "📓" },
        { route: "controlled-drugs", label: "Controlled Drugs", icon: "🔐" },
        { route: "audit-log", label: "Audit Log", icon: "🕵️" }
      ]
    },

    {
      title: "Administration",
      icon: "⚙",
      items: [
        { route: "organization", label: "Organization", icon: "🏢" },
        { route: "branches", label: "Branches", icon: "🏬" },
        { route: "users", label: "Users & Staff", icon: "👥" },
        { route: "username-accounts", label: "Create Staff Login", icon: "🔑" },
        { route: "permissions", label: "Roles & Permissions", icon: "🔐" },
        { route: "pharmacy-profile", label: "Branch / Pharmacy Settings", icon: "🏪" },
        { route: "settings", label: "ERP Configuration", icon: "⚙️" },
        { route: "backup", label: "Backup & Restore", icon: "💾" }
      ]
    }
  ],

  openGroup: null,

  injectStyles() {
    if (document.getElementById("medvikaAccordionNavStyles")) return;

    const style = document.createElement("style");
    style.id = "medvikaAccordionNavStyles";
    style.textContent = `
      .sidebar-nav .nav-group{
        margin:4px 8px;
      }

      .sidebar-nav .nav-group-toggle{
        width:100%;
        display:flex;
        align-items:center;
        gap:10px;
        padding:10px 11px;
        border:0;
        border-radius:9px;
        background:transparent;
        color:inherit;
        font:inherit;
        font-weight:700;
        cursor:pointer;
        text-align:left;
      }

      .sidebar-nav .nav-group-toggle:hover{
        background:rgba(255,255,255,.07);
      }

      .sidebar-nav .nav-group-toggle.active-group{
        background:rgba(255,255,255,.08);
      }

      .sidebar-nav .nav-group-icon{
        width:20px;
        min-width:20px;
        text-align:center;
        opacity:.95;
      }

      .sidebar-nav .nav-group-label{
        flex:1;
      }

      .sidebar-nav .nav-chevron{
        font-size:11px;
        transition:transform .18s ease;
        opacity:.7;
      }

      .sidebar-nav .nav-group.open .nav-chevron{
        transform:rotate(90deg);
      }

      .sidebar-nav .nav-group-items{
        display:none;
        padding:3px 0 6px 18px;
      }

      .sidebar-nav .nav-group.open .nav-group-items{
        display:block;
      }

      .sidebar-nav .nav-group-items .nav-link{
        width:100%;
        margin:2px 0;
        padding-top:8px;
        padding-bottom:8px;
        font-size:13px;
      }

      .sidebar-nav .nav-standalone{
        margin:4px 8px 8px;
      }

      .sidebar-nav .nav-standalone .nav-link{
        width:100%;
      }

      @media(max-width:760px){
        .sidebar-nav .nav-group-items{
          padding-left:12px;
        }
      }
    `;
    document.head.appendChild(style);
  },

  getVisibleItems() {
    return this.groups
      .map(group => ({
        ...group,
        items: group.items.filter(item => {
          const route = window.MedvikaConfig?.routes?.[item.route];

          /* Do not show dead navigation entries. */
          if (!route) return false;

          return window.MedvikaAuth.hasPermission(route.permission);
        })
      }))
      .filter(group => group.items.length);
  },

  currentRoute() {
    return (
      window.MedvikaRouter?.currentRoute ||
      location.hash.replace(/^#/, "").split("?")[0] ||
      window.MedvikaConfig?.defaultRoute ||
      "dashboard"
    );
  },

  groupForRoute(routeName) {
    return this.getVisibleItems().find(group =>
      group.items.some(item => item.route === routeName)
    );
  },

  navigate(route) {
    if (!route) return;

    if (
      window.MedvikaRouter &&
      typeof window.MedvikaRouter.navigate === "function"
    ) {
      window.MedvikaRouter.navigate(route);
      return;
    }

    location.hash = route;
  },

  render() {
    const nav = document.getElementById("sidebarNav");

    if (!nav) {
      console.warn("Medvika ERP: sidebarNav element not found.");
      return;
    }

    this.injectStyles();

    const groups = this.getVisibleItems();
    const activeRoute = this.currentRoute();
    const activeGroup = groups.find(group =>
      group.items.some(item => item.route === activeRoute)
    );

    if (activeGroup && !activeGroup.standalone) {
      this.openGroup = activeGroup.title;
    }

    nav.innerHTML = groups.map(group => {
      if (group.standalone && group.items.length === 1) {
        const item = group.items[0];

        return `
          <div class="nav-standalone">
            <button
              type="button"
              class="nav-link ${item.route === activeRoute ? "active" : ""}"
              data-route="${item.route}"
              title="${item.label}"
            >
              <span class="nav-icon">${item.icon}</span>
              <span>${item.label}</span>
            </button>
          </div>
        `;
      }

      const isOpen = this.openGroup === group.title;
      const hasActive = group.items.some(item => item.route === activeRoute);

      return `
        <div
          class="nav-group ${isOpen ? "open" : ""}"
          data-group="${group.title}"
        >
          <button
            type="button"
            class="nav-group-toggle ${hasActive ? "active-group" : ""}"
            data-group-toggle="${group.title}"
            aria-expanded="${isOpen ? "true" : "false"}"
          >
            <span class="nav-group-icon">${group.icon || "›"}</span>
            <span class="nav-group-label">${group.title}</span>
            <span class="nav-chevron">▶</span>
          </button>

          <div class="nav-group-items">
            ${group.items.map(item => `
              <button
                type="button"
                class="nav-link ${item.route === activeRoute ? "active" : ""}"
                data-route="${item.route}"
                title="${item.label}"
              >
                <span class="nav-icon">${item.icon}</span>
                <span>${item.label}</span>
              </button>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

    nav.querySelectorAll("[data-group-toggle]").forEach(button => {
      button.onclick = () => {
        const title = button.dataset.groupToggle;

        this.openGroup =
          this.openGroup === title
            ? null
            : title;

        /*
         * Accordion behaviour:
         * only one main section is expanded at a time.
         */
        nav.querySelectorAll(".nav-group").forEach(groupEl => {
          const open = groupEl.dataset.group === this.openGroup;
          groupEl.classList.toggle("open", open);

          const toggle = groupEl.querySelector(".nav-group-toggle");
          if (toggle) {
            toggle.setAttribute(
              "aria-expanded",
              open ? "true" : "false"
            );
          }
        });
      };
    });

    nav.querySelectorAll("[data-route]").forEach(button => {
      button.onclick = () => {
        const route = button.dataset.route;

        const parent = this.groupForRoute(route);
        if (parent && !parent.standalone) {
          this.openGroup = parent.title;
        }

        this.navigate(route);
      };
    });
  },

  setActive(routeName) {
    document.querySelectorAll(".nav-link").forEach(link => {
      link.classList.toggle(
        "active",
        link.dataset.route === routeName
      );
    });

    const activeGroup = this.groupForRoute(routeName);

    document.querySelectorAll(".nav-group").forEach(groupEl => {
      const isActiveGroup =
        activeGroup &&
        groupEl.dataset.group === activeGroup.title;

      const toggle = groupEl.querySelector(".nav-group-toggle");
      if (toggle) {
        toggle.classList.toggle("active-group", !!isActiveGroup);
      }
    });

    /*
     * Automatically open the group containing the route that was
     * reached from search, dashboard, browser history, etc.
     */
    if (activeGroup && !activeGroup.standalone) {
      this.openGroup = activeGroup.title;

      document.querySelectorAll(".nav-group").forEach(groupEl => {
        const open = groupEl.dataset.group === activeGroup.title;
        groupEl.classList.toggle("open", open);

        const toggle = groupEl.querySelector(".nav-group-toggle");
        if (toggle) {
          toggle.setAttribute(
            "aria-expanded",
            open ? "true" : "false"
          );
        }
      });
    }
  },

  getSearchableItems() {
    return this.getVisibleItems()
      .flatMap(group =>
        group.items.map(item => ({
          ...item,
          group: group.title
        }))
      );
  }
};
