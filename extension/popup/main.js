import {LitElement, html, css} from "../vendor/lit-core-3.3.1.min.js";
import IA from "./internet_archive.js";

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
	}
	else {
		let response = await fetch(url);
		if (!response.ok)
			return Promise.reject(`Request failed with code ${response.status}`);

		return response.bytes();
	}
}

async function query_page_info(tab) {
	if (is_restricted_domain(tab.url))
		return {restricted: true};

	try {
		let results = await browser.tabs.executeScript(tab.id, {file: "../content_get_info.js"});
		return results[0];
	}
	catch(error) {
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


class AsyncButton extends LitElement {
	static properties = {
		label: {},
		disabled: {type: Boolean},
		waiting: {state: true},
	}

	// Since we are not using a Shadow DOM you have to manually insert the CSS
	// in one of the parent elements.
	// Maybe inline the CSS so we don't need to do this?
	static styles = css`
		.async-button {
			padding: 5px 15px;
			display: grid;
		}

		/* By putting both the button text and the loading gif into the same
		 * grid cell we ensure that the dimensions of the button remain the
		 * same when switching between them */
		.async-button-label {
			grid-row: 1;
			grid-column: 1;
		}

		.async-button-gif {
			margin: 0 auto;
			height: 1rem;
			grid-row: 1;
			grid-column: 1;
		}
	`;

	createRenderRoot() {
		// By returning `this` we disable the Shadow DOM (see
		// https://lit.dev/docs/components/shadow-dom/#implementing-createrenderroot)
		// Otherwise clicking the button wouldn't submit the surrounding form.
		return this;
	}

	constructor() {
		super();

		this.label = "";
		this.waiting = false;
	}

	render() {
		let label_visibility = this.waiting ? "hidden" : "visible";
		let gif_visibility = this.waiting ? "visible" : "hidden";
		return html
			`<button class="async-button" .disabled=${this.waiting || this.disabled} @click=${this.clicked}>
				<span class="async-button-label" style="visibility: ${label_visibility}">${this.label}</span>
				<img  class="async-button-gif"  style="visibility: ${gif_visibility}" src="../assets/loading.gif">
			</button>`;
	}

	clicked() {
		this.waiting = true;
		this.handler().finally(() => this.waiting = false);
	}
}
customElements.define('async-button', AsyncButton);


class SaveForm extends LitElement {
	static styles = [
		AsyncButton.styles,
		css`
			:host {
				color: blue;
			}

			.error,
			.info,
			.success {
				margin: 10px auto;
				padding: 5px;
				width: 90%;
				border-radius: 5px;
			}

			.error {
				border: 1px solid red;
				background-color: #EBD4D4;
				color: red;
			}

			.info {
				border: 1px solid blue;
				background-color: #D5DEF7;
				color: blue;
			}

			.success {
				border: 1px solid green;
				background-color: #BFF7B0;
				color: green;
			}

			.archive-status-row {
				display: flex;
				align-items: center;
			}

			.archive-availability-cell {
				flex-grow: 1;
			}

			.archive-checkbox-cell {
				width: 4em;
				border-left: 1px solid gray;
				padding-left: 10px;
				margin-left: 10px;
			}
		`
	];

	static properties = {
		tab_id: {},
		url: {},
		title: {},
		mime_type: {},
		// LocalWeb request results
		LW_availability_result: {state: true},
		LW_save_result: {state: true},
		// InternetArchive request results
		IA_availability_result: {state: true},
		IA_save_result: {state: true},
	};

	constructor() {
		super();
		this.LW_availability_result = null;
		this.LW_save_result = null;
		this.IA_save_result = null;
		this.IA_availability_result = null;
	}

	connectedCallback() {
		super.connectedCallback();
		if(!this.url)
			throw Error("SaveForm: No URL provided");

		this.check_LW_availability();
		this.check_IA_availability();
	}

	render() {
		return html`
			<fieldset>
				<legend><small>Page</small></legend>
				<label>
					<div>Title</div>
					<input id="page-title" style="box-sizing: border-box; width: 100%;" type="text" .value=${this.title}>
				</label>
				<div>
					<small style="color: gray">File type: ${this.mime_type}</small>
				</div>
			</fieldset>
			<br>
			<fieldset>
				<legend><small>LocalWeb</small></legend>
				<div class="archive-status-row">
					<div class="archive-availability-cell">
						${this.render_LW_availability_result()}
					</div>
					<div class="archive-checkbox-cell">
						<label style="display: block; text-align: center">
							<async-button
								label="Save"
								.handler=${() => this.save_to_LW()}
								?disabled=${this.LW_availability_result?.status === "archived"}
							/>
						</label>
					</div>
				</div>
				${this.render_LW_save_result()}
			</fieldset>
			<fieldset>
				<legend><small>Internet Archive</small></legend>
				<div class="archive-status-row">
					<div class="archive-availability-cell">
						${this.render_IA_availability_result()}
					</div>
					<div class="archive-checkbox-cell">
						<label style="display: block; text-align: center">
							<async-button label="Save" .handler=${() => this.save_to_IA()} />
						</label>
					</div>
				</div>
				${this.render_IA_save_result()}
			</fieldset>
		`;
	}

	render_LW_save_result() {
		if (!this.LW_save_result)
			return null;

		if (this.LW_save_result.status === "ok")
			return html`<p class="success">Success</p>`;
		else if (this.LW_save_result.status !== "pending")
			return html`<p class="error">Error: ${this.LW_save_result.message}</p>`;
	}

	render_IA_save_result() {
		if (!this.IA_save_result)
			return null;

		if (this.IA_save_result.status === "ok") {
			let message;
			if (this.IA_save_result.message)
				message = html`<p>${this.IA_save_result.message}</p>`;

			return html`<p class="success">Success ${message}</p>`;
		}
		else if (this.IA_save_result.status === "postponed")
			return html`<p class="info">${this.IA_save_result.message}</p>`;
		else if (this.IA_save_result.status === "try_again_later")
			return html`<p class="info">${this.IA_save_result.message}</p>`;
		else if (this.IA_save_result.status !== "pending")
			return html`<p class="error">Error: ${this.IA_save_result.message}</p>`;
	}

	render_LW_availability_result() {
		let result = this.LW_availability_result;
		if (!result)
			return null;

		if (result.status == "pending")
			return html`Loading...`;
		else if (result.status == "archived")
			return html`Snapshot [${result.datetime_iso} (UTC)]`;
		else if (result.status == "not_archived")
			return html`Not saved`;
		else if (result.status == "error")
			return html`Error: ${result.message}`;
	}

	render_IA_availability_result() {
		let result = this.IA_availability_result;
		if (!result)
			return null;

		if (result.status == "pending")
			return html`Loading...`;
		else {
			if (result.status == "archived")
				return html`<a href=${result.url}>Snapshot [${result.datetime_iso} (UTC)]</a>`;
			else if (result.status == "error")
				return html`Error: ${result.message}`;
			else if (result.status == "not_archived")
				return html`Not saved`;
		}
	}

	async save_to_LW() {
		this.LW_save_result = {status: "pending"};
		try {
			let contents = await get_contents(this.tab_id, this.url, this.mime_type);
			let is_binary = contents instanceof Uint8Array;
			if (is_binary)
				contents = contents.toBase64();

			let page_title = this.renderRoot.querySelector("#page-title").value;
			let response = await send_native_message({
				action: "save",
				url: this.url,
				title: page_title,
				mime_type: this.mime_type,
				is_base64: is_binary,
				contents: contents,
			});

			if (response.status === "ok") {
				this.LW_save_result = {status: "ok"};
				this.LW_availability_result = {status: "archived", datetime_iso: response.timestamp};
			}
			else if (response.status === "error")
				throw Error(response.message);
			else
				throw Error(`Native app has returned with unknown status: ${response.status}`);
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.LW_save_result = {status: "error", message: e.message};
		}
	}

	async check_LW_availability() {
		this.LW_availability_result = {status: "pending"};
		try {
			let response = await send_native_message({action: "query", url: this.url});

			if (response.status === "ok")
				this.LW_availability_result = {
					status: response.archived ? "archived" : "not_archived",
					datetime_iso: response.archived?.timestamp,
				};
			else if (response.status === "error")
				throw Error(response.message);
			else
				throw Error(`Native app has returned with unknown status: ${response.status}`);
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.LW_availability_result = {status: "error", message: e.message};
		}
	}

	async save_to_IA() {
		this.IA_save_result = {status: "pending"};
		try {
			this.IA_save_result = await IA.save_page(this.url);
			if (this.IA_save_result.status === "ok") {
				this.IA_availability_result = {
					status: "archived",
					datetime_iso: this.IA_save_result.datetime_iso,
					url: this.IA_save_result.url,
				};
			}
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.IA_save_result = {status: "error", message: e.message};
		}
	}

	async check_IA_availability() {
		this.IA_availability_result = {status: "pending"};
		try {
			this.IA_availability_result = await IA.check_availability(this.url);
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.IA_availability_result = {status: "error", message: e.message};
		}
	}
}
customElements.define('save-form', SaveForm);

async function send_native_message(msg) {
	msg.sender = "localweb";
	let response = await browser.runtime.sendNativeMessage("localweb_companion", msg);
	if (!response || !response.hasOwnProperty("status"))
		throw Error("Invalid response from native app");

	return response;
}
