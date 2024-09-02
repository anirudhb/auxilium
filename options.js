async function saveOptions(e) {
	e.preventDefault();
	await browser.storage.sync.set({
		"groq-api-key": document.querySelector("#groq-api-key").value,
	});
}

async function restoreOptions() {
	const groqKey = await browser.storage.sync.get("groq-api-key");
	document.querySelector("#groq-api-key").value = groqKey["groq-api-key"];
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.querySelector("form").addEventListener("submit", saveOptions);
