/*
 * Modified 2026-08-06 for the AVIM Vietnamese IME fork (see NOTICE):
 * messaging migrated to chrome.runtime, promise-based, with the typed
 * message envelope; a missing response (extension reload or page teardown)
 * keeps the current configuration instead of throwing or re-initializing.
 * Content-script behavior otherwise unchanged.
 */
import type { GetPrefsMessage, Prefs, PrefsPushMessage, RequestMessage, TurnAvimMessage } from '../shared/messages';

var document = window.document;
var allFrames: any = [];

var inputTypes = ["textarea", "text", "search", "tel"];

function sendRequest(msg: RequestMessage): Promise<Prefs> {
	return chrome.runtime.sendMessage(msg) as Promise<Prefs>;
}

function AVIMInit(AVIM: any) {
	allFrames = document.getElementsByTagName("iframe");
	for(AVIM.g = 0; AVIM.g < allFrames.length; AVIM.g++) {
		if(findIgnore(allFrames[AVIM.g])) {
			continue;
		}
		var iframedit: any;
		try {
			AVIM.wi = allFrames[AVIM.g].contentWindow;
			iframedit = AVIM.wi.document;
			iframedit.wi = AVIM.wi;
			if(iframedit && (upperCase(iframedit.designMode) == "ON")) {
				iframedit.AVIM = AVIM;
				if(!('onbeforeinput' in iframedit)) {
					attachEvt(iframedit, "keypress", ifMoz, false);
				}
			}
		} catch(e) {}
	}/**/
}

function findIgnore(el: any): boolean {
	var va = exclude, i: number;
	for(i = 0; i < va.length; i++) {
		if((va[i].length > 0) && (el.name == va[i] || el.id == va[i])) {
			return true;
		}
	}
	return false;
}

function _keyPressHandler(e: any) {
	var el = e.target, code = e.which;
	if(e.ctrlKey) {
		return;
	}
	if(e.altKey && (code != 92) && (code != 126)) {
		return;
	}
	if(inputTypes.indexOf(el.type) < 0) {// Not contains in list of input types
		if (el.isContentEditable) {
			ifMoz(e);
		}
		return;
	}
	if (checkCode(code)) {
		return;
	}
	AVIMObj.sk = fromCharCode(code);
	if(findIgnore(el) || el.readOnly) {
		return;
	}
	start(el, e);
	if(AVIMObj.changed) {
		AVIMObj.changed = false;
		e.preventDefault();
		return false;
	}
	return;
}

var isPressCtrl = false;
function _keyUpHandler(evt: any) {
	var code = evt.which;

	// Press Ctrl twice to off/on AVIM
	if (code == 17) {
		if (isPressCtrl) {
			isPressCtrl = false;
			void sendRequest({ type: 'turn_avim' } as TurnAvimMessage).then(configAVIM).catch(() => {});
		} else {
			isPressCtrl = true;
			// Must press twice in 300ms
			setTimeout(function(){
				isPressCtrl = false;
			}, 300);
		}
	} else {
		isPressCtrl = false;
	}
}

function keyUpHandler(evt: any) {
	_keyUpHandler(evt);
}

function keyPressHandler(evt: any) {
	var success = _keyPressHandler(evt);
	if (success === false) {
		evt.preventDefault();
	}
}

function attachEvt(obj: any, evt: string, handle: any, capture: boolean) {
	obj.addEventListener(evt, handle, capture);
}

function removeEvt(obj: any, evt: string, handle: any, capture: boolean) {
	obj.removeEventListener(evt, handle, capture);
}

var _observer: any = null;
var _frameLoad = function(e: any) {
	if(e.target && (e.target.tagName == "IFRAME")) {
		AVIMInit(AVIMObj);
	}
};

function removeOldAVIM() {
	// Untrigger event
	if(_observer) {
		_observer.disconnect();
		_observer = null;
	}
	removeEvt(document, "load", _frameLoad, true);
	removeEvt(document, "keypress", keyPressHandler, true);
	removeEvt(document, "keyup", keyUpHandler, true);
	AVIMTransport.detach(document);
	
	// Remove AVIM
	AVIMInit(AVIMObj);
	AVIMObj = null;
	//delete AVIMObj;
}

function newAVIMInit() {
	if (typeof AVIMObj != "undefined" && AVIMObj) {
		removeOldAVIM();
	}
	
	allFrames = document.getElementsByTagName("iframe");
	AVIMObj = new AVIM();
	AVIMInit(AVIMObj);
	_observer = new MutationObserver(function(mutations: any) {
		for(var i = 0; i < mutations.length; i++) {
			for(var j = 0; j < mutations[i].addedNodes.length; j++) {
				if(mutations[i].addedNodes[j].tagName == "IFRAME") {
					AVIMInit(AVIMObj);
					return;
				}
			}
		}
	});
	_observer.observe(document.documentElement, { childList: true, subtree: true });
	attachEvt(document, "load", _frameLoad, true);
	
	// Trigger event
	var modern = AVIMTransport.attach(document);
	if(!modern) {
		attachEvt(document, "keypress", keyPressHandler, true);
	}
	attachEvt(document, "keyup", keyUpHandler, true);
}

function configAVIM(data: Prefs) {
	if (data) {
		method = data.method;
		onOff = data.onOff;
		checkSpell = data.ckSpell;
		oldAccent = data.oldAccent;
	}

	newAVIMInit();
}

// Promise-form lastError tolerance: a missing response (extension reload,
// page teardown) keeps the current configuration instead of re-initializing.
void sendRequest({ type: 'get_prefs' } as GetPrefsMessage).then(configAVIM).catch(() => {});

chrome.runtime.onMessage.addListener((message: PrefsPushMessage) => {
	if (message?.type === 'prefs') configAVIM(message.prefs);
});
