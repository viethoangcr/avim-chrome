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

/* jshint globalstrict: true */
/* global chrome */
'use strict';

var DEFAULT_PREFS = { method: 0, onOff: 1, ckSpell: 1, oldAccent: 1 };
var PREF_FIELDS = ['method', 'onOff', 'ckSpell', 'oldAccent'];

// Untrusted message values: method is an integer 0-4, the rest are 0 or 1.
function isPrefValue(field, value) {
	if (field === 'method') {
		return typeof value === 'number' && value === Math.floor(value) && value >= 0 && value <= 4;
	}
	return value === 0 || value === 1;
}

// Read with defaults so incomplete stored data is safe; always returns the
// full canonical preference object.
function readPrefs(callback) {
	chrome.storage.local.get(DEFAULT_PREFS, function(stored) {
		callback({
			method: stored.method,
			onOff: stored.onOff,
			ckSpell: stored.ckSpell,
			oldAccent: stored.oldAccent
		});
	});
}

function updateBadge(prefs) {
	var on = prefs.onOff === 1;
	chrome.action.setBadgeText({ text: on ? 'on' : 'off' });
	chrome.action.setBadgeBackgroundColor({ color: on ? [0, 255, 0, 255] : [255, 0, 0, 255] });
}

// Reading lastError consumes the per-tab delivery error; protected pages
// and tabs without the content script are expected delivery failures.
function consumeTabError() {
	void chrome.runtime.lastError;
}

// Push prefs to every tab. Only tab ids are read.
function pushPrefsToTabs(prefs) {
	chrome.tabs.query({}, function(tabs) {
		for (var i = 0; i < tabs.length; i++) {
			chrome.tabs.sendMessage(tabs[i].id, prefs, consumeTabError);
		}
	});
}

function savePrefs(request, sendResponse) {
	readPrefs(function() {
		var changes = {};
		for (var i = 0; i < PREF_FIELDS.length; i++) {
			var field = PREF_FIELDS[i];
			if (request.hasOwnProperty(field) && isPrefValue(field, request[field])) {
				changes[field] = request[field];
			}
		}
		chrome.storage.local.set(changes, function() {
			readPrefs(function(prefs) {
				updateBadge(prefs);
				pushPrefsToTabs(prefs);
				sendResponse(prefs);
			});
		});
	});
}

function toggleAvim(sendResponse) {
	readPrefs(function(stored) {
		var next = stored.onOff === 1 ? 0 : 1;
		chrome.storage.local.set({ onOff: next }, function() {
			readPrefs(function(prefs) {
				updateBadge(prefs);
				pushPrefsToTabs(prefs);
				sendResponse(prefs);
			});
		});
	});
}

chrome.runtime.onInstalled.addListener(function(details) {
	// A fresh install persists the exact defaults; an update or Chrome update
	// never overwrites user settings. Either way the badge is restored.
	if (details.reason === 'install') {
		chrome.storage.local.set(DEFAULT_PREFS, function() {
			readPrefs(updateBadge);
		});
	} else {
		readPrefs(updateBadge);
	}
});

chrome.runtime.onStartup.addListener(function() {
	readPrefs(updateBadge);
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
	if (request && request.get_prefs) {
		readPrefs(sendResponse);
		return true;
	}
	if (request && request.save_prefs) {
		savePrefs(request, sendResponse);
		return true;
	}
	if (request && request.turn_avim) {
		toggleAvim(sendResponse);
		return true;
	}
});
