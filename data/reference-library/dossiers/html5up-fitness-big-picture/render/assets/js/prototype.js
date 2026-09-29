/* Native scroll state and local-only intake feedback for this fictional Big Picture adaptation. */
(() => {
	const body = document.body;
	const sections = [...document.querySelectorAll('#creative-site > section')];
	if ('IntersectionObserver' in window) {
		const observer = new IntersectionObserver((entries) => entries.forEach((entry) => {
			if (entry.isIntersecting) entry.target.classList.add('is-in-view');
		}), { threshold: 0.2 });
		sections.forEach((section) => observer.observe(section));
	}
	const onScroll = () => body.classList.toggle('is-scrolled', window.scrollY > 24);
	window.addEventListener('scroll', onScroll, { passive: true });
	onScroll();
	document.querySelectorAll('[data-demo-form]').forEach((form) => form.addEventListener('submit', (event) => {
		event.preventDefault();
		form.querySelector('.form-status').textContent = 'Design preview only. No information was sent.';
	}));
	window.addEventListener('load', () => window.setTimeout(() => body.classList.remove('is-preload'), 100), { once: true });
})();
