document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("blogSearch");
    const categoryButtons = document.querySelectorAll(".category-filter");
    const articleCards = document.querySelectorAll(".blog-article-card");
    const noArticlesMessage = document.getElementById("noArticlesMessage");

    const newsletterForm = document.getElementById("newsletterForm");
    const newsletterEmail = document.getElementById("newsletterEmail");
    const newsletterMessage = document.getElementById("newsletterMessage");

    let selectedCategory = "all";

    /* =========================================
       BLOG SEARCH AND CATEGORY FILTER
    ========================================= */

    function filterArticles() {
        const searchTerm = searchInput
            ? searchInput.value.trim().toLowerCase()
            : "";

        let visibleArticles = 0;

        articleCards.forEach((card) => {
            const articleCategory =
                card.dataset.category?.toLowerCase() || "";

            const searchableText = [
                card.dataset.title || "",
                card.textContent || ""
            ]
                .join(" ")
                .toLowerCase();

            const matchesCategory =
                selectedCategory === "all" ||
                articleCategory === selectedCategory;

            const matchesSearch =
                searchTerm === "" ||
                searchableText.includes(searchTerm);

            const shouldShow = matchesCategory && matchesSearch;

            card.classList.toggle("is-hidden", !shouldShow);

            if (shouldShow) {
                visibleArticles += 1;
            }
        });

        if (noArticlesMessage) {
            noArticlesMessage.hidden = visibleArticles > 0;
        }
    }

    if (searchInput) {
        searchInput.addEventListener("input", filterArticles);
    }

    categoryButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selectedCategory = button.dataset.category || "all";

            categoryButtons.forEach((item) => {
                item.classList.remove("active");
                item.setAttribute("aria-pressed", "false");
            });

            button.classList.add("active");
            button.setAttribute("aria-pressed", "true");

            filterArticles();
        });
    });

    /* =========================================
       NEWSLETTER FORM
       Temporary front-end confirmation only
    ========================================= */

    if (newsletterForm && newsletterEmail && newsletterMessage) {
        newsletterForm.addEventListener("submit", (event) => {
            event.preventDefault();

            const email = newsletterEmail.value.trim();

            if (!isValidEmail(email)) {
                showNewsletterMessage(
                    "Please enter a valid email address.",
                    "error"
                );
                return;
            }

            showNewsletterMessage(
                "Thank you for subscribing to Medvika updates.",
                "success"
            );

            newsletterForm.reset();
        });
    }

    function isValidEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    }

    function showNewsletterMessage(message, type) {
        if (!newsletterMessage) return;

        newsletterMessage.textContent = message;
        newsletterMessage.classList.remove(
            "newsletter-success",
            "newsletter-error"
        );

        if (type === "success") {
            newsletterMessage.classList.add("newsletter-success");
        } else {
            newsletterMessage.classList.add("newsletter-error");
        }
    }

    /* =========================================
       MOBILE MENU FALLBACK
       Runs only if main.js does not handle it
    ========================================= */

    const mobileMenuButton = document.getElementById("mobileMenuBtn");
    const navbar = document.getElementById("navbar");

    if (mobileMenuButton && navbar) {
        mobileMenuButton.addEventListener("click", () => {
            const isOpen = navbar.classList.toggle("active");

            mobileMenuButton.setAttribute(
                "aria-expanded",
                String(isOpen)
            );

            const icon = mobileMenuButton.querySelector("i");

            if (icon) {
                icon.classList.toggle("fa-bars", !isOpen);
                icon.classList.toggle("fa-xmark", isOpen);
            }
        });

        navbar.querySelectorAll("a").forEach((link) => {
            link.addEventListener("click", () => {
                navbar.classList.remove("active");

                mobileMenuButton.setAttribute(
                    "aria-expanded",
                    "false"
                );

                const icon = mobileMenuButton.querySelector("i");

                if (icon) {
                    icon.classList.add("fa-bars");
                    icon.classList.remove("fa-xmark");
                }
            });
        });
    }

    filterArticles();
});
