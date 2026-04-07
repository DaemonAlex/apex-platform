// APEX brand configuration. Extracted from index.html in 2026-04 so the
// page can serve a strict CSP without 'unsafe-inline' on script-src.
// Loaded synchronously before the rest of the body so APEX_BRAND is
// available to any code that runs during initial render.

window.APEX_BRAND = {
    logo: '/images/logo.png',
    name: 'APEX',
    company: ''
};

// Apply branding to all logo elements on page load
document.addEventListener('DOMContentLoaded', function() {
    document.querySelectorAll('[data-brand-logo]').forEach(function(img) {
        img.src = window.APEX_BRAND.logo;
        if (window.APEX_BRAND.name) img.alt = window.APEX_BRAND.name;
    });
    if (window.APEX_BRAND.name) {
        document.title = window.APEX_BRAND.name + ' Platform';
    }
    if (typeof updateThemeIcon === 'function') updateThemeIcon();
});
