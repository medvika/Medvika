(function () {
  const MOBILE_QUERY = "(max-width:700px)";
  const container = () => document.getElementById("pageContainer");
  const routeKey = () => decodeURIComponent((location.hash || "#dashboard").slice(1).split("?")[0]);
  let pageObserver = null;

  function cleanLabel(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isExcludedRoot(root) {
    return !root ||
      routeKey() === "dashboard" ||
      Boolean(root.querySelector(".dashboard-module,.sales-module,.purchase-module"));
  }

  function tableAlreadyMobile(table) {
    if (!window.matchMedia(MOBILE_QUERY).matches) return false;
    const head = table.tHead;
    return getComputedStyle(table).display === "block" ||
      (head && getComputedStyle(head).display === "none");
  }

  function enhanceTable(table) {
    if (!table || table.closest(".sales-module,.purchase-module")) return;
    const wasAudited = table.dataset.mobileAudit === "1";

    const headers = [...table.querySelectorAll("thead th")].map((th) =>
      cleanLabel(th.textContent)
    );
    if (!headers.length) return;

    table.dataset.mobileAudit = "1";

    if (table.closest(".masters-module")) {
      [...table.tBodies].forEach((body) => {
        [...body.rows].forEach((row) => {
          [...row.cells].forEach((cell, index) => {
            if (cell.colSpan > 1 || cell.classList.contains("empty")) return;
            const label = headers[index] || `Column ${index + 1}`;
            if (!cell.dataset.label) cell.dataset.label = label;
            if (/^(action|actions)$/i.test(label)) {
              cell.classList.add("master-actions");
            }
          });
        });
      });
    }

    if (!wasAudited) {
      if (tableAlreadyMobile(table)) {
        table.classList.add("mobile-existing-table");
      } else {
        table.classList.add("mobile-card-table");
      }
    }
    if (table.classList.contains("mobile-existing-table")) return;
    [...table.tBodies].forEach((body) => {
      [...body.rows].forEach((row) => {
        [...row.cells].forEach((cell, index) => {
          if (cell.dataset.mobileLabel || cell.classList.contains("mobile-full-cell")) return;
          if (cell.colSpan > 1 || cell.classList.contains("empty") ||
              cell.classList.contains("purchase-empty") ||
              cell.classList.contains("pr-empty")) {
            cell.classList.add("mobile-full-cell");
            return;
          }

          const label = headers[index] || `Column ${index + 1}`;
          cell.dataset.mobileLabel = label;
          if (/^(action|actions|manage|operation|operations)$/i.test(label)) {
            cell.classList.add("mobile-action-cell");
          }
          if (/^(notes?|description|medicine|supplier|customer|doctor|particulars?|details?)$/i.test(label)) {
            cell.classList.add("mobile-wide-cell");
          }
        });
      });
    });
  }

  function enhanceHeadings(root) {
    root.querySelectorAll(".erp-card").forEach((card) => {
      const first = card.firstElementChild;
      if (!first) return;
      if (
        first.matches("h1,h2,h3") ||
        first.classList.contains("module-heading") ||
        first.classList.contains("table-heading") ||
        first.classList.contains("section-heading") ||
        first.classList.contains("report-heading") ||
        first.classList.contains("page-heading")
      ) {
        first.classList.add("mobile-unified-heading");
      }
    });
  }

  function enhanceActions(root) {
    root.querySelectorAll("button,input[type='submit']").forEach((button) => {
      const signature = [
        button.id,
        button.name,
        button.textContent,
        button.value
      ].filter(Boolean).join(" ");
      if (/\b(save|post|create|submit|apply|confirm|issue|receive|dispatch|upload|import)\b/i.test(signature)) {
        button.classList.add("mobile-primary-action");
      }
    });
  }

  function enhanceRoot() {
    const root = container();
    if (!root) return;

    const route = routeKey();
    root.dataset.mobileRoute = route;
    root.classList.toggle("mobile-erp-route", route !== "dashboard");

    if (isExcludedRoot(root)) return;

    enhanceHeadings(root);
    enhanceActions(root);
    root.querySelectorAll("table").forEach(enhanceTable);
  }

  function resetForViewport() {
    const root = container();
    if (!root) return;
    root.querySelectorAll("table.mobile-existing-table").forEach((table) => {
      if (!tableAlreadyMobile(table)) {
        table.classList.remove("mobile-existing-table");
        table.dataset.mobileAudit = "";
      }
    });
    enhanceRoot();
  }

  function observe() {
    const root = container();
    if (!root || pageObserver) return;

    pageObserver = new MutationObserver((mutations) => {
      let needsEnhancement = false;
      for (const mutation of mutations) {
        if (mutation.type !== "childList" || !mutation.addedNodes.length) continue;
        needsEnhancement = true;
        break;
      }
      if (needsEnhancement) requestAnimationFrame(enhanceRoot);
    });
    pageObserver.observe(root, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", () => {
    observe();
    enhanceRoot();
  });
  window.addEventListener("hashchange", () => setTimeout(enhanceRoot, 0));
  window.addEventListener("resize", () => setTimeout(resetForViewport, 60));

  observe();
  enhanceRoot();
})();
