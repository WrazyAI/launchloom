/* Scroll reveal and local-only form feedback for this fictional Story adaptation. */
(() => {
	const body = document.body;
	const animated = document.querySelectorAll('.onscroll-image-fade-in');
	if ('IntersectionObserver' in window) {
		const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
			if (entry.isIntersecting) {
				entry.target.classList.remove('is-inactive');
				entry.target.classList.add('is-revealed');
				observer.unobserve(entry.target);
			}
		}), { threshold: 0.12 });
		animated.forEach((section) => { section.classList.add('is-inactive'); observer.observe(section); });
	} else animated.forEach((section) => section.classList.add('is-revealed'));
	document.querySelectorAll('[data-demo-form]').forEach((form) => form.addEventListener('submit', (event) => {
		event.preventDefault();
		form.querySelector('.form-status').textContent = 'Design preview only. No information was sent.';
	}));
	window.addEventListener('load', () => window.setTimeout(() => body.classList.remove('is-preload'), 100), { once: true });
})();
