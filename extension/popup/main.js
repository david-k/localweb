import {LitElement, html, css} from "../vendor/lit-core-3.3.1.min.js";

//==============================================================================
// Utils
//==============================================================================
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
	if (url.startsWith("about:"))
		return true;

	return FIREFOX_RESTRICTED_DOMAINS.has(new URL(url).hostname);
}

async function get_contents(tab_id, url, mime_type) {
	if (mime_type === "text/html") {
		let results = await browser.tabs.executeScript(tab_id, {file: "../content_get_contents.js"});
		return results[0];
	} else {
		let response = await fetch(url);
		if (!response.ok) {
			return Promise.reject(`Request failed with code ${response.status}`);
		}

		return response.bytes();
	}
}

async function query_page_info(tab) {
	if (is_restricted_domain(tab.url))
		return {restricted: true};

	try {
		let results = await browser.tabs.executeScript(tab.id, {file: "../content_get_info.js"});
		return results[0];
	} catch(error) {
		// Since we already ensured that we are not visiting a restricted
		// domain, the only remaining reason for script injection to fail is if
		// a PDF is displayed (at least I hope that's the case)
		return {
			restricted: false,
			url: tab.url,
			title: tab.title,
			mime_type: "application/pdf",
		};
	}
}

//==============================================================================
// UI
//==============================================================================
class MainElement extends LitElement {
	static properties = {
		tab_id: {},
		page_info: {},
	};

	constructor() {
		super();
		this.tab_id = null;
		this.page_info = null;

		browser.tabs.query({active: true, currentWindow: true})
			.then(tabs => {
				this.tab_id = tabs[0].id;
				return query_page_info(tabs[0])
			})
			.then(page_info => {
				this.page_info = page_info;
			});
	}

	render() {
		if (this.page_info === null)
			return html`<p>Loading...</p>`;
		else {
			if (this.page_info.restricted)
				return html`<p>Restricted page</p>`;
			else {
				return html`
					<save-form
						.tab_id=${this.tab_id}
						.url=${this.page_info.url}
						.title=${this.page_info.title}
						.mime_type=${this.page_info.mime_type}
					/>`;
			}
		}
	}
}
customElements.define('main-element', MainElement);

class SaveForm extends LitElement {
	static styles = css`
		:host {
		  color: blue;
		}

		.btn-submit {
			float: right;
			padding: 5px 15px;
			display: grid;
		}

		/* By putting both the button text and the loading gif into the same
		 * grid cell we ensure that the dimensions of the button remain the
		 * same when switching between them */
		.btn-submit-text {
			grid-row: 1;
			grid-column: 1;
		}

		.btn-submit-gif {
			margin: 0 auto;
			height: 1rem;
			grid-row: 1;
			grid-column: 1;
		}

		.error {
			margin: 10px auto;
			padding: 5px;
			width: 90%;
			border: 1px solid red;
			border-radius: 5px;
			background-color: #EBD4D4;
			color: red;
		}
	`;

	static properties = {
		tab_id: {},
		url: {},
		title: {},
		mime_type: {},
		saving: {},
		error_msg: {},
	};

	constructor() {
		super();
		this.saving = false;
		this.error_msg = null;
	}

	render() {
		let error = this.error_msg === null ?
			null : html`<p class="error">Error: ${this.error_msg}</p>`;

		return html`
			<form @submit=${this.submit}>
				${error}
				<p>
					<label>
						<div>Title</div>
						<input name="title" size="40" type="text" .value=${this.title}>
					</label>
					<div>
						<small style="color: gray">File type: ${this.mime_type}</small>
					</div>
				</p>
				<p>
					<button class="btn-submit" .disabled=${this.saving}>
						<span class="btn-submit-text" style="visibility: ${this.saving ? "hidden" : "visible"}">Save</span>
						<img  class="btn-submit-gif"  style="visibility: ${this.saving ? "visible" : "hidden"}" src="../assets/loading.gif">
					</button>
					<div style="clear: both"></div>
				</p>
			</form>
		`;
	}

	async submit(event) {
		event.preventDefault();
		let form = event.target;
		let title = form.elements["title"].value;

		this.error_msg = null;
		this.saving = true;
		get_contents(this.tab_id, this.url, this.mime_type)
			.then(contents => {
				let is_binary = contents instanceof Uint8Array;
				if (is_binary) {
					contents = contents.toBase64();
				}
				return browser.runtime.sendNativeMessage("singlefile_companion", {
					sender: "localweb",
					action: "save",
					url: this.url,
					title: title,
					mime_type: this.mime_type,
					is_base64: is_binary,
					contents: contents,
				}).then(msg => {
					if(!msg || !msg.hasOwnProperty("status"))
						return Promise.reject("Invalid response from native app");

					if(msg.status === "ok") {
						// Nothing to do
					} else if(msg.status === "error")
						return Promise.reject(msg.info);
					else
						return Promise.reject(`Native app has returned with unknown status: ${msg.status}`);
				});
			})
			.then(() => window.close())
			.catch(reason => {
				this.error_msg = reason;
				console.error("ERROR:", reason);
			})
			.finally(() => {
				this.saving = false;
			});
	}
}
customElements.define('save-form', SaveForm);
