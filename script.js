'use strict';

(function () {
	const GITHUB_USER = 'voniem12';
	const REVEAL_FALLBACK_MS = 45000; // Dự phòng nếu không lấy được duration/ended

	const projectsContainer = document.getElementById('projects');
	const emptyStateEl = document.getElementById('projects-empty');
	const errorStateEl = document.getElementById('projects-error');
	const videoEl = document.querySelector('.bg-video');
	const audioToggle = document.getElementById('audioToggle');
	const skipButton = document.getElementById('skipReveal');
	let revealTimeoutId = null;
	let hasRevealed = false;

	document.addEventListener('DOMContentLoaded', () => {
		const tagline = document.querySelector('.tagline');
		const mainEl = document.querySelector('main');
		const footerEl = document.querySelector('.site-footer');
		refreshAudioButton();
		if (audioToggle) {
			audioToggle.addEventListener('click', onAudioToggleClick, { passive: true });
		}
		if (skipButton) {
			skipButton.addEventListener('click', () => {
				if (revealTimeoutId) {
					clearTimeout(revealTimeoutId);
					revealTimeoutId = null;
				}
				revealAndLoad();
			}, { passive: true });
		}

		// Lịch trình: hiện dự án khi video kết thúc vòng đầu tiên
		if (videoEl) {
			// Khi metadata sẵn sàng, đặt fallback theo duration
			if (isFinite(videoEl.duration) && videoEl.duration > 0) {
				startRevealFallback(Math.ceil(videoEl.duration * 1000) + 500);
			} else {
				videoEl.addEventListener('loadedmetadata', () => {
					if (!hasRevealed) {
						startRevealFallback(Math.ceil(videoEl.duration * 1000) + 500);
					}
				}, { once: true });
				startRevealFallback(REVEAL_FALLBACK_MS);
			}

			// Bắt sự kiện gần cuối video (trong trường hợp loop không bắn 'ended')
			const onTimeUpdate = () => {
				const d = videoEl.duration;
				if (isFinite(d) && d > 0 && videoEl.currentTime >= d - 0.2) {
					videoEl.removeEventListener('timeupdate', onTimeUpdate);
					revealAndLoad();
				}
			};
			videoEl.addEventListener('timeupdate', onTimeUpdate);

			// Thêm ended như một đường bảo hiểm
			videoEl.addEventListener('ended', () => {
				revealAndLoad();
			}, { once: true });
		} else {
			// Không có video -> dùng fallback chung
			startRevealFallback(REVEAL_FALLBACK_MS);
		}

		function revealAndLoad() {
			if (hasRevealed) return;
			hasRevealed = true;
			if (revealTimeoutId) {
				clearTimeout(revealTimeoutId);
				revealTimeoutId = null;
			}
			if (tagline) tagline.hidden = false;
			if (mainEl) mainEl.hidden = false;
			if (footerEl) footerEl.hidden = false;
			loadRepos(GITHUB_USER).catch(() => {
				showError();
			});
		}

		function startRevealFallback(ms) {
			if (revealTimeoutId) clearTimeout(revealTimeoutId);
			revealTimeoutId = setTimeout(() => {
				revealAndLoad();
			}, ms);
		}
	});

	function onAudioToggleClick() {
		if (!videoEl) return;
		// Try to enable sound on user gesture
		if (videoEl.muted || videoEl.volume === 0) {
			videoEl.muted = false;
			videoEl.volume = 1;
			const p = videoEl.play();
			if (p && typeof p.then === 'function') {
				p.catch(() => {});
			}
		} else {
			videoEl.muted = true;
		}
		refreshAudioButton();
	}

	function refreshAudioButton() {
		if (!audioToggle || !videoEl) return;
		const muted = videoEl.muted || videoEl.volume === 0;
		audioToggle.textContent = muted ? '🔇' : '🔊';
		audioToggle.setAttribute('aria-pressed', muted ? 'false' : 'true');
	}

	async function loadRepos(username) {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 12000);
		try {
			const response = await fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?per_page=100&sort=updated`, {
				signal: controller.signal,
				headers: {
					'Accept': 'application/vnd.github+json'
				},
				cache: 'no-cache'
			});
			if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);
			/** @type {Array<any>} */
			const repos = await response.json();
			const filtered = repos
				.filter(r => !r.fork)
				.filter(r => !r.archived)
				.sort((a, b) => {
					// Sort by stargazers desc, then updated desc
					if (b.stargazers_count !== a.stargazers_count) {
						return b.stargazers_count - a.stargazers_count;
					}
					return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
				});

			renderRepos(filtered);
		} finally {
			clearTimeout(timeoutId);
		}
	}

	function renderRepos(repos) {
		clearChildren(projectsContainer);
		hide(errorStateEl);

		if (!repos || repos.length === 0) {
			show(emptyStateEl);
			return;
		}
		hide(emptyStateEl);

		const fragment = document.createDocumentFragment();
		for (const repo of repos) {
			fragment.appendChild(createRepoCard(repo));
		}
		projectsContainer.appendChild(fragment);
	}

	function createRepoCard(repo) {
		const card = document.createElement('article');
		card.className = 'project-card';

		const title = document.createElement('h3');
		const titleLink = document.createElement('a');
		titleLink.href = repo.html_url;
		titleLink.target = '_blank';
		titleLink.rel = 'noopener';
		titleLink.textContent = repo.name;
		title.appendChild(titleLink);

		const desc = document.createElement('p');
		desc.className = 'project-desc';
		desc.textContent = repo.description || 'Không có mô tả.';

		const meta = document.createElement('div');
		meta.className = 'project-meta';
		meta.appendChild(makeMetaItem('⭐ ' + (repo.stargazers_count ?? 0)));
		meta.appendChild(makeMetaItem('🍴 ' + (repo.forks_count ?? 0)));
		meta.appendChild(makeMetaItem('🕒 ' + formatRelativeTime(repo.updated_at)));
		if (repo.language) {
			meta.appendChild(makeMetaItem('💡 ' + repo.language));
		}

		const actions = document.createElement('div');
		actions.className = 'project-actions';
		const viewRepo = document.createElement('a');
		viewRepo.href = repo.html_url;
		viewRepo.target = '_blank';
		viewRepo.rel = 'noopener';
		viewRepo.textContent = 'Xem Repository';
		actions.appendChild(viewRepo);
		if (repo.homepage) {
			const liveDemo = document.createElement('a');
			liveDemo.className = 'secondary';
			liveDemo.href = repo.homepage;
			liveDemo.target = '_blank';
			liveDemo.rel = 'noopener';
			liveDemo.textContent = 'Live Demo';
			actions.appendChild(liveDemo);
		}

		card.appendChild(title);
		card.appendChild(desc);
		card.appendChild(meta);
		card.appendChild(actions);
		return card;
	}

	function makeMetaItem(text) {
		const span = document.createElement('span');
		span.textContent = text;
		return span;
	}

	function clearChildren(node) {
		while (node.firstChild) node.removeChild(node.firstChild);
	}

	function show(el) { el && (el.hidden = false); }
	function hide(el) { el && (el.hidden = true); }
	function showError() {
		hide(emptyStateEl);
		show(errorStateEl);
	}

	function formatRelativeTime(isoDateString) {
		const date = new Date(isoDateString);
		const diffMs = Date.now() - date.getTime();
		const sec = Math.floor(diffMs / 1000);
		const min = Math.floor(sec / 60);
		const hr = Math.floor(min / 60);
		const day = Math.floor(hr / 24);
		if (day > 0) return `${day} ngày trước`;
		if (hr > 0) return `${hr} giờ trước`;
		if (min > 0) return `${min} phút trước`;
		return `vừa xong`;
	}
})();


