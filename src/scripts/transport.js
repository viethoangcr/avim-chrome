/*
 * Modern IME transport (plan 20260810): no preventDefault. Snapshot the
 * pre-edit state on beforeinput, transform on input via the AVIM engine,
 * rewrite the DOM, then dispatch a synthetic input event so framework state
 * converges. Legacy keypress/ifMoz stays for browsers without beforeinput.
 */

var inputTypes = ["textarea", "text", "search", "tel"];

function findIgnore(el) {
	var va = exclude, i;
	for(i = 0; i < va.length; i++) {
		if((va[i].length > 0) && (el.name == va[i] || el.id == va[i])) {
			return true;
		}
	}
	return false;
}

function editableRoot(el) {
	if(el && el.isContentEditable) {
		if(el.closest) {
			var host = el.closest('[contenteditable]');
			if(host) return host;
		}
		return el;
	}
	return el;
}

function firstTextNode(root) {
	if(!root || !root.childNodes) return null;
	for(var i = 0; i < root.childNodes.length; i++) {
		var c = root.childNodes[i];
		if(c.nodeType == 3) return c;
		if(c.nodeType == 1) {
			var t = firstTextNode(c);
			if(t) return t;
		}
	}
	return null;
}

function lastTextNode(root) {
	if(!root || !root.childNodes) return null;
	for(var i = root.childNodes.length - 1; i >= 0; i--) {
		var c = root.childNodes[i];
		if(c.nodeType == 3) return c;
		if(c.nodeType == 1) {
			var t = lastTextNode(c);
			if(t) return t;
		}
	}
	return null;
}

var AVIMTransport = {
	pendingMap: new WeakMap(),
	isApplying: false,

	handleBeforeInput: function(e) {
		if(e.isComposing || e.ctrlKey) return;
		if(e.inputType != 'insertText' || !e.data || e.data.length != 1) return;
		var root = editableRoot(e.target);
		if(root.isContentEditable) {
			var sel = window.getSelection();
			if(!sel || sel.rangeCount < 1) return;
			var range = sel.getRangeAt(0);
			var r = AVIMTransport.getTextNodeAndOffset(range.endContainer, range.endOffset);
			if(!r || !r.node || r.node.data.length < 1) return;
			AVIMTransport.pendingMap.set(root, {
				el: root, data: e.data, node: r.node,
				oldText: r.node.data, caretStart: r.offset, caretEnd: r.offset
			});
		} else if(root.tagName == 'TEXTAREA' || (root.tagName == 'INPUT' && inputTypes.indexOf(root.type) >= 0)) {
			if(root.readOnly || root.disabled || findIgnore(root)) return;
			AVIMTransport.pendingMap.set(root, {
				el: root, data: e.data, node: null,
				oldValue: root.value, caretStart: root.selectionStart,
				caretEnd: root.selectionEnd, scrollTop: root.scrollTop
			});
		}
	},

	handleInput: function(e) {
		if(AVIMTransport.isApplying || e.isComposing) return;
		var root = editableRoot(e.target);
		var snap = AVIMTransport.pendingMap.get(root);
		if(!snap) return;
		AVIMTransport.pendingMap.delete(root);
		var code = snap.data.charCodeAt(0);
		if(checkCode(code)) return;
		var editor;
		if(snap.node) {
			editor = {
				data: snap.oldText, pos: snap.caretStart, scrollTop: 0,
				setSelectionRange: function() {},
				deleteData: function(pos, len) {
					this.data = this.data.substr(0, pos) + this.data.substr(pos + len);
				},
				insertData: function(pos, str) {
					this.data = this.data.substr(0, pos) + str + this.data.substr(pos);
				}
			};
		} else {
			editor = {
				value: snap.oldValue, innerText: "",
				selectionStart: snap.caretStart, selectionEnd: snap.caretEnd,
				scrollTop: snap.scrollTop,
				setSelectionRange: function(start, end) {
					this.selectionStart = start;
					this.selectionEnd = end;
				}
			};
		}
		var savedRange = _range;
		_range = { setEnd: function() {} };
		AVIMObj.changed = false;
		AVIMObj.specialChange = false;
		try {
			start(editor, { which: code, ctrlKey: false, altKey: false });
		} catch(err) {
			_range = savedRange;
			return;
		}
		_range = savedRange;
		AVIMObj.specialChange = false;
		if(!AVIMObj.changed) {
			AVIMObj.changed = false;
			return;
		}
		AVIMObj.changed = false;
		if(snap.node) {
			snap.node.data = editor.data;
			var range = document.createRange();
			range.setStart(snap.node, editor.pos);
			range.setEnd(snap.node, editor.pos);
			var sel = window.getSelection();
			if(sel) {
				sel.removeAllRanges();
				sel.addRange(range);
			}
		} else {
			root.value = editor.value;
			root.setSelectionRange(editor.selectionStart, editor.selectionEnd);
			root.scrollTop = editor.scrollTop;
		}
		AVIMTransport.isApplying = true;
		try {
			root.dispatchEvent(new InputEvent('input', {
				bubbles: true, composed: true, inputType: 'insertText', data: snap.data
			}));
		} finally {
			AVIMTransport.isApplying = false;
		}
	},

	getTextNodeAndOffset: function(container, offset) {
		if(container.nodeType == 3) return { node: container, offset: offset };
		var left = container.childNodes[offset - 1];
		if(left) {
			if(left.nodeType == 3) return { node: left, offset: left.data.length };
			var last = lastTextNode(left);
			if(last) return { node: last, offset: last.data.length };
		}
		var first = firstTextNode(container);
		if(first) return { node: first, offset: 0 };
		return null;
	},

	attach: function(doc) {
		if(!doc || !('onbeforeinput' in doc)) return false;
		doc.addEventListener('beforeinput', AVIMTransport.handleBeforeInput, true);
		doc.addEventListener('input', AVIMTransport.handleInput, true);
		return true;
	},

	detach: function(doc) {
		if(!doc) return;
		doc.removeEventListener('beforeinput', AVIMTransport.handleBeforeInput, true);
		doc.removeEventListener('input', AVIMTransport.handleInput, true);
	}
};
