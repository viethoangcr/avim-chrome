/*
 * MV3 background service worker: storage-backed preferences and badge.
 * A worker may be terminated between events, so no settings live in globals;
 * every handler reads chrome.storage.local and restores the badge from it.
 * No window/DOM: this file must run in a service worker global scope.
 *
 * Modified 2026-08-06 for the AVIM Vietnamese IME fork (see NOTICE):
 * rewritten from the MV2 background page to this storage-backed service
 * worker; original localStorage and context-menu code removed.
 */
import type { Prefs, SavePrefsMessage } from '../shared/messages';

const DEFAULT_PREFS: Prefs = { method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 };
const PREF_FIELDS: (keyof Prefs)[] = ['method', 'onOff', 'ckSpell', 'oldAccent'];

// Untrusted message values: method is an integer 0-4, the rest are 0 or 1.
function isPrefValue(field: string, value: unknown): boolean {
	if (field === 'method') {
		return typeof value === 'number' && value === Math.floor(value) && value >= 0 && value <= 4;
	}
	return value === 0 || value === 1;
}

// Read with defaults so incomplete stored data is safe; always returns the
// full canonical preference object.
async function readPrefs(): Promise<Prefs> {
	const stored = (await chrome.storage.local.get(DEFAULT_PREFS)) as Prefs;
	return {
		method: stored.method,
		onOff: stored.onOff,
		ckSpell: stored.ckSpell,
		oldAccent: stored.oldAccent
	};
}

function updateBadge(prefs: Prefs): void {
	const on = prefs.onOff === 1;
	chrome.action.setBadgeText({ text: on ? 'on' : 'off' });
	chrome.action.setBadgeBackgroundColor({ color: on ? [0, 255, 0, 255] : [255, 0, 0, 255] });
}

// Push prefs to every tab. Only tab ids are read.
async function pushPrefsToTabs(prefs: Prefs): Promise<void> {
	const tabs = await chrome.tabs.query({});
	for (const tab of tabs) {
		// The deliberate swallow is the promise-form equivalent of the old
		// consumeTabError(); protected pages and tabs without the content
		// script are expected delivery failures.
		void chrome.tabs.sendMessage(tab.id!, { type: 'prefs', prefs }).catch(() => {});
	}
}

async function savePrefs(msg: SavePrefsMessage): Promise<Prefs> {
	const changes: Partial<Prefs> = {};
	for (const field of PREF_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(msg.prefs, field) && isPrefValue(field, msg.prefs[field])) {
			changes[field] = msg.prefs[field];
		}
	}
	await chrome.storage.local.set(changes);
	const prefs = await readPrefs();
	updateBadge(prefs);
	await pushPrefsToTabs(prefs);
	return prefs;
}

async function toggleAvim(): Promise<Prefs> {
	const stored = await readPrefs();
	const next = stored.onOff === 1 ? 0 : 1;
	await chrome.storage.local.set({ onOff: next });
	const prefs = await readPrefs();
	updateBadge(prefs);
	await pushPrefsToTabs(prefs);
	return prefs;
}

chrome.runtime.onInstalled.addListener(async (details) => {
	// A fresh install persists the exact defaults; an update or Chrome update
	// never overwrites user settings. Either way the badge is restored.
	if (details.reason === 'install') {
		await chrome.storage.local.set(DEFAULT_PREFS);
	}
	updateBadge(await readPrefs());
});

chrome.runtime.onStartup.addListener(async () => {
	updateBadge(await readPrefs());
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	switch (message?.type) {
		case 'get_prefs': readPrefs().then(sendResponse); return true;
		case 'save_prefs': savePrefs(message).then(sendResponse); return true;
		case 'turn_avim': toggleAvim().then(sendResponse); return true;
		default: return;
	}
});
