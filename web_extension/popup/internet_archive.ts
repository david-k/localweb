export type SaveResult =
	| {status: "ok", datetime_iso: string, url: string, message: string|null}
	| {status: "postponed", message: string|null}
	| {status: "try_again_later", message: string|null};

export async function save_page(page_url: string): Promise<SaveResult> {
	// The steps are as follows:
	//
	// 1. Send save request to WebArchive
	// 2. Extract job ID from the response
	// 3. Poll status of job ID until success or failure
	//
	// If you have an account, you get to use a nice JSON API for this. If not,
	// you have to contend with HTML. I chose the latter for now.
	//
	// The code is adapted from the official WebArchive extension at
	// https://github.com/internetarchive/wayback-machine-webextension/blob/master/webextension/scripts/background.js

	let response = await fetch("https://web.archive.org/save", {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			url: page_url,
			capture_all: "on" // Save snapshot even if it is an error page
		}),
	});
	if (!response.ok)
		throw Error(`Saving to WebArchive failed with code ${response.status} (${response.statusText})`)

	let html = await response.text();
	let info = extract_info(html);
	console.log("Extracted status from Internet Archive:", info);

	if (info.status === "ok") {
		let job_id = extract_job_id(html);
		if (!job_id) {
			throw Error(
				`Failed to extract job ID. This could be because the Internet
				Archive is handling too many request at the moment. In this
				case try again later.`
			);
		}

		let result = await wait_for_job_completion(job_id, page_url);
		return {...result, message: info.message};
	}
	else
		return {status: info.status, message: info.message};
}

export async function wait_for_job_completion(job_id: string, page_url: string): Promise<SaveResult> {
	// Even for invalid job IDs WebArchive returns status === "pending".
	// So to ensure that we don't poll indefinitely on an invalid job ID,
	// define an upper limit.
	const MAX_ATTEMPTS = 20;
	const DEFAULT_WAIT_TIME_MS = 6000;

	let wait_time_ms = DEFAULT_WAIT_TIME_MS;
	for (let i = 0; i < MAX_ATTEMPTS; ++i) {
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
		if (data.status === "pending")
			continue;

		if (data.status === "success") {
			return {
				status: "ok",
				datetime_iso: timestamp_to_iso(data.timestamp),
				url: "https://web.archive.org/web/" + encodeURIComponent(data.timestamp) + "/" + encodeURIComponent(page_url),
				message: null
			};
		}

		throw Error("Saving snapshot failed");
	}

	throw Error("Max number of poll attempts reached");
}

export type AvailabilityResult =
	| {status: "archived", datetime_iso: string, url: string}
	| {status: "not_archived"};

export async function check_availability(page_url: string): Promise<AvailabilityResult> {
	// This function uses the same endpoint as the Wayback Machine browser
	// extension. Not sure though why the API subdomain is browser-specific.
	//
	// There is also a publicly documented alternative API described here:
	// https://archive.org/help/wayback_api.php
	// However, this endpoint seems to be unreliable. It sometimes reports that
	// no snapshots are available even though it reported the opposite in the
	// past. Also, the reported timestamp is often out of date.

	let request_url = new URL("https://firefox-api.archive.org/__wb/sparkline")
	request_url.searchParams.append("collection", "web");
	request_url.searchParams.append("output", "json");
	request_url.searchParams.append("url", page_url);
	let response = await fetch(request_url);
	if(!response.ok)
		throw Error(`Request to WebArchive failed with code ${response.status}`);

	let json = await response.json();
	let latest_timestamp = json.last_ts;
	if(!latest_timestamp)
		return {status: "not_archived"};

	return {
		status: "archived",
		datetime_iso: timestamp_to_iso(latest_timestamp),
		url: "https://web.archive.org/web/" + encodeURIComponent(latest_timestamp) + "/" + encodeURIComponent(page_url),
	};
}

function timestamp_to_iso(timestamp: string): string {
	let year = timestamp.substring(0, 4);
	let month = timestamp.substring(4, 6);
	let day = timestamp.substring(6, 8)
	let hour = timestamp.substring(8, 10)
	let minute = timestamp.substring(10, 12)
	let second = timestamp.substring(12, 14)

	return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function extract_job_id(html: string): string|null {
	let job_ids = html.match(/spn2-[a-z0-9-]*/g);
	return job_ids?.[0] || null;
}

type PageInfo = {
	status: "ok" | "postponed" | "try_again_later",
	message: string|null,
};

function extract_info(html_text: string): PageInfo {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html_text, "text/html");

	let title_el = doc.querySelector("#spn-title");
	if (!title_el) {
		for(let el of doc.querySelectorAll("h2")) {
			if (el.textContent === "Sorry") {
				title_el = el;
				break;
			}
		}
	}

	let message = title_el?.nextElementSibling?.textContent;
	if (!message)
		return {status: "ok", message: null};

	return {
		status: message_to_status(message),
		message
	};
}

function message_to_status(message: string): "ok"|"postponed"|"try_again_later" {
	// "The capture will start in ~1 hour, 34 minutes because our service is
	// currently overloaded. You may close your browser window and the page
	// will still be saved."
	if (message.indexOf("The capture will start in") !== -1)
		return "postponed";

	// "The same snapshot had been made 3 minutes ago. You can make new capture
	// of this URL after 1 hour."
	else if (message.indexOf("The same snapshot had been made") !== -1)
		return "try_again_later";

	// "This URL has been already captured 1 times today, which is a daily
	// limit we have set for that Resource type. Please try again tomorrow.
	// Please email us at "info@archive.org" if you would like to discuss this
	// more."
	else if (message.indexOf("This URL has been already captured") !== -1)
		return "try_again_later";

	return "ok";
}

function sleep_ms(ms: number): Promise<undefined> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
