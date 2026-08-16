/*
 * Unit suite for the modern beforeinput/input transport (plan 20260810).
 *
 * Evals avim.js + transport.js into this file's scope, exactly like
 * avim.test.js:4, and drives AVIMTransport.handleBeforeInput/handleInput
 * directly with fake DOM/event objects — no browser, no extension wiring,
 * no build step.
 */

eval(require('fs').readFileSync('./src/scripts/avim.js','utf-8'));
eval(require('fs').readFileSync('./src/scripts/transport.js','utf-8'));

if (typeof InputEvent === 'undefined') {
	global.InputEvent = function(type, opts) {
		this.type = type;
		this.bubbles = !!(opts && opts.bubbles);
		this.composed = !!(opts && opts.composed);
		this.inputType = opts && opts.inputType;
		this.data = opts && opts.data;
	};
}

function setConfig(m, o, ck, oa) {
	method = m;
	onOff = o;
	checkSpell = ck;
	oldAccent = oa;
	AVIMObj = new AVIM();
}

function makeInputEl(initial) {
	return {
		nodeType: 1,
		tagName: 'INPUT',
		type: 'text',
		readOnly: false,
		disabled: false,
		isContentEditable: false,
		value: initial,
		selectionStart: 0,
		selectionEnd: 0,
		scrollTop: 0,
		events: [],
		setSelectionRange: function(s, e) {
			this.selectionStart = s;
			this.selectionEnd = e;
		},
		dispatchEvent: function(ev) {
			this.events.push(ev);
		}
	};
}

function insertChar(el, char) {
	var caret = el.selectionStart;
	el.value = el.value.substr(0, caret) + char + el.value.substr(el.selectionEnd);
	el.setSelectionRange(caret + char.length, caret + char.length);
}

function backspace(el) {
	AVIMTransport.handleBeforeInput({target: el, inputType: 'deleteContentBackward', data: null, isComposing: false, ctrlKey: false});
	var s = el.selectionStart;
	el.value = el.value.substr(0, s - 1) + el.value.substr(el.selectionEnd);
	el.setSelectionRange(s - 1, s - 1);
	AVIMTransport.handleInput({target: el, isComposing: false});
}

function typeCharInput(el, char) {
	AVIMTransport.handleBeforeInput({target: el, inputType: 'insertText', data: char, isComposing: false, ctrlKey: false, altKey: false});
	insertChar(el, char);
	AVIMTransport.handleInput({target: el, isComposing: false});
}

function expectNoSynthetic(el) {
	expect(el.events.length).toBe(0);
}

function makeCERoot() {
	return {
		nodeType: 1,
		isContentEditable: true,
		events: [],
		closest: function() {
			return this;
		},
		dispatchEvent: function(ev) {
			this.events.push(ev);
		}
	};
}

function makeTextNode(data) {
	return {nodeType: 3, data: data};
}

var selState, rangeRec;

function setCaret(node, offset) {
	selState.node = node;
	selState.offset = offset;
}

function typeCharCE(root, node, caret, char) {
	setCaret(node, caret);
	AVIMTransport.handleBeforeInput({target: root, inputType: 'insertText', data: char, isComposing: false, ctrlKey: false, altKey: false});
	node.data = node.data.substr(0, caret) + char + node.data.substr(caret);
	AVIMTransport.handleInput({target: root, isComposing: false});
	return node.data;
}

describe("IME transport (beforeinput/input):", function() {

	it("transforms d9i into đi on <input> with one synthetic input event (the bug)", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		typeCharInput(el, "d");
		typeCharInput(el, "9");
		typeCharInput(el, "i");
		expect(el.value).toBe("đi");
		expect(el.selectionStart).toBe(2);
		expect(el.events.length).toBe(1);
		expect(el.events[0].type).toBe("input");
		expect(el.events[0].inputType).toBe("insertText");
		expect(el.events[0].bubbles).toBe(true);
		expect(el.events[0].composed).toBe(true);
		expect(el.events[0].data).toBe("9");
	});

	it("backspace passes through and leaves no stale transport state", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		typeCharInput(el, "d");
		typeCharInput(el, "9");
		expect(el.value).toBe("đ");
		expect(el.events.length).toBe(1);
		backspace(el);
		expect(el.value).toBe("");
		expect(el.events.length).toBe(1);
		typeCharInput(el, "d");
		typeCharInput(el, "9");
		typeCharInput(el, "i");
		expect(el.value).toBe("đi");
		expect(el.events.length).toBe(2);
		expect(el.events[1].data).toBe("9");
	});

	it("transforms the word to the left of a mid-word caret", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("dia");
		el.setSelectionRange(2, 2);
		typeCharInput(el, "1");
		expect(el.value).toBe("día");
		expect(el.selectionStart).toBe(2);
		expect(el.events.length).toBe(1);
	});

	it("telex: trailing tone key after an accented word stays literal and removes the tone (tets regression)", function() {
		setConfig(1, 1, 1, 1);
		var el = makeInputEl("");
		"tests".split("").forEach(function(ch) {
			typeCharInput(el, ch);
		});
		expect(el.value).toBe("tets");
		expect(el.selectionStart).toBe(4);
		expect(el.events.length).toBe(3);
	});

	it("telex: tone-removal key lands at the caret, not the end, when text follows", function() {
		setConfig(1, 1, 1, 1);
		var el = makeInputEl("tétx");
		el.setSelectionRange(3, 3);
		typeCharInput(el, "s");
		expect(el.value).toBe("tetsx");
		expect(el.selectionStart).toBe(4);
	});

	it("passes through when the engine makes no change (no synthetic, no rewrite)", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		typeCharInput(el, "d");
		typeCharInput(el, "9");
		expect(el.value).toBe("đ");
		expect(el.events.length).toBe(1);
		typeCharInput(el, "i");
		expect(el.value).toBe("đi");
		expect(el.events.length).toBe(1);
	});

	it("respects onOff=0 (no transform, no synthetic)", function() {
		setConfig(2, 0, 1, 1);
		var el = makeInputEl("");
		typeCharInput(el, "d");
		typeCharInput(el, "9");
		expect(el.value).toBe("d9");
		expectNoSynthetic(el);
	});

	it("ignores IME composition events (isComposing)", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		AVIMTransport.handleBeforeInput({target: el, inputType: 'insertText', data: 'd', isComposing: true, ctrlKey: false});
		insertChar(el, "d");
		AVIMTransport.handleInput({target: el, isComposing: true});
		expect(el.value).toBe("d");
		expectNoSynthetic(el);
	});

	it("transforms from the pre-edit snapshot even if the DOM is clobbered mid-keystroke", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		typeCharInput(el, "d");
		expect(el.value).toBe("d");
		expectNoSynthetic(el);
		AVIMTransport.handleBeforeInput({target: el, inputType: 'insertText', data: '9', isComposing: false, ctrlKey: false});
		insertChar(el, "9");
		el.value = "d9"; // site rewrites the stale raw text between snapshot and rewrite
		el.setSelectionRange(2, 2);
		AVIMTransport.handleInput({target: el, isComposing: false});
		expect(el.value).toBe("đ");
		expect(el.events.length).toBe(1);
		typeCharInput(el, "i");
		expect(el.value).toBe("đi");
	});

	it("passes through multi-char and non-insertText beforeinput events", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		AVIMTransport.handleBeforeInput({target: el, inputType: 'insertText', data: 'ab', isComposing: false, ctrlKey: false});
		insertChar(el, "ab");
		AVIMTransport.handleInput({target: el, isComposing: false});
		expect(el.value).toBe("ab");
		expectNoSynthetic(el);
		AVIMTransport.handleBeforeInput({target: el, inputType: 'insertText', data: '😀', isComposing: false, ctrlKey: false});
		insertChar(el, "😀");
		AVIMTransport.handleInput({target: el, isComposing: false});
		expect(el.value).toBe("ab😀");
		expectNoSynthetic(el);
		AVIMTransport.handleBeforeInput({target: el, inputType: 'insertFromPaste', data: 'x', isComposing: false, ctrlKey: false});
		insertChar(el, "x");
		AVIMTransport.handleInput({target: el, isComposing: false});
		expect(el.value).toBe("ab😀x");
		expectNoSynthetic(el);
	});

	it("no-ops on an input event without a preceding snapshot", function() {
		setConfig(2, 1, 1, 1);
		var el = makeInputEl("");
		el.value = "past";
		AVIMTransport.handleInput({target: el, isComposing: false});
		expect(el.value).toBe("past");
		expectNoSynthetic(el);
	});

	describe("contenteditable (data branch):", function() {

		beforeEach(function() {
			selState = {node: null, offset: 0};
			rangeRec = {};
			global.window = {
				getSelection: function() {
					return {
						rangeCount: 1,
						getRangeAt: function() {
							return {endContainer: selState.node, endOffset: selState.offset};
						},
						removeAllRanges: function() {},
						addRange: function() {}
					};
				}
			};
			global.document = {
				createRange: function() {
					return {
						setStart: function(n, o) {
							rangeRec.node = n;
							rangeRec.offset = o;
						},
						setEnd: function() {}
					};
				}
			};
		});

		afterEach(function() {
			delete global.window;
			delete global.document;
		});

		it("transforms d9i in a contenteditable text node, dispatches one synthetic, restores the caret", function() {
			setConfig(2, 1, 1, 1);
			var root = makeCERoot();
			var node = makeTextNode("");
			typeCharCE(root, node, 0, "d");
			typeCharCE(root, node, 1, "9");
			expect(node.data).toBe("đ");
			expect(root.events.length).toBe(1);
			expect(rangeRec.node).toBe(node);
			expect(rangeRec.offset).toBe(1);
			typeCharCE(root, node, 1, "i");
			expect(node.data).toBe("đi");
			expect(root.events.length).toBe(1);
			var root2 = makeCERoot();
			var node2 = makeTextNode("dia");
			typeCharCE(root2, node2, 2, "1");
			expect(node2.data).toBe("día");
			expect(root2.events.length).toBe(1);
		});

		it("telex: tone-key removal mutation with literal key survives in contenteditable", function() {
			setConfig(1, 1, 1, 1);
			var root = makeCERoot();
			var node = makeTextNode("");
			typeCharCE(root, node, 0, "t");
			typeCharCE(root, node, 1, "e");
			typeCharCE(root, node, 2, "s");
			typeCharCE(root, node, 2, "t");
			typeCharCE(root, node, 3, "s");
			expect(node.data).toBe("tets");
			expect(rangeRec.node).toBe(node);
			expect(rangeRec.offset).toBe(4);
		});

		it("telex: mid-word tone-removal keeps trailing text in place in contenteditable", function() {
			setConfig(1, 1, 1, 1);
			var root = makeCERoot();
			var node = makeTextNode("tétx");
			typeCharCE(root, node, 3, "s");
			expect(node.data).toBe("tetsx");
			expect(rangeRec.offset).toBe(4);
		});
	});
});
