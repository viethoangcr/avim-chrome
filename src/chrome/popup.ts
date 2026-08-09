/*
 * Popup options page: reads/writes preferences through the promise-based
 * runtime messaging envelope, then drives the demo textarea with the engine
 * (scripts/popup-avim.js). The demo input was loaded but never initialized
 * before — this file assigns the engine instance to the global `AVIMObj`
 * (start() reads it) and attaches the keypress handler.
 *
 * Modified 2026-08-06 for the AVIM Vietnamese IME fork (see NOTICE):
 * messaging migrated to chrome.runtime, promise-form lastError tolerance
 * (a rejected/missing response is swallowed). Popup logic otherwise unchanged.
 */
import type { GetPrefsMessage, Prefs, SavePrefsMessage } from '../shared/messages';

function $g(id: string): HTMLElement {
	return document.getElementById(id)!;
}

function getI18n(message: string): string {
	return chrome.i18n.getMessage(message);
}

function loadText(): void {
	const keys = ['Sel', 'Auto', 'Telex', 'Vni', 'Viqr', 'ViqrStar', 'Off', 'Tips', 'TipsCtrl', 'Demo', 'DemoCopy'];
	for (const k of keys) {
		$g('txt' + k).innerHTML = getI18n('extPopup' + k);
	}
}

function hightlightDemo(): void {
	const demo = $g('inputDemo') as HTMLTextAreaElement;
	demo.focus();
	demo.select();
}

async function setAVIMConfig(key: 'method' | 'onOff', value: number): Promise<void> {
	const prefs: Partial<Prefs> = key === 'method' ? { method: value, onOff: 1 } : { onOff: value };
	const message: SavePrefsMessage = { type: 'save_prefs', prefs };
	const response = await chrome.runtime.sendMessage(message).catch(() => undefined);
	if (response) {
		window.location.reload();
	}
}

async function init(): Promise<void> {
	loadText();

	const offEle = $g('off') as HTMLInputElement;
	const autoEle = $g('auto') as HTMLInputElement;
	const telexEle = $g('telex') as HTMLInputElement;
	const vniEle = $g('vni') as HTMLInputElement;
	const viqrEle = $g('viqr') as HTMLInputElement;
	const viqrStarEle = $g('viqrStar') as HTMLInputElement;

	offEle.addEventListener('click', () => { void setAVIMConfig('onOff', 0); });
	autoEle.addEventListener('click', () => { void setAVIMConfig('method', 0); });
	telexEle.addEventListener('click', () => { void setAVIMConfig('method', 1); });
	vniEle.addEventListener('click', () => { void setAVIMConfig('method', 2); });
	viqrEle.addEventListener('click', () => { void setAVIMConfig('method', 3); });
	viqrStarEle.addEventListener('click', () => { void setAVIMConfig('method', 4); });

	$g('demoCopy').addEventListener('click', hightlightDemo);

	const prefs: Prefs | undefined = await chrome.runtime.sendMessage({ type: 'get_prefs' } as GetPrefsMessage).catch(() => undefined);
	if (prefs) {
		if (prefs.onOff === 0) {
			offEle.checked = true;
		} else {
			if (prefs.method === 0) autoEle.checked = true;
			if (prefs.method === 1) telexEle.checked = true;
			if (prefs.method === 2) vniEle.checked = true;
			if (prefs.method === 3) viqrEle.checked = true;
			if (prefs.method === 4) viqrStarEle.checked = true;
		}
		// engine globals, the same assignment configAVIM does in extension.js
		method = prefs.method;
		onOff = prefs.onOff;
		checkSpell = prefs.ckSpell;
		oldAccent = prefs.oldAccent;
	}

	// demo engine: mirrors _keyPressHandler in extension.js minus the
	// type/readOnly/ignore checks (the demo input is always a textarea)
	AVIMObj = new AVIM();
	const demo = $g('inputDemo') as HTMLTextAreaElement;
	demo.addEventListener('keypress', (e) => {
		const ke = e as any;
		if (ke.ctrlKey || ke.altKey) return;
		const code = ke.which;
		if (checkCode(code)) return;
		AVIMObj.sk = fromCharCode(code);
		start(demo, e);
		if (AVIMObj.changed) {
			AVIMObj.changed = false;
			ke.preventDefault();
		}
	});
}

void init();
