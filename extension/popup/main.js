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

		.success,
		.error {
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

		.success {
			border: 1px solid green;
			background-color: #BFF7B0;
			color: green;
		}
	`;

	static properties = {
		tab_id: {},
		url: {},
		title: {},
		mime_type: {},
		saving: {state: true},
		local_save_result: {state: true},
		webarchive_availability_result: {state: true},
		webarchive_save_result: {state: true},
	};

	constructor() {
		super();
		this.saving = false;
		this.local_save_result = null;
		this.webarchive_save_result = null;
		this.webarchive_availability_result = null;
	}

	connectedCallback() {
		super.connectedCallback();
		if(!this.url)
			throw Error("SaveForm: No URL provided");

		this.check_webarchive_snapshot_availability();
	}

	render() {
		return html`
			<form @submit=${this.submit}>
				<fieldset>
					<legend><small>Local</small></legend>
					<p>
						<label>
							<div>Title</div>
							<input name="title" size="40" type="text" .value=${this.title}>
						</label>
						<div>
							<small style="color: gray">File type: ${this.mime_type}</small>
						</div>
					</p>
					${this.render_local_save_result()}
				</fieldset>
				<fieldset>
					<legend><small>Web Archive</small></legend>
					${this.render_webarchive_availability_result()}
					${this.render_webarchive_save_result()}
				</fieldset>
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

	render_local_save_result() {
		if (!this.local_save_result)
			return null;

		if (this.local_save_result.status === "pending")
			return html`<p>Saving...</p>`;
		else if (this.local_save_result.status === "ok")
			return html`<p class="success">Success</p>`;
		else
			return html`<p class="error">Error: ${this.local_save_result.info}</p>`;
	}

	render_webarchive_save_result() {
		if (!this.webarchive_save_result)
			return null;

		if (this.webarchive_save_result.status === "pending")
			return html`<p>Saving...</p>`;
		else if (this.webarchive_save_result.status === "ok") {
			return html`
				<p class="success">
					Saved to <a href=${this.webarchive_save_result.url}>snapshot</a>
					[${this.webarchive_save_result.datetime_iso} (UTC)]
				</p>`;
		}
		else
			return html`<p class="error">Error: ${this.webarchive_save_result.info}</p>`;
	}

	render_webarchive_availability_result() {
		let result = this.webarchive_availability_result;
		if (!result)
			return null;

		if (result.status == "pending")
			return html`Loading...`;
		else {
			let create_checkbox = (checked) => {
				return html`
					<p>
						<label><input name="save-to-web-archive" type="checkbox" .checked=${checked}> Create snapshot</label>
					</p>`;
			};

			if (result.status == "archived")
				return html`<a href=${result.url}>Snapshot</a> [${result.datetime_iso} (UTC)] ${create_checkbox(false)}`;
			else if (result.status == "error")
				return html`Error: ${result.info}`;
			else if (result.status == "not_archived")
				return html`No snapshot available ${create_checkbox(true)}`;
		}
	}

	async submit(event) {
		event.preventDefault();
		this.saving = true;

		let form = event.target;
		let title = form.elements["title"].value;
		let should_save_to_webarchive = form.elements["save-to-web-archive"].checked;

		let promises = [this.save_locally(title)];
		if (should_save_to_webarchive)
			promises.push(this.save_to_webarchive())

		let results = await Promise.allSettled(promises);
		this.saving = false;
	}

	async save_locally(title) {
		this.local_save_result = {status: "pending"};
		try {
			let contents = await get_contents(this.tab_id, this.url, this.mime_type);
			let is_binary = contents instanceof Uint8Array;
			if (is_binary) {
				contents = contents.toBase64();
			}
			let msg = await browser.runtime.sendNativeMessage("singlefile_companion", {
				sender: "localweb",
				action: "save",
				url: this.url,
				title: title,
				mime_type: this.mime_type,
				is_base64: is_binary,
				contents: contents,
			});

			if (!msg || !msg.hasOwnProperty("status"))
				throw Error("Invalid response from native app");

			if (msg.status === "ok")
				this.local_save_result = {status: "ok"};
			else if (msg.status === "error")
				throw Error(msg.info);
			else
				throw Error(`Native app has returned with unknown status: ${msg.status}`);
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.local_save_result = {
				status: "error",
				info: e.message,
			};
			throw e;
		}
	}

	async save_to_webarchive() {
		// The steps are as follows:
		//
		// 1. Send save request to WebArchive
		// 2. Extract job ID from the response
		// 3. Poll status of job ID until success or failure
		//
		// If you have an account, you get to use a nice JSON API for this. If
		// not, you have to contend with HTML. I chose the latter for now.
		//
		// The code is adapted from the official WebArchive extension at
		// https://github.com/internetarchive/wayback-machine-webextension/blob/master/webextension/scripts/background.js

		this.webarchive_save_result = {status: "pending"};
		try {
			let response = await fetch("https://web.archive.org/save", {
				method: "POST",
				headers: {
					"Content-Type": "application/x-www-form-urlencoded",
				},
				body: new URLSearchParams({
					url: this.url,
					capture_all: "on" // Save snapshot even if it is an error page
				}),
			});
			if (!response.ok)
				throw Error(`Saving to WebArchive failed with code ${response.status} (${response.statusText})`)

			let response_html = await response.text();
			let job_id = extractJobIdFromHTML(response_html);
			if (!job_id)
				throw Error("WebArchive rejected the save request. Try again later.");

			await this.poll_webarchive_job_status(this.url, job_id);
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.webarchive_save_result = {
				status: "error",
				info: e.message,
			};
			throw e;
		}
	}

	async poll_webarchive_job_status(url, job_id) {
		// Even for invalid job IDs WebArchive returns status === "pending".
		// So to ensure that we don't poll indefinitely on an invalid job ID, define an upper limit.
		const MAX_TRIES = 20;
		const DEFAULT_WAIT_TIME_MS = 6000;

		let wait_time_ms = DEFAULT_WAIT_TIME_MS;
		for (let i = 0; i < MAX_TRIES; ++i) {
			await sleep_ms(wait_time_ms);

			let response = await fetch("https://web.archive.org/save/status/" + encodeURIComponent(job_id));
			if (!response.ok)
				throw Error(`Requesting status failed with code ${response.status} (${response.statusText})`)

			if (response.headers.has("Retry-After")) {
				let new_wait_time_s = Number(response.headers.get("Retry-After"));
				if (!Number.isNaN(new_wait_time_s))
					wait_time_ms = new_wait_time_s * 1000;
			}

			let data = await response.json();
			if (data.status === "success") {
				this.webarchive_save_result = {
					status: "ok",
					datetime_iso: wayback_timestamp_to_iso(data.timestamp),
					url: "https://web.archive.org/web/" + encodeURIComponent(data.timestamp) + "/" + encodeURIComponent(url),
				};

				break;
			}
			else if (data.status !== "pending") {
				throw Error("Saving snapshot failed");
			}
		}
	}

	async check_webarchive_snapshot_availability() {
		this.webarchive_availability_result = {status: "pending"};
		try {
			let url = new URL("http://archive.org/wayback/available")
			url.searchParams.append("url", this.url);
			let response = await fetch(url);
			if(!response.ok)
				throw Error(`Request to WebArchive failed with code ${response.status}`);

			let json = await response.json();
			let snapshots = json["archived_snapshots"];
			if(snapshots.hasOwnProperty("closest") && snapshots.closest.available) {
				this.webarchive_availability_result = {
					status: "archived",
					datetime_iso: wayback_timestamp_to_iso(snapshots.closest.timestamp),
					url: snapshots.closest.url,
				};
			}
			else
				this.webarchive_availability_result = {status: "not_archived"};
		}
		catch(e) {
			console.error("ERROR:", e.message);
			this.webarchive_availability_result = {status: "error", info: e.message};
		}
	}
}
customElements.define('save-form', SaveForm);

function wayback_timestamp_to_iso(timestamp) {
	let year = timestamp.substring(0, 4);
	let month = timestamp.substring(4, 6);
	let day = timestamp.substring(6, 8)
	let hour = timestamp.substring(8, 10)
	let minute = timestamp.substring(10, 12)
	let second = timestamp.substring(12, 14)

	return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

// Taken from https://github.com/internetarchive/wayback-machine-webextension/blob/master/webextension/scripts/background.js
function extractJobIdFromHTML(html) {
  // match the spn id pattern
  const jobRegex = /spn2-[a-z0-9-]*/g
  const jobIds = html.match(jobRegex)
  return jobIds?.[0] || null;
}

function sleep_ms(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
