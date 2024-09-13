// FIXME: other providers

const settings = {
	loaded: false,
};

async function reloadSettings() {
	console.log("Reloading settings");
	settings.groqKey = ((await chrome.storage.sync.get("groq-api-key"))["groq-api-key"]) ?? "";
	settings.loaded = true;
	console.log(settings);
}

chrome.storage.onChanged.addListener(() => reloadSettings());
reloadSettings();

function onCreated() {
	console.log("Item created");
}

const SYSTEM_PROMPT = `
You will rephrase the following message in a professional tone.
Keep the message in its original language.
Do NOT add quotes around the rewritten message.
`.trim();
// If the text is in a different language, translate it to English.

async function aiRewriteSelection(text) {
	if (settings.groqKey?.trim()?.length <= 0) {
		throw new Error("No Groq API key! Set one in extension preferences");
	}
	console.log(`Going to rewrite "${text}"`);
	const body = {
		model: "llama-3.1-70b-versatile",
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: text,
			},
		],
	};
	console.log(body);
	const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${settings.groqKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const j = await r.json();
	console.log(j);
	const rewrittenText = j.choices[0].message.content;
	console.log(`Rewritten to "${rewrittenText}"`);
	return rewrittenText;
}

async function aiRewriteSelectionMenuHandler(info, tab) {
	const injectionResult = await chrome.scripting.executeScript({
		files: ["content-script.js"],
		target: {
			tabId: tab.id,
			frameIds: [info.frameId],
		},
	});
	const port = chrome.tabs.connect(tab.id, {
		name: "ai-rewriter",
		frameId: info.frameId,
	});
	port.onMessage.addListener(async function(data) {
		if (data.type === "rewrite") {
			let output = {};
			try {
				output.rewrittenText = await aiRewriteSelection(data.text);
			} catch (e) {
				output.error = e.toString();
			}
			port.postMessage({ reply: data.replyId, ...output });
		}
	});
	console.log("selection text = " + info.selectionText);
	port.postMessage({ type: "init", text: info.selectionText });
}

chrome.contextMenus.create({
	id: "ai-rewrite-selection",
	title: "Rewrite selection with AI",
	contexts: ["selection"],
}, onCreated);

chrome.contextMenus.onClicked.addListener((info, tab) => {
	switch (info.menuItemId) {
		case "ai-rewrite-selection":
			aiRewriteSelectionMenuHandler(info, tab);
			break;
		default:
			console.log(`Unknown menu ${info.menuItemId}`);
			break;
	}
});
