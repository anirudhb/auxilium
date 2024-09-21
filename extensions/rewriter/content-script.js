/**
 * Content script that implements UI
 */
let port;

chrome.runtime.onConnect.addListener(function(port_) {
	port = port_;
	// Add the "init" listener
	port.onMessage.addListener(onInitListener);
});

function onInitListener(data) {
	if (data.type === "init") {
		init(data.text);
	}
}

const markerEl = document.createElement("span");
markerEl.appendChild(document.createTextNode("\ufeff"));

async function init(text_) {
	console.log("initializing...");
	let selectionRect, selectionText;
	let selectionRange = null;
	let isInput = false;
	const activeElement = document.activeElement;
	// https://bugzilla.mozilla.org/show_bug.cgi?id=85686
	if (activeElement && activeElement.value) {
		selectionRect = activeElement.getBoundingClientRect();
		selectionText = activeElement.value.substring(activeElement.selectionStart, activeElement.selectionEnd);
		selectionRange = {
			element: activeElement,
			start: activeElement.selectionStart,
			end: activeElement.selectionEnd,
		};
		isInput = true;
	} else {
		const selection = window.getSelection();
		if (selection.rangeCount <= 0) return;
		const range = selection.getRangeAt(0).cloneRange();
		range.collapse(true);
		selectionRect = range.getClientRects()[0] ?? range.startContainer.getBoundingClientRect();
		console.log(selectionRect);
		selectionText = selection.toString().trim();
		selectionRange = selection.getRangeAt(0);
	}
	if (selectionText.length <= 0) {
		// Use the provided text instead
		// (e.g. iframe?)
		selectionText = text_;
	}
	const dialog = new TheDialog(
		selectionRect,
		selectionText,
		// Provide the initial range so it can be modified
		selectionRange,
		isInput,
	);
	dialog.init();
}

const dialogTemplate = (new DOMParser()).parseFromString(`
<template>
	<style>
	.container {
		max-width: min(90vw, 90%);
		display: flex;
		flex-direction: row;
		gap: 8px;
		background: white;
		padding: 16px;
		border: 1px solid grey;
		user-select: none;
		max-height: 90px;
	}
	#response {
		flex-grow: 1;
		user-select: all;
		overflow-y: auto;
	}
	.btn-group, .btn-group-h {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.btn-group-h {
		flex-direction: row;
	}
	.icon {
		width: 1em;
		height: 1em;
		vertical-align: -0.125em;
	}
	</style>
	<div class="container">
		<!-- <button id="prev" disabled>Previous</button> -->
		<div id="response"></div>
		<div class="btn-group">
			<button id="accept" disabled>Accept</button>
			<!-- <button id="next" disabled>Next</button> -->
			<div class="btn-group-h">
				<!-- FontAwesome chevron-left -->
				<button id="prev" disabled>
					<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M9.4 233.4c-12.5 12.5-12.5 32.8 0 45.3l192 192c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L77.3 256 246.6 86.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-192 192z"/></svg>
				</button>
				<!-- FontAwesome chevron-right -->
				<button id="next" disabled>
					<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 512"><!--!Font Awesome Free 6.6.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free Copyright 2024 Fonticons, Inc.--><path d="M310.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-192 192c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L242.7 256 73.4 86.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l192 192z"/></svg>
				</button>
			</div>
			<span id="responseNum"></span>
		</div>
	</div>
</template>
`.trim(), "text/html").querySelector("template");

class TheDialog {
	#holder;
	#shadow;
	#prevButton;
	#responseBox;
	#responseNum;
	#nextButton;
	#acceptButton;
	#text;
	#savedRange;
	#isInput;
	#generated = [];
	#selectedIndex = -1;

	constructor(
		/* @type {DOMRect} */ rect,
		/* @type {String} */ text,
		/* @type {Range} */ savedRange,
		/* @type {boolean} */ isInput,
	) {
		console.log("dialog initializing...");
		this.#text = text;
		this.#savedRange = savedRange;
		this.#isInput = isInput;
		const documentRect = document.documentElement.getBoundingClientRect();
		// Amend rect by scroll position
		rect = new DOMRect(
			rect.x + document.documentElement.scrollLeft,
			rect.y + document.documentElement.scrollTop,
			rect.width,
			rect.height,
		);
		const holder3 = document.createElement("div");
		holder3.style.position = "absolute";
		holder3.style.left = "0px";
		holder3.style.top = "0px";
		holder3.style["pointer-events"] = "none";
		const holder2 = document.createElement("div");
		holder2.style.position = "relative";
		holder2.style.width = `${documentRect.width}px`;
		holder2.style.height = `${documentRect.height}px`;
		holder3.appendChild(holder2);
		const holder = document.createElement("div");
		holder.style.position = "absolute";
		holder.style["z-index"] = "9999999999999";
		holder.style["pointer-events"] = "auto";
		holder2.appendChild(holder);
		holder.style.left = `${rect.left + 10}px`;
		if (rect.top < 100) {
			holder.style.top = `${rect.bottom + 5}px`;
		} else {
			holder.style.bottom = `${documentRect.height - rect.top + 5}px`;
		}
		const shadow = holder.attachShadow({ mode: "closed" });
		shadow.appendChild(dialogTemplate.content.cloneNode(true));
		this.#prevButton = shadow.querySelector("#prev");
		this.#responseBox = shadow.querySelector("#response");
		this.#responseNum = shadow.querySelector("#responseNum");
		this.#nextButton = shadow.querySelector("#next");
		this.#acceptButton = shadow.querySelector("#accept");
		this.#holder = holder3;
		this.#shadow = shadow;
		document.body.appendChild(holder3);
	}

	init() {
		// Add event listeners
		this.#prevButton.addEventListener("click", () => {
			// Nothing
			if (this.#generated.length < 0) return;
			const newIndex = this.#selectedIndex - 1;
			// Out of bounds
			if (newIndex < 0) return;
			this.#selectedIndex = newIndex;
			this.syncResponse();
		});
		this.#nextButton.addEventListener("click", () => {
			// Nothing
			if (this.#generated.length < 0) return;
			const newIndex = this.#selectedIndex + 1;
			if (newIndex >= this.#generated.length) {
				// Generate a new response
				this.generateNewReply();
				return;
			}
			this.#selectedIndex = newIndex;
			this.syncResponse();
		});
		this.#acceptButton.addEventListener("click", () => {
			const t = this.#generated[this.#selectedIndex];
			let successful;
			if (!this.#isInput) {
				// Modify the current selection using the saved selection
				const s = window.getSelection();
				const r = this.#savedRange;
				if (r.endContainer.isContentEditable) {
					s.removeAllRanges();
					s.addRange(r);
					r.deleteContents();
					const n = document.createTextNode(t);
					r.insertNode(n);
					r.setEnd(n);
					r.collapse(true);
					s.removeAllRanges();
					s.addRange(r);
					successful = true;
				} else {
					successful = false;
				}
			} else {
				this.#savedRange.element.focus();
				this.#savedRange.element.setSelectionRange(this.#savedRange.start, this.#savedRange.end);
				// FIXME: undo is broken in Gmail composer?
				// FIXME: undo is completely broken in Chrome, seemingly
				const oldText = this.#savedRange.element.value;
				const newText = oldText.substring(0, this.#savedRange.start) + t + oldText.substring(this.#savedRange.end);
				this.#savedRange.element.value = newText;
				this.#savedRange.element.setSelectionRange(this.#savedRange.start, this.#savedRange.start + t.length);
			}
			if (!successful) {
				this.#acceptButton.textContent = "Paste failed";
				this.#acceptButton.disabled = true;
				setTimeout(() => {
					this.syncResponse();
				}, 2000);
			}
		});

		// Remove if selection changes
		let selectionListener = () => {
			// If our own element is selected, it's okay
			const sel = document.getSelection();
			if (sel.rangeCount > 0) {
				const r = sel.getRangeAt(0).cloneRange();
				r.collapse(true);
				if (this.#shadow.contains(r.endContainer)) return;
			}
			document.removeEventListener("selectionchange", selectionListener);
			this.remove();
		};
		document.addEventListener("selectionchange", selectionListener);

		this.generateNewReply();
	}

	remove() {
		this.#holder.parentElement.removeChild(this.#holder);
	}

	syncResponse() {
		this.#responseBox.textContent = this.#generated[this.#selectedIndex];
		this.#responseNum.textContent = `${this.#selectedIndex+1}/${this.#generated.length}`;
		this.#prevButton.disabled =	this.#selectedIndex <= 0;
		// Reset "accept" button
		this.#acceptButton.textContent = "Accept";
		this.#acceptButton.disabled = false;
	}

	async generateNewReply() {
		// Disable all buttons while generating
		this.#prevButton.disabled = true;
		this.#nextButton.disabled = true;
		this.#acceptButton.disabled = true;

		// Generate the reply (TODO: Make it stream)
		try {
			const reply = await new Promise((resolve, reject) => {
				const id = Math.random().toString();
				// TODO: stable ipc api
				function listener(data) {
					if (data.reply === id) {
						port.onMessage.removeListener(listener);
						if (data.error) {
							reject(new Error(data.error));
						} else {
							resolve(data.rewrittenText);
						}
					}
				}
				port.onMessage.addListener(listener);
				port.postMessage({
					type: "rewrite",
					text: this.#text,
					replyId: id,
				});
			});

			// Add the new response to the list
			this.#generated.push(reply);
			// Make it the selected index
			this.#selectedIndex = this.#generated.length - 1;
			this.syncResponse();
		} catch (e) {
			alert(e.toString());
		}

		// Make the buttons usable again
		this.#prevButton.disabled = false;
		this.#nextButton.disabled = false;
		this.#acceptButton.disabled = false;
	}
}
