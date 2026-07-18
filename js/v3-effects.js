
document.addEventListener("DOMContentLoaded", function () {
    const header = document.querySelector(".header");
    const backToTop = document.getElementById("backToTop");
    const revealElements = document.querySelectorAll(".reveal-section, .reveal-item");
    const navLinks = document.querySelectorAll('.navbar a[href^="#"]');
    const sections = Array.from(navLinks)
        .map(function (link) {
            const id = link.getAttribute("href");
            return document.querySelector(id);
        })
        .filter(Boolean);

    function handleScrollState() {
        const y = window.scrollY || document.documentElement.scrollTop;

        if (header) {
            header.classList.toggle("header-scrolled", y > 35);
        }

        if (backToTop) {
            backToTop.classList.toggle("visible", y > 650);
        }
    }

    handleScrollState();
    window.addEventListener("scroll", handleScrollState, { passive: true });

    if (backToTop) {
        backToTop.addEventListener("click", function () {
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    }

    if ("IntersectionObserver" in window) {
        const revealObserver = new IntersectionObserver(
            function (entries, observer) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
        );

        revealElements.forEach(function (element) {
            revealObserver.observe(element);
        });

        const sectionObserver = new IntersectionObserver(
            function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;

                    navLinks.forEach(function (link) {
                        link.classList.toggle(
                            "active",
                            link.getAttribute("href") === "#" + entry.target.id
                        );
                    });
                });
            },
            { threshold: 0.35, rootMargin: "-20% 0px -55% 0px" }
        );

        sections.forEach(function (section) {
            sectionObserver.observe(section);
        });
    } else {
        revealElements.forEach(function (element) {
            element.classList.add("is-visible");
        });
    }
});
