/**
 * Content script that implements UI
 */
let port;

browser.runtime.onConnect.addListener(function(port_) {
	port = port_;
	// Add the "init" listener
	port.onMessage.addListener(onInitListener);
});

function onInitListener(data) {
	if (data.type === "init") {
		init();
		// The content script can be reinitialized multiple times
		//port.onMessage.removeListener(onInitListener);
	}
}

async function init() {
	console.log("initializing...");
	const selection = document.getSelection();
	if (selection.rangeCount <= 0) return;
	const range = selection.getRangeAt(0).cloneRange();
	range.collapse(true);
	// Get the position so we can put our window above it
	let selectionRect;
	// FIXME: bail out if there's selection across multiple elements
	//if (range.getClientRects().length <= 0) {
	//	// Single element?
	//	selectionRect = range.endContainer.getBoundingClientRect();
	//} else {
	//	selectionRect = range.getBoundingClientRect();
	//}
	selectionRect = range.getClientRects()[0] ?? range.startContainer.getBoundingClientRect();
	const dialog = new TheDialog(selectionRect, selection.toString());
	dialog.init();
}

const dialogTemplate = document.createElement("template");
dialogTemplate.innerHTML = `
<style>
.container {
	max-width: min(90vh, 400px);
	display: flex;
	flex-direction: row;
	gap: 8px;
	background: white;
	padding: 16px;
	border: 1px solid grey;
	user-select: none;
}
#response {
	flex-grow: 1;
	user-select: all;
}
.btn-group {
	display: flex;
	flex-direction: column;
	gap: 3px;
}
</style>
<div class="container">
	<button id="prev" disabled>Previous</button>
	<div id="response"></div>
	<div class="btn-group">
		<button id="accept" disabled>Accept</button>
		<button id="next" disabled>Next</button>
		<span id="responseNum"></span>
	</div>
</div>
`.trim();

class TheDialog {
	#holder;
	#shadow;
	#prevButton;
	#responseBox;
	#responseNum;
	#nextButton;
	#acceptButton;
	#text;
	#generated = [];
	#selectedIndex = -1;

	constructor(
		/* @type {DOMRect} */ rect,
		/* @type {String} */ text,
	) {
		console.log("dialog initializing...");
		this.#text = text;
		const holder = document.createElement("div");
		holder.style.position = "absolute";
		holder.style["z-index"] = "9999999999999";
		// FIXME: be smart again
		const documentRect = document.documentElement.getBoundingClientRect();
		//holder.style.left = `${Math.ceil(rect.left + 10)}px`;
		//holder.style.bottom = `${Math.floor(documentRect.height - rect.top - 10)}px`;
		if (rect.left < window.innerWidth / 2) {
			holder.style.left = `${rect.left + 10}px`;
		} else {
			holder.style.right = `${documentRect.width - rect.right + 10}px`;
		}
		if (rect.top < 30) {
			holder.style.top = `${rect.bottom + 5}px`;
		} else {
			holder.style.bottom = `${documentRect.height - rect.top + 5}px`;
		}
		// TODO: change to "closed" after debugging is finished
		const shadow = holder.attachShadow({ mode: "open" });
		shadow.appendChild(dialogTemplate.content.cloneNode(true));
		this.#prevButton = shadow.querySelector("#prev");
		this.#responseBox = shadow.querySelector("#response");
		this.#responseNum = shadow.querySelector("#responseNum");
		this.#nextButton = shadow.querySelector("#next");
		this.#acceptButton = shadow.querySelector("#accept");
		this.#holder = holder;
		this.#shadow = shadow;
		document.body.appendChild(holder);
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
		// TODO: accept button
		this.#acceptButton.addEventListener("click", () => {
			alert(`Selected reply: ${this.#generated[this.#selectedIndex]}`);
		});

		// Remove if selection changes
		let selectionListener = () => {
			// If our own element is selected, it's okay
			const sel = document.getSelection();
			if (sel.rangeCount > 0) {
				const r = sel.getRangeAt(0);
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

/*
	// FIXME: CSP stuff?
	const scr = `
		(function() {
			const t = decodeURIComponent(atob("${btoa(encodeURIComponent(rewrittenText))}"));
			//alert(t);
			let successful = true;
			try {
				successful = document.execCommand("insertText", false, t);
			} catch (e) {
				successful = false;
			}
			if (!successful) {
				console.log("Oops! Couldn't paste text.");
				alert(t);
			}
		})();
	`.trim();
	browser.tabs.executeScript(tab.id, { code: scr });
	*/
