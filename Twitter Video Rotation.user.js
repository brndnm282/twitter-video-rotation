// ==UserScript==
// @name        Twitter Video Rotation
// @description Adds buttons and keyboard shortcuts to rotate and flip the video on Twitter/X
// @version     1
// @namespace   https://github.com/brndnm282/twitter-video-rotation/
// @supportURL  https://github.com/brndnm282/twitter-video-rotation/issues
// @match       https://x.com/*
// @match       https://twitter.com/*
// @license     MIT
// @grant       GM_addStyle
// @run-at      document-idle
// @downloadURL https://raw.githubusercontent.com/brndnm282/twitter-video-rotation/main/Twitter%20Video%20Rotation.user.js
// @updateURL   https://raw.githubusercontent.com/brndnm282/twitter-video-rotation/main/Twitter%20Video%20Rotation.user.js
// ==/UserScript==

GM_addStyle(`
#video-rotation-controls,
.video-rotation-controls {
	margin-left: 8px;
	display: inline-flex;
	align-items: center;
	vertical-align: middle;
	flex-shrink: 0;
	gap: 3px;
	z-index: 20;
}
#video-rotation-controls button,
.video-rotation-controls button {
	font-size: 18px;
	background: #f5f5f5;
	border: 1px solid #d9d9d9;
	border-radius: 4px;
	color: #414141;
	line-height: 20px;
	height: 24px;
	width: 24px;
	padding: 0;
	cursor: pointer;
	outline: 0;
	display: inline-flex;
	align-items: center;
	justify-content: center;
}
#video-rotation-controls button:hover,
.video-rotation-controls button:hover {
	background: #e8e8e8;
}
div[data-testid="videoPlayer"],
div[data-testid="videoComponent"] {
	overflow: hidden;
}
`);

const directions = {
	left: 'r270',
	up: 'r0',
	right: 'r90',
	down: 'r180',
	flipH: 'flipH',
	flipV: 'flipV',
};

const rotations = {
	r90: 'rotate(90deg)',
	r180: 'rotate(180deg)',
	r270: 'rotate(270deg)',
};

const scaling = {
	flipH: 'scaleX(-1)',
	flipV: 'scaleY(-1)',
	portrait: 'scale(1.77777)',
	landscape: 'scale(0.5625)',
};

const controlsID = 'video-rotation-controls';
const controlsClass = 'video-rotation-controls';
const CONTAINER_SELECTOR = 'article[data-testid="tweet"], div[aria-modal="true"]';
let shortcutsEnabled = true;
const shortcuts = {
	'Numpad8': directions.up,
	'Numpad2': directions.down,
	'Numpad4': directions.left,
	'Numpad6': directions.right,
	'Numpad9': directions.flipH,
	'Numpad3': directions.flipV,
};

let lastInteractedContainer = null;

function initTransformStylesheet() {
	if (document.getElementById('video-rotation-transform-styles')) {
		return;
	}

	const stylesheet = document.createElement('style');
	stylesheet.id = 'video-rotation-transform-styles';
	const rules = [];

	const getAllSubsets = arr =>
		arr.reduce((subsets, value) => subsets.concat(subsets.map(set => [...set, value])), [[]]).slice(1);
	const scalings = getAllSubsets(Object.keys(scaling));

	for (const rule in rotations) {
		rules.push(`video.${rule} { transform: ${rotations[rule]} !important; }`);
		for (const scalingSet of scalings) {
			const selectorSuffix = scalingSet.map(c => `.${c}`).join('');
			const transformSuffix = scalingSet.map(c => scaling[c]).join(' ');
			rules.push(`video.${rule}${selectorSuffix} { transform: ${rotations[rule]} ${transformSuffix} !important; }`);
		}
	}

	const flips = getAllSubsets([directions.flipH, directions.flipV]);
	for (const flipSet of flips) {
		const selectorSuffix = flipSet.map(c => `.${c}`).join('');
		const transformValue = flipSet.map(c => scaling[c]).join(' ');
		rules.push(`video${selectorSuffix} { transform: ${transformValue} !important; }`);
	}

	stylesheet.textContent = rules.join('\n');
	document.head.appendChild(stylesheet);
}

function createControlsElement() {
	const btnDirections = [
		[directions.left, '🠘', 'Rotate Left (Numpad 4)'],
		[directions.up, '🠙', 'Reset Rotation (Numpad 8)'],
		[directions.right, '🠚', 'Rotate Right (Numpad 6)'],
		[directions.down, '🠛', 'Rotate 180° (Numpad 2)'],
		[directions.flipV, '🡙', 'Flip Vertically (Numpad 3)'],
		[directions.flipH, '🡘', 'Flip Horizontally (Numpad 9)'],
	];

	const div = document.createElement('div');
	if (!document.getElementById(controlsID)) {
		div.id = controlsID;
	}
	div.className = controlsClass;

	for (const [dir, label, title] of btnDirections) {
		const btn = document.createElement('button');
		btn.type = 'button';
		btn.dataset.direction = dir;
		btn.textContent = label;
		btn.title = title;
		div.appendChild(btn);
	}

	return div;
}

function applyContainerStateToVideo(video, container) {
	if (!video || !container) return;

	const rotDir = container.dataset.rotationDirection || directions.up;
	const flipH = container.dataset.flipH === 'true';
	const flipV = container.dataset.flipV === 'true';

	video.classList.toggle(directions.flipH, flipH);
	video.classList.toggle(directions.flipV, flipV);

	video.classList.remove(directions.left, directions.right, directions.down, 'portrait', 'landscape');
	if (rotDir !== directions.up) {
		video.classList.add(rotDir);
		if ([directions.left, directions.right].includes(rotDir)) {
			if (video.videoWidth > 0 && video.videoHeight > 0) {
				video.classList.add(video.videoHeight > video.videoWidth ? 'portrait' : 'landscape');
			} else {
				video.addEventListener('loadedmetadata', function onMeta() {
					video.removeEventListener('loadedmetadata', onMeta);
					applyContainerStateToVideo(video, container);
				});
			}
		}
	}
}

function syncVideosInContainer(container) {
	if (!container) return;
	const hasState =
		container.dataset.rotationDirection ||
		container.dataset.flipH === 'true' ||
		container.dataset.flipV === 'true';
	if (!hasState) return;

	const videos = container.querySelectorAll('video');
	videos.forEach(video => applyContainerStateToVideo(video, container));
}

function addButtons() {
	const players = document.querySelectorAll('div[data-testid="videoPlayer"], div[data-testid="videoComponent"]');

	players.forEach(player => {
		const container = player.closest(CONTAINER_SELECTOR) || player.parentElement;
		if (!container) {
			return;
		}

		syncVideosInContainer(container);

		if (container.querySelector(`.${controlsClass}`)) {
			return;
		}

		const actionBar = container.querySelector('div[role="group"]');
		const controls = createControlsElement();

		if (actionBar) {
			actionBar.appendChild(controls);
		} else if (player.parentNode) {
			player.parentNode.insertBefore(controls, player.nextSibling);
		}
	});
}

function getTargetContainer(buttonEl) {
	if (buttonEl) {
		const container = buttonEl.closest(CONTAINER_SELECTOR);
		if (container) {
			lastInteractedContainer = container;
			return container;
		}
	}

	if (document.fullscreenElement) {
		const fsContainer = document.fullscreenElement.closest
			? document.fullscreenElement.closest(CONTAINER_SELECTOR) || document.fullscreenElement
			: document.fullscreenElement;
		if (fsContainer) return fsContainer;
	}

	const modal = document.querySelector('div[aria-modal="true"]');
	if (modal && modal.querySelector('video, div[data-testid="videoPlayer"], div[data-testid="videoComponent"]')) {
		return modal;
	}

	const videos = Array.from(document.querySelectorAll('div[data-testid="videoPlayer"] video, div[data-testid="videoComponent"] video, video'));
	const playingVideo = videos.find(v => !v.paused && !v.ended);
	if (playingVideo) {
		const playingContainer = playingVideo.closest(CONTAINER_SELECTOR) || playingVideo.parentElement;
		if (playingContainer) return playingContainer;
	}

	if (lastInteractedContainer && document.body.contains(lastInteractedContainer)) {
		return lastInteractedContainer;
	}

	if (videos.length) {
		const viewportCenter = window.innerHeight / 2;
		let closestVideo = videos[0];
		let minDistance = Infinity;

		for (const v of videos) {
			const rect = v.getBoundingClientRect();
			if (rect.height === 0 && rect.width === 0) continue;
			const videoCenter = rect.top + rect.height / 2;
			const distance = Math.abs(videoCenter - viewportCenter);
			if (distance < minDistance) {
				minDistance = distance;
				closestVideo = v;
			}
		}

		return closestVideo.closest(CONTAINER_SELECTOR) || closestVideo.parentElement;
	}

	return null;
}

function rotateVideo(direction, buttonEl) {
	const container = getTargetContainer(buttonEl);
	if (!container) return;

	lastInteractedContainer = container;
	const flip = [directions.flipH, directions.flipV].includes(direction);

	if (flip) {
		const currentFlip = container.dataset[direction] === 'true';
		container.dataset[direction] = String(!currentFlip);
	} else {
		container.dataset.rotationDirection = direction;
	}

	const videos = container.querySelectorAll('video');
	videos.forEach(video => applyContainerStateToVideo(video, container));
}

function isEditableTarget(target) {
	if (!target) return false;
	const tag = target.tagName ? target.tagName.toLowerCase() : '';
	if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable) {
		return true;
	}
	return Boolean(target.closest && target.closest('[contenteditable="true"], [role="textbox"]'));
}

(() => {
	initTransformStylesheet();
	addButtons();

	const observer = new MutationObserver(() => {
		addButtons();
	});

	if (document.body) {
		observer.observe(document.body, { childList: true, subtree: true });
	} else {
		window.addEventListener('DOMContentLoaded', () => {
			observer.observe(document.body, { childList: true, subtree: true });
			addButtons();
		});
	}
})();

// Sync rotation/flip state whenever a 2nd/3rd/4th video in a tweet is lazy-loaded or played
window.addEventListener('play', function(e) {
	if (e.target && e.target.tagName === 'VIDEO') {
		const container = e.target.closest(CONTAINER_SELECTOR) || e.target.parentElement;
		if (container) {
			lastInteractedContainer = container;
			syncVideosInContainer(container);
		}
	}
}, true);

window.addEventListener('loadedmetadata', function(e) {
	if (e.target && e.target.tagName === 'VIDEO') {
		const container = e.target.closest(CONTAINER_SELECTOR) || e.target.parentElement;
		if (container) {
			syncVideosInContainer(container);
		}
	}
}, true);

window.addEventListener('click', function(e) {
	const btn = e.target.closest ? e.target.closest(`.${controlsClass} button`) : null;
	if (!btn || !btn.dataset.direction) {
		return;
	}
	e.preventDefault();
	e.stopPropagation();
	rotateVideo(btn.dataset.direction, btn);
}, true);

// Shortcuts
window.addEventListener('keydown', function(e) {
	if (isEditableTarget(e.target)) {
		return;
	}

	let stopPropagation = false;
	if (shortcuts[e.code] && shortcutsEnabled) {
		rotateVideo(shortcuts[e.code]);
		stopPropagation = true;
	} else if (e.code === 'Pause') {
		shortcutsEnabled = !shortcutsEnabled;
		stopPropagation = true;
	}

	if (stopPropagation) {
		e.preventDefault();
		e.stopPropagation();
	}
}, true);
