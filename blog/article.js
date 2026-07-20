document.addEventListener("DOMContentLoaded", () => {
    const progressBar = document.querySelector(".reading-progress");
    const articleContent = document.querySelector(".article-content");
    const tocLinks = document.querySelectorAll(".article-toc a");
    const headings = document.querySelectorAll(".article-content h2[id], .article-content h3[id]");
    const faqQuestions = document.querySelectorAll(".faq-question");
    const copyButtons = document.querySelectorAll(".copy-article-link");
    const shareButtons = document.querySelectorAll("[data-share]");
    const readingTimeElement = document.querySelector("[data-reading-time]");

    /* Reading progress bar */
    const updateReadingProgress = () => {
        if (!progressBar || !articleContent) return;

        const articleTop = articleContent.offsetTop;
        const articleHeight = articleContent.offsetHeight;
        const scrollPosition = window.scrollY;
        const viewportHeight = window.innerHeight;

        const readableDistance = articleHeight - viewportHeight;
        const scrolledDistance = scrollPosition - articleTop + 120;

        let progress = 0;

        if (readableDistance > 0) {
            progress = (scrolledDistance / readableDistance) * 100;
        }

        progress = Math.max(0, Math.min(100, progress));
        progressBar.style.width = `${progress}%`;
    };

    /* Calculate reading time */
    if (articleContent && readingTimeElement) {
        const articleText = articleContent.innerText.trim();
        const wordCount = articleText
            ? articleText.split(/\s+/).length
            : 0;

        const readingTime = Math.max(1, Math.ceil(wordCount / 220));

        readingTimeElement.textContent = `${readingTime} min read`;
    }

    /* Highlight active table of contents section */
    const updateActiveTocLink = () => {
        if (!headings.length || !tocLinks.length) return;

        let activeHeadingId = "";

        headings.forEach((heading) => {
            const headingTop = heading.getBoundingClientRect().top;

            if (headingTop <= 160) {
                activeHeadingId = heading.id;
            }
        });

        tocLinks.forEach((link) => {
            const targetId = link.getAttribute("href")?.replace("#", "");

            link.classList.toggle("active", targetId === activeHeadingId);
        });
    };

    /* Smooth table of contents navigation */
    tocLinks.forEach((link) => {
        link.addEventListener("click", (event) => {
            const targetSelector = link.getAttribute("href");

            if (!targetSelector || !targetSelector.startsWith("#")) return;

            const targetElement = document.querySelector(targetSelector);

            if (!targetElement) return;

            event.preventDefault();

            targetElement.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

            history.replaceState(null, "", targetSelector);
        });
    });

    /* FAQ accordion */
    faqQuestions.forEach((question) => {
        question.addEventListener("click", () => {
            const faqItem = question.closest(".faq-item");

            if (!faqItem) return;

            const isOpen = faqItem.classList.contains("active");

            document.querySelectorAll(".faq-item.active").forEach((item) => {
                item.classList.remove("active");

                const openButton = item.querySelector(".faq-question");

                if (openButton) {
                    openButton.setAttribute("aria-expanded", "false");
                }
            });

            if (!isOpen) {
                faqItem.classList.add("active");
                question.setAttribute("aria-expanded", "true");
            }
        });
    });

    /* Copy article link */
    copyButtons.forEach((button) => {
        button.addEventListener("click", async () => {
            const messageElement =
                button.closest(".article-share-sidebar")
                    ?.querySelector(".copy-link-message") ||
                document.querySelector(".mobile-copy-message");

            try {
                await navigator.clipboard.writeText(window.location.href);

                if (messageElement) {
                    messageElement.textContent = "Link copied";
                }

                setTimeout(() => {
                    if (messageElement) {
                        messageElement.textContent = "";
                    }
                }, 2500);
            } catch (error) {
                window.prompt(
                    "Copy this article link:",
                    window.location.href
                );
            }
        });
    });

    /* Social sharing */
    shareButtons.forEach((button) => {
        button.addEventListener("click", (event) => {
            const platform = button.dataset.share;
            const articleUrl = encodeURIComponent(window.location.href);
            const articleTitle = encodeURIComponent(document.title);

            let shareUrl = "";

            if (platform === "whatsapp") {
                shareUrl =
                    `https://wa.me/?text=${articleTitle}%20${articleUrl}`;
            }

            if (platform === "linkedin") {
                shareUrl =
                    `https://www.linkedin.com/sharing/share-offsite/?url=${articleUrl}`;
            }

            if (platform === "facebook") {
                shareUrl =
                    `https://www.facebook.com/sharer/sharer.php?u=${articleUrl}`;
            }

            if (!shareUrl) return;

            event.preventDefault();

            window.open(
                shareUrl,
                "shareArticle",
                "width=720,height=560,noopener,noreferrer"
            );
        });
    });

    window.addEventListener("scroll", () => {
        updateReadingProgress();
        updateActiveTocLink();
    });

    window.addEventListener("resize", updateReadingProgress);

    updateReadingProgress();
    updateActiveTocLink();
});
/* Blog article mobile navigation */

const articleMenuToggle = document.getElementById("articleMenuToggle");
const articleNavigation = document.getElementById("articleNavigation");

if (articleMenuToggle && articleNavigation) {

    articleMenuToggle.addEventListener("click", function () {

        const menuIsOpen = articleNavigation.classList.toggle("active");

        articleMenuToggle.classList.toggle("active", menuIsOpen);

        articleMenuToggle.setAttribute(
            "aria-expanded",
            menuIsOpen ? "true" : "false"
        );

    });

    articleNavigation.querySelectorAll("a").forEach(function (link) {

        link.addEventListener("click", function () {

            articleNavigation.classList.remove("active");
            articleMenuToggle.classList.remove("active");
            articleMenuToggle.setAttribute("aria-expanded", "false");

        });

    });

}
const pageURL = encodeURIComponent(window.location.href);
const pageTitle = encodeURIComponent(document.title);

document.getElementById("share-whatsapp").href =
`https://wa.me/?text=${pageTitle}%20${pageURL}`;

document.getElementById("share-facebook").href =
`https://www.facebook.com/sharer/sharer.php?u=${pageURL}`;

document.getElementById("share-linkedin").href =
`https://www.linkedin.com/sharing/share-offsite/?url=${pageURL}`;

document.getElementById("copy-link").addEventListener("click", async () => {

    await navigator.clipboard.writeText(window.location.href);

    alert("Article link copied!");

});
