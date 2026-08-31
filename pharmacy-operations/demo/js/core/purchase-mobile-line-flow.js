(function () {
  const isMobile = () => window.matchMedia("(max-width:620px)").matches;
  const tableBody = () => document.querySelector("#purchaseItemsTable tbody");
  const searchInput = () => document.getElementById("purchaseMedicineSearch");
  const completedKeys = new Set();
  let observer = null;
  let pageObserver = null;

  function rowKey(row) {
    if (!row) return "";
    const medicine = (row.children[0]?.innerText || "").replace(/\s+/g, " ").trim();
    const batch = row.querySelector(".batch")?.value?.trim() || "";
    return `${medicine}::${batch}`;
  }

  function notify(message, type = "warning") {
    if (window.MedvikaUI?.toast) {
      window.MedvikaUI.toast(message, type);
    }
  }

  function validateRow(row) {
    const fields = [
      { selector: ".batch", label: "Batch number", valid: (value) => value.trim().length > 0 },
      {
        selector: ".expiry",
        label: "Expiry in DD-MM-YYYY",
        valid: (value) => /^\d{2}-\d{2}-\d{4}$/.test(value.trim())
      },
      { selector: ".qty", label: "Paid quantity", valid: (value) => Number(value) > 0 },
      { selector: ".ptr", label: "PTR", valid: (value) => Number(value) > 0 },
      { selector: ".mrp", label: "MRP", valid: (value) => Number(value) > 0 }
    ];

    row.querySelectorAll(".mobile-line-invalid").forEach((field) =>
      field.classList.remove("mobile-line-invalid")
    );

    for (const field of fields) {
      const input = row.querySelector(field.selector);
      if (!input || field.valid(input.value)) continue;
      input.classList.add("mobile-line-invalid");
      notify(`${field.label} is required before completing this medicine.`);
      input.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => input.focus(), 120);
      return false;
    }
    return true;
  }

  function applyState(row) {
    const key = rowKey(row);
    row.classList.toggle("mobile-purchase-line-complete", Boolean(key && completedKeys.has(key)));
  }

  function enhanceRow(row) {
    if (!isMobile() || !row || row.querySelector(".purchase-empty")) return;

    if (row.dataset.mobilePurchaseFlow !== "1") {
      row.dataset.mobilePurchaseFlow = "1";
      const action = row.children[13];
      if (action) {
        const done = document.createElement("button");
        done.type = "button";
        done.className = "mobile-purchase-line-done";
        done.textContent = "✓ Done / Next Medicine";
        done.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const lineIndex = row.querySelector("[data-i]")?.dataset.i;
          const active = document.activeElement;
          if (active && row.contains(active) && active.matches("input,select,textarea")) {
            active.dispatchEvent(new Event("change", { bubbles: true }));
            setTimeout(() => {
              const current = document.querySelector(
                `#purchaseItemsTable tbody [data-i="${lineIndex}"]`
              )?.closest("tr");
              if (current) finishRow(current);
            }, 0);
          } else {
            finishRow(row);
          }
        });
        done.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        action.insertBefore(done, action.firstChild);
      }
    }
    applyState(row);
  }

  function finishRow(row) {
    if (!isMobile() || !validateRow(row)) return;

    const key = rowKey(row);
    if (key) completedKeys.add(key);
    row.classList.add("mobile-purchase-line-complete");

    const search = searchInput();
    if (search) {
      search.value = "";
      search.dispatchEvent(new Event("input", { bubbles: true }));
      setTimeout(() => {
        search.scrollIntoView({ behavior: "smooth", block: "center" });
        try {
          search.focus({ preventScroll: true });
        } catch (_) {
          search.focus();
        }
      }, 100);
    }
  }

  function reopenRow(row) {
    const key = rowKey(row);
    if (key) completedKeys.delete(key);
    row.classList.remove("mobile-purchase-line-complete");
    setTimeout(() => row.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  }

  document.addEventListener("click", (event) => {
    if (!isMobile()) return;
    const row = event.target?.closest?.("#purchaseItemsTable tbody tr");
    if (!row) return;

    const button = event.target.closest("button");
    if (button && !button.classList.contains("mobile-purchase-line-done")) {
      completedKeys.delete(rowKey(row));
      return;
    }

    if (row.classList.contains("mobile-purchase-line-complete") && !button) {
      reopenRow(row);
    }
  }, true);

  function syncRows() {
    const body = tableBody();
    if (!body) return;
    [...body.rows].forEach(enhanceRow);
  }

  function init() {
    const body = tableBody();
    if (!body) return;
    syncRows();
    if (observer) observer.disconnect();
    observer = new MutationObserver(() => requestAnimationFrame(syncRows));
    observer.observe(body, { childList: true, subtree: false });
  }

  function observeRouteContent() {
    const container = document.getElementById("pageContainer");
    if (!container || pageObserver) return;
    pageObserver = new MutationObserver(() => setTimeout(init, 0));
    pageObserver.observe(container, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    observeRouteContent();
    init();
  });
  observeRouteContent();
  document.addEventListener("click", () => setTimeout(init, 0), true);
  document.addEventListener("input", (event) => {
    if (event.target?.closest?.("#purchaseItemsTable")) setTimeout(syncRows, 0);
  });
  document.addEventListener("change", (event) => {
    if (event.target?.closest?.("#purchaseItemsTable")) setTimeout(syncRows, 0);
  });
  window.addEventListener("resize", () => setTimeout(init, 0));
})();
