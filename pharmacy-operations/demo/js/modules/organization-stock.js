window.initOrganizationStockModule = async function () {
  const UI = window.MedvikaUI;
  const $ = id => document.getElementById(id);

  const input = $("orgStockSearch");
  const button = $("orgStockSearchButton");
  const results = $("orgStockResults");
  const message = $("orgStockMessage");

  function showMessage(text, type = "info") {
    message.hidden = false;
    message.className = `org-stock-message ${type}`;
    message.textContent = text;
  }

  function clearMessage() {
    message.hidden = true;
    message.textContent = "";
  }

  function safe(value) {
    return UI?.safe ? UI.safe(value ?? "") : String(value ?? "");
  }

  function qty(value) {
    const number = Number(value || 0);
    return Number.isFinite(number)
      ? number.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : "0";
  }

  function render(rows) {
    if (!rows?.length) {
      results.innerHTML = "";
      showMessage("No matching stock found in your organization.", "info");
      return;
    }

    clearMessage();

    const grouped = new Map();

    for (const row of rows) {
      const key = row.medicine_id || `${row.brand_name}|${row.generic_name}|${row.composition}`;

      if (!grouped.has(key)) {
        grouped.set(key, {
          brand_name: row.brand_name,
          generic_name: row.generic_name,
          composition: row.composition,
          branches: []
        });
      }

      grouped.get(key).branches.push(row);
    }

    results.innerHTML = [...grouped.values()].map(item => {
      const branches = item.branches
        .sort((a, b) => Number(b.quantity_available || 0) - Number(a.quantity_available || 0))
        .map(row => {
          const available = Number(row.quantity_available || 0);
          return `
            <div class="org-stock-branch">
              <div>
                <strong>${safe(row.pharmacy_name || "Branch")}</strong>
                <span>${safe(row.store_code || "")}</span>
              </div>
              <div class="org-stock-qty ${available > 0 ? "available" : "empty"}">
                ${qty(available)}
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <article class="org-stock-product">
          <div class="org-stock-product-head">
            <div>
              <h3>${safe(item.brand_name || "Medicine")}</h3>
              ${item.generic_name ? `<p>${safe(item.generic_name)}</p>` : ""}
              ${item.composition ? `<small>${safe(item.composition)}</small>` : ""}
            </div>
            <span class="readonly-badge">Read only</span>
          </div>

          <div class="org-stock-branch-list">
            ${branches}
          </div>
        </article>
      `;
    }).join("");
  }

  async function search() {
    const term = input.value.trim();

    if (term.length < 2) {
      results.innerHTML = "";
      return showMessage("Enter at least 2 characters to search.", "warning");
    }

    const oldText = button.textContent;

    try {
      button.disabled = true;
      button.textContent = "Searching...";
      clearMessage();

      const { data, error } = await supabaseClient.rpc(
        "search_organization_stock",
        { p_search_text: term }
      );

      if (error) throw error;

      render(data || []);
    } catch (error) {
      console.error("Organization stock search failed:", error);
      results.innerHTML = "";
      showMessage(
        error?.message || "Unable to search organization stock.",
        "error"
      );
    } finally {
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  button.onclick = search;

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  });

  input.focus();
};
