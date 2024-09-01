// FIXME: other providers
const GROQ_API_KEY = "gsk_set_a_key_here";

function onCreated() {
	console.log("Item created");
}

const SYSTEM_PROMPT = `
You will rewrite the following message in a professional, helpful, playful way.
Do NOT add quotes around the rewritten message.
`.trim();

async function aiRewriteSelection(info, tab) {
	if (!tab) return;
	const textToRewrite = info.selectionText;
	console.log(`Going to rewrite "${textToRewrite}"`);
	const body = {
		model: "llama-3.1-70b-versatile",
		messages: [
			{
				role: "system",
				content: SYSTEM_PROMPT,
			},
			{
				role: "user",
				content: textToRewrite,
			},
		],
	};
	console.log(body);
	const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${GROQ_API_KEY}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const j = await r.json();
	console.log(j);
	const rewrittenText = j.choices[0].message.content;
	console.log(`Rewritten to "${rewrittenText}"`);
	// FIXME: CSP stuff?
	const scr = `
		(function() {
			const t = atob("${btoa(rewrittenText)}");
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
}

browser.menus.create({
	id: "ai-rewrite-selection",
	title: "Rewrite selection with AI",
	contexts: ["selection"],
}, onCreated);

browser.menus.onClicked.addListener((info, tab) => {
	switch (info.menuItemId) {
		case "ai-rewrite-selection":
			aiRewriteSelection(info, tab);
			break;
		default:
			console.log(`Unknown menu ${info.menuItemId}`);
			break;
	}
});
