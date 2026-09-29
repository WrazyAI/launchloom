/* Small native-JS interaction for this fictional Dimension adaptation. */
(() => {
	const body = document.body;
	const main = document.querySelector('#main');
	const panels = [...document.querySelectorAll('#main article')];
	let returnFocus = null;
	const showPanel = (id, trigger) => {
		const panel = panels.find((item) => item.id === id);
		if (!panel) return;
		panels.forEach((item) => { item.hidden = true; item.classList.remove('active'); item.removeAttribute('role'); item.removeAttribute('aria-modal'); });
		panel.hidden = false;
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-modal', 'true');
		returnFocus = trigger || document.activeElement;
		body.classList.add('is-article-visible');
		body.style.overflow = 'hidden';
		requestAnimationFrame(() => panel.classList.add('active'));
		panel.querySelector('.close')?.focus();
		if (location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
	};
	const closePanel = () => {
		const current = panels.find((item) => item.classList.contains('active'));
		if (!current) return;
		current.classList.remove('active');
		body.classList.remove('is-article-visible');
		body.style.overflow = '';
		window.setTimeout(() => { current.hidden = true; }, 340);
		history.replaceState(null, '', location.pathname + location.search);
		returnFocus?.focus?.();
	};
	document.querySelectorAll('#header nav a, #header .content a[href^="#"]').forEach((link) => {
		link.addEventListener('click', (event) => {
			const id = link.getAttribute('href')?.slice(1);
			if (!panels.some((panel) => panel.id === id)) return;
			event.preventDefault();
			showPanel(id, link);
		});
	});
	document.querySelectorAll('#main .close').forEach((button) => button.addEventListener('click', closePanel));
	document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePanel(); });
	main.addEventListener('click', (event) => { if (event.target === main) closePanel(); });
	document.querySelectorAll('[data-demo-form]').forEach((form) => form.addEventListener('submit', (event) => {
		event.preventDefault();
		form.querySelector('.form-status').textContent = 'Design preview only. No information was sent.';
	}));
	window.addEventListener('load', () => window.setTimeout(() => body.classList.remove('is-preload'), 100), { once: true });
	const initial = location.hash.slice(1);
	if (panels.some((panel) => panel.id === initial)) showPanel(initial, null);
})();
