// Determining the MIME type of a tab
// ----------------------------------
// Q: Can we query the MIME type of a tab?
// A: Nope: https://bugzilla.mozilla.org/show_bug.cgi?id=1361447
//    Would be nice: https://bugzilla.mozilla.org/show_bug.cgi?id=1457500
//
// Q: If there is no way from the outside to query the MIME type, can we inject a
//    content script and query document.contentType?
// A: Yes, but not for PDFs (it's possible in Chrome and Safari though)
//    See https://bugzilla.mozilla.org/show_bug.cgi?id=1454760

// See extensions.webextensions.restrictedDomains in about:config.
// Of course, there does not seem to be a way to just ask if an extension is
// allowed to access a specific domain. That would be too easy ;)
// See https://discourse.mozilla.org/t/how-to-figure-out-when-injecting-a-content-script-would-fail/27794
//
// (Such a list should not be needed for Chrome/Safari because they allow
// content script injection into PDF pages.)
const FIREFOX_RESTRICTED_DOMAINS = new Set([
	"accounts-static.cdn.mozilla.net",
	"accounts.firefox.com",
	"addons.cdn.mozilla.net",
	"addons.mozilla.org",
	"api.accounts.firefox.com",
	"content.cdn.mozilla.net",
	"discovery.addons.mozilla.org",
	"oauth.accounts.firefox.com",
	"profile.accounts.firefox.com",
	"support.mozilla.org",
	"sync.services.mozilla.com",
]);

function is_restricted_domain(url) {
	if(url.startsWith("about:"))
		return true;

	return FIREFOX_RESTRICTED_DOMAINS.has(new URL(url).hostname);
}

async function download_data(url) {
	const response = await fetch(url);
	if(!response.ok) {
		console.error(`Response status: ${response.status}`);
		return;
	}

	let content_type = response.headers.get("Content-Type");
	if(content_type === null) {
		console.error("No Content-Type available");
		return;
	}
}

function save_url(url, mime_type) {
	console.log("URL:", url);
	console.log("MIME:", mime_type);
}

async function save_tab(tab) {
	if(is_restricted_domain(tab.url))
		return;

	try {
		let result = await browser.tabs.executeScript(tab.id, {file: "content.js"});
	} catch(error) {
		// Since we already ensured that we are not visiting a restricted
		// domain, the only remaining reason for script injection to fail is if
		// a PDF is displayed (at least I hope that's the case)
		save_url(tab.url, "application/pdf");
	}

}

async function handle_extension_button_click() {
	let tabs = await browser.tabs.query({active: true, currentWindow: true});
	save_tab(tabs[0]);
}

function handle_content_message(message, sender) {
	save_url(message.url, message.mime_type);
}

////////////////////////////////////////////////////////////////////////////////
browser.browserAction.onClicked.addListener(handle_extension_button_click);
browser.runtime.onMessage.addListener(handle_content_message);
