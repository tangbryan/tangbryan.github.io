// script.js — tab switching, carousel keyboard scroll, and small reveal effects
document.addEventListener('DOMContentLoaded', () => {
    // Only treat button elements with class 'tab' as tab controls
    const tabs = document.querySelectorAll('button.tab');
    const panels = document.querySelectorAll('.panel');

    function activate(targetId) {
        tabs.forEach(t => { t.classList.toggle('active', t.dataset.target === targetId); t.setAttribute('aria-selected', t.dataset.target === targetId) });
        panels.forEach(p => p.classList.toggle('active', p.id === targetId));
        // scroll to top of main on tab change for a clean focus
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    tabs.forEach(t => t.addEventListener('click', () => activate(t.dataset.target)));

    // keyboard navigation between tabs
    document.addEventListener('keydown', (e) => {
        const activeIndex = Array.from(tabs).findIndex(t => t.classList.contains('active'));
        if (e.key === 'ArrowLeft') {
            const prev = (activeIndex - 1 + tabs.length) % tabs.length; tabs[prev].click();
        } else if (e.key === 'ArrowRight') {
            const next = (activeIndex + 1) % tabs.length; tabs[next].click();
        }
    });

    // horizontal scroll keyboard handling for project carousel
    const carousels = document.querySelectorAll('.horizontal-scroll');
    carousels.forEach(carousel => {
        carousel.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') carousel.scrollBy({ left: 300, behavior: 'smooth' });
            if (e.key === 'ArrowLeft') carousel.scrollBy({ left: -300, behavior: 'smooth' });
        });
    });

    // No scroll-driven fading: keep only keyboard and tab logic plus carousel keyboard handling
});
