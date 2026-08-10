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

function AVIMInit(AVIM: any, isAttach: boolean) {
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
				if (isAttach) {
					if(!('onbeforeinput' in iframedit)) {
						attachEvt(iframedit, "keypress", ifMoz, false);
					}
					attachEvt(iframedit, "keydown", keyDownHandler, false);
				} else {
					if(!('onbeforeinput' in iframedit)) {
						attachEvt(iframedit, "keypress", ifMoz, false);
					}
					attachEvt(iframedit, "keydown", keyDownHandler, false);
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

function findFrame(): any {
	for(var i = 0; i < allFrames.length; i++) {
		if(findIgnore(allFrames[i])) return;
		AVIMObj.frame = allFrames[i];
		if(typeof(AVIMObj.frame) != "undefined") {
			try {
				if (AVIMObj.frame.contentWindow.document && AVIMObj.frame.contentWindow.event) {
					return AVIMObj.frame.contentWindow;
				}
			} catch(e) {
				if (AVIMObj.frame.document && AVIMObj.frame.event) {
					return AVIMObj.frame;
				}
			}
		}
	}
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

function _keyDownHandler(evt: any) {
	var key: any;
	if(evt == "iframe") {
		AVIMObj.frame = findFrame();
		key = AVIMObj.frame.event.keyCode;
	} else {
		key = evt.which;
	}
	void key; // legacy dead store, ported verbatim
}

function keyUpHandler(evt: any) {
	_keyUpHandler(evt);
}

function keyDownHandler(evt: any) {
	_keyDownHandler(evt);
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

var ajaxCounter = 0;
function AVIMAJAXFix() {
	if (isNaN(parseInt(String(ajaxCounter)))) {
		ajaxCounter = 0;
	} else {
		ajaxCounter = parseInt(String(ajaxCounter));
	}
	AVIMInit(AVIMObj, true);
	ajaxCounter++;
	if (ajaxCounter < 100) {
		setTimeout(AVIMAJAXFix, 100);
	}
}

function removeOldAVIM() {
	// Untrigger event
	removeEvt(document, "mouseup", AVIMAJAXFix, false);
	removeEvt(document, "keydown", keyDownHandler, true);
	removeEvt(document, "keypress", keyPressHandler, true);
	removeEvt(document, "keyup", keyUpHandler, true);
	AVIMTransport.detach(document);
	
	// Remove AVIM
	AVIMInit(AVIMObj, false);
	AVIMObj = null;
	//delete AVIMObj;
}

function newAVIMInit() {
	if (typeof AVIMObj != "undefined" && AVIMObj) {
		removeOldAVIM();
	}
	
	allFrames = document.getElementsByTagName("iframe");
	AVIMObj = new AVIM();
	AVIMAJAXFix();
	
	// Trigger event
	var modern = AVIMTransport.attach(document);
	if(!modern) {
		attachEvt(document, "keydown", keyDownHandler, true);
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
