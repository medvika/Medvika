window.MedvikaExpiryNotifications = {
  menu: null,

  localDateKey() {
    const date = new Date();
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  },

  async initialize() {
    const button = document.getElementById("notificationButton");
    const count = document.getElementById("notificationCount");
    const pharmacyId = window.MedvikaAuth?.profile?.pharmacy_id;
    if (!button || !count || !pharmacyId) return;

    button.setAttribute("aria-label", "Open action notifications");
    button.setAttribute("aria-expanded", "false");

    try {
      const { data: cases, error: caseError } = await supabaseClient
        .from("damage_expiry_register")
        .select("id,register_type,status,medicine_batch_id,expected_claim_value,created_at")
        .eq("pharmacy_id", pharmacyId)
        .in("status", ["IDENTIFIED", "BLOCKED", "PR_MEMO_CREATED", "PARTIALLY_SETTLED"])
        .order("created_at", { ascending: false })
        .limit(100);
      if (caseError) throw caseError;

      const ids = (cases || []).map((row) => row.id);
      let followups = [];
      if (ids.length) {
        const { data, error } = await supabaseClient
          .from("damage_expiry_followups")
          .select("damage_expiry_case_id,next_followup_date,followup_date")
          .in("damage_expiry_case_id", ids)
          .order("followup_date", { ascending: false });
        if (error) throw error;
        followups = data || [];
      }

      const latest = new Map();
      followups.forEach((row) => {
        if (!latest.has(row.damage_expiry_case_id)) latest.set(row.damage_expiry_case_id, row);
      });

      const today = this.localDateKey();
      const due = (cases || []).filter((row) => {
        const followup = latest.get(row.id);
        return !followup?.next_followup_date || followup.next_followup_date <= today;
      });
      const waiting = Math.max(0, (cases || []).length - due.length);

      count.textContent = String(due.length);
      count.hidden = due.length === 0;
      button.classList.toggle("has-notifications", due.length > 0);
      this.renderMenu({ due: due.length, waiting, total: (cases || []).length });
      button.onclick = (event) => {
        event.stopPropagation();
        this.toggle();
      };
      document.addEventListener("click", (event) => {
        if (this.menu && !this.menu.contains(event.target) && event.target !== button) this.close();
      });
    } catch (error) {
      console.warn("Expiry notifications could not load:", error);
      count.textContent = "0";
      count.hidden = true;
    }
  },

  renderMenu(summary) {
    this.menu?.remove();
    const menu = document.createElement("div");
    menu.className = "expiry-notification-menu";
    menu.hidden = true;
    menu.innerHTML = `
      <div class="expiry-notification-heading">
        <strong>Expiry Action Queue</strong>
        <small>Updated from live cases</small>
      </div>
      <button type="button" data-filter="followup-due">
        <span><b>${summary.due}</b> follow-up${summary.due === 1 ? "" : "s"} due</span>
        <small>Open cases requiring action now</small>
      </button>
      <button type="button" data-filter="open">
        <span><b>${summary.total}</b> open case${summary.total === 1 ? "" : "s"}</span>
        <small>${summary.waiting} waiting for a future follow-up</small>
      </button>
    `;
    document.querySelector(".topbar-actions")?.appendChild(menu);
    menu.querySelectorAll("button[data-filter]").forEach((item) => {
      item.onclick = () => {
        sessionStorage.setItem(
          "medvikaDashboardFilter:damage-expiry",
          item.dataset.filter === "followup-due" ? "followup-due" : "open"
        );
        this.close();
        location.hash = "damage-expiry";
      };
    });
    this.menu = menu;
  },

  toggle() {
    if (!this.menu) return;
    const open = this.menu.hidden;
    this.menu.hidden = !open;
    document.getElementById("notificationButton")?.setAttribute("aria-expanded", String(open));
  },

  close() {
    if (this.menu) this.menu.hidden = true;
    document.getElementById("notificationButton")?.setAttribute("aria-expanded", "false");
  }
};
