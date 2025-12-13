
export async function save_page(page_url) {
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
	let job_id = extractJobIdFromHTML(html);
	if (!job_id)
		throw Error("WebArchive rejected the save request. Try again later.");

	return await wait_for_job_completion(job_id, page_url);
}

export async function wait_for_job_completion(job_id, page_url) {
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
			};
		}

		throw Error("Saving snapshot failed");
	}

	throw Error("Max number of poll attempts reached");
}

export async function check_availability(page_url) {
	let request_url = new URL("http://archive.org/wayback/available")
	request_url.searchParams.append("url", page_url);
	let response = await fetch(request_url, {
		// By default, availability checks are cached for 6 hours.
		// However, if the user creates a snapshot, we want to show the
		// timestampt of that snapshot and not the cached one.
		cache: "reload",
	});
	if(!response.ok)
		throw Error(`Request to WebArchive failed with code ${response.status}`);

	let json = await response.json();
	let snapshots = json["archived_snapshots"];
	if(!snapshots.hasOwnProperty("closest") || !snapshots.closest.available)
		return {status: "not_archived"};

	return {
		status: "archived",
		datetime_iso: timestamp_to_iso(snapshots.closest.timestamp),
		url: snapshots.closest.url,
	};
}

function timestamp_to_iso(timestamp) {
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

////////////////////////////////////////////////////////////////////////////////
export default {
	save_page,
	check_availability,
};
