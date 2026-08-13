//"use strict";

// TODO Should remove eval() and turn on strict mode
eval(require('fs').readFileSync('./src/scripts/avim.js','utf-8'));

describe("Demo", function() {
	it("with fromCharCode", function() {
		expect(fromCharCode(272)).toBe("Đ");
	});
});

describe("Basic function:", function() {
	
	it("Uppercase", function() {
		var testcase = [
			["abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
			["1234567890", "1234567890"],
			["`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./", "`~!@#$%^&*()_+[]\\;'\"{}|:<>?,./"],
			["a,â,ă,e,ê,i,o,ô,ơ,u,ư,y", "A,Â,Ă,E,Ê,I,O,Ô,Ơ,U,Ư,Y"],
			["á,à,ả,ã,ạ,ắ,ằ,ẳ,ẵ,ặ,ă,ấ,ầ,ẩ,ẫ,ậ,â,é,è,ẻ,ẽ,ẹ,ế,ề,ể,ễ,ệ,ê,í,ì,ỉ,ĩ,ị,ó,ò,ỏ,õ,ọ,ố,ồ,ổ,ỗ,ộ,ô,ớ,ờ,ở,ỡ,ợ,ơ,ú,ù,ủ,ũ,ụ,ứ,ừ,ử,ữ,ự,ư,ý,ỳ,ỷ,ỹ,ỵ", "Á,À,Ả,Ã,Ạ,Ắ,Ằ,Ẳ,Ẵ,Ặ,Ă,Ấ,Ầ,Ẩ,Ẫ,Ậ,Â,É,È,Ẻ,Ẽ,Ẹ,Ế,Ề,Ể,Ễ,Ệ,Ê,Í,Ì,Ỉ,Ĩ,Ị,Ó,Ò,Ỏ,Õ,Ọ,Ố,Ồ,Ổ,Ỗ,Ộ,Ô,Ớ,Ờ,Ở,Ỡ,Ợ,Ơ,Ú,Ù,Ủ,Ũ,Ụ,Ứ,Ừ,Ử,Ữ,Ự,Ư,Ý,Ỳ,Ỷ,Ỹ,Ỵ"],
			["Thương em thương tự thuở nào...", "THƯƠNG EM THƯƠNG TỰ THUỞ NÀO..."],
			["Nhớ em, nhớ cả dạt dào đêm nay", "NHỚ EM, NHỚ CẢ DẠT DÀO ĐÊM NAY"]
		];
		
		for (var i = 0; i < testcase.length; i++) {
			var test = testcase[i];
			var result = upperCase(test[0]);
			expect(result).toBe(test[1]);
		}
	});
	
});

/*
 * Characterization harness for the unmodified AVIM engine.
 *
 * The engine is driven through its real entry point `start(editor, event)`,
 * exactly like the content-script keypress handler. The editor and event
 * doubles mirror only the properties the engine actually touches:
 *   - editor: value, innerText ("" on real <input>/<textarea> elements,
 *     never undefined), selectionStart, selectionEnd, scrollTop,
 *     setSelectionRange()
 *   - event: which, ctrlKey, altKey
 * The browser's default insertion is simulated: the typed character is
 * inserted only when the engine did NOT modify the editor (i.e. when the
 * extension would not have called preventDefault). The engine itself inserts
 * the key in normC() paths, so the harness never pre-inserts a key.
 * Expected texts are captured from the unmodified engine.
 */

function makeEditor(value, caret) {
	return {
		value: value,
		innerText: "",
		selectionStart: caret,
		selectionEnd: caret,
		scrollTop: 0,
		setSelectionRange: function(start, end) {
			this.selectionStart = start;
			this.selectionEnd = end;
		}
	};
}

function insertChar(editor, char) {
	var caret = editor.selectionStart;
	editor.value = editor.value.substr(0, caret) + char + editor.value.substr(editor.selectionEnd);
	editor.setSelectionRange(caret + char.length, caret + char.length);
}

function setConfig(m, o, ck, oa) {
	method = m;
	onOff = o;
	checkSpell = ck;
	oldAccent = oa;
	AVIMObj = new AVIM();
}

function typeChar(editor, char) {
	var code = char.charCodeAt(0);
	if (checkCode(code)) { // onOff=0 or non-printable: engine is never invoked
		insertChar(editor, char);
		return;
	}
	start(editor, {which: code, ctrlKey: false, altKey: false});
	if (AVIMObj.changed) {
		AVIMObj.changed = false; // engine updated the editor itself
	} else {
		insertChar(editor, char); // browser default insertion
	}
}

function typeSequence(m, seq) {
	setConfig(m, 1, 1, 1);
	var editor = makeEditor("", 0);
	for (var i = 0; i < seq.length; i++) {
		typeChar(editor, seq.charAt(i));
	}
	return editor.value;
}

function typeSequenceConfig(m, oa, ck, seq) {
	setConfig(m, 1, ck, oa);
	var editor = makeEditor("", 0);
	for (var i = 0; i < seq.length; i++) {
		typeChar(editor, seq.charAt(i));
	}
	return editor.value;
}

function caretAfter(m, seq) {
	setConfig(m, 1, 1, 1);
	var editor = makeEditor("", 0);
	for (var i = 0; i < seq.length; i++) {
		typeChar(editor, seq.charAt(i));
	}
	return editor.selectionStart;
}

describe("IME engine characterization:", function() {

	describe("Telex (method 1)", function() {
		var cases = [
			["a", "a"], // single char, no transform
			["w", "w"], // transform key with no word: inert
			["aa", "â"],
			["aw", "ă"],
			["as", "á"],
			["af", "à"],
			["ar", "ả"],
			["ax", "ã"],
			["aj", "ạ"],
			["aws", "ắ"],
			["awf", "ằ"],
			["awr", "ẳ"],
			["awx", "ẵ"],
			["awj", "ặ"],
			["dd", "đ"],
			["oo", "ô"],
			["ee", "ê"],
			["uw", "ư"],
			["uow", "uơ"], // transform applies to the last vowel only
			["uwo", "ưo"],
			["oi", "oi"],
			["ois", "ói"],
			["toi", "toi"],
			["tois", "tói"],
			["anh", "anh"], // spell check: no accent on "anh"
			["xinh", "xinh"],
			["quan", "quan"],
			["quans", "quán"],
			["viet", "viet"],
			["viets", "viét"],
			["thuong", "thuong"],
			["thuongs", "thuóng"],
			["nghiep", "nghiep"],
			["nghieps", "nghiép"],
			["uong", "uong"],
			["uongs", "uóng"],
			["a1", "a1"], // VNI digits are inert in Telex
			["a6", "a6"]
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(1, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("VNI (method 2)", function() {
		var cases = [
			["a", "a"], // single char, no transform
			["a1", "á"],
			["a2", "à"],
			["a3", "ả"],
			["a4", "ã"],
			["a5", "ạ"],
			["a6", "â"],
			["a7", "a7"], // moc marker is inert on "a"
			["a8", "ă"],
			["d9", "đ"],
			["o7", "ơ"],
			["u7", "ư"],
			["uo7", "uơ"], // transform applies to the last vowel only
			["u7o", "ưo"],
			["o7i", "ơi"],
			["oi1", "ói"],
			["viet1", "viét"],
			["anh", "anh"], // spell check: no accent on "anh"
			["toi1", "tói"],
			["quan1", "quán"],
			["thuong1", "thuóng"],
			["uong1", "uóng"],
			["ee", "ee"], // Telex letters are inert in VNI
			["oo", "oo"],
			["as", "as"]
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(2, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("Off (onOff 0)", function() {
		var cases = [
			[1, "aw"],
			[1, "as"],
			[1, "dd"],
			[1, "hello"],
			[2, "a1"],
			[2, "d9"]
		];

		cases.forEach(function(testcase) {
			it('leaves "' + testcase[1] + '" unchanged in method ' + testcase[0], function() {
				setConfig(testcase[0], 0, 1, 1);
				var editor = makeEditor("", 0);
				for (var i = 0; i < testcase[1].length; i++) {
					typeChar(editor, testcase[1].charAt(i));
				}
				expect(editor.value).toBe(testcase[1]);
			});
		});
	});

	describe("caret", function() {
		it("stays at the end of the transformed word", function() {
			expect(caretAfter(1, "aws")).toBe(1);
			expect(caretAfter(1, "viets")).toBe(4);
			expect(caretAfter(2, "viet1")).toBe(4);
		});
	});

	describe("AUTO (method 0)", function() {
		var cases = [
			["aas", "ấ"],
			["aaw", "ă"],
			["dd", "đ"],
			["o7s", "ớ"],
			["a1", "á"],
			["tois", "tói"],
			["viet1", "viét"],
			["uow", "uơ"],
			["uwo", "ưo"],
			["anhs", "ánh"],
			["xinh", "xinh"],
			["aas1", "â1"],
			["aasw", "ắ"],
			["d91", "đ1"],
			["uong1", "uóng"],
			["aa1", "ấ"],
			["toansz", "toan"],
			["TOANS", "TOÁN"],
			["zas", "zas"],
			["q", "q"],
			["aa", "â"], // telex hat
			["a6", "â"], // vni hat
			["a^", "a^"], // viqr hat is inert in AUTO
			["ow", "ơ"], // telex hook
			["uw", "ư"],
			["o7", "ơ"], // vni hook
			["u7", "ư"],
			["o+", "o+"], // viqr hook is inert in AUTO
			["u+", "u+"],
			["o*", "o*"], // viqr* hook is inert in AUTO
			["u*", "u*"],
			["d9", "đ"],
			["dD", "đ"],
			["as", "á"], // telex tones
			["af", "à"],
			["ar", "ả"],
			["ax", "ã"],
			["aj", "ạ"],
			["a2", "à"], // vni tones
			["a3", "ả"],
			["a4", "ã"],
			["a5", "ạ"],
			["asz", "a"], // tone removal (telex z, vni 0)
			["a10", "a"],
			["a'-", "a'-"], // viqr tone/removal keys are inert in AUTO
			["toan'.", "toan'."],
			["\\'", "\\'"],
			["\\.", "\\."],
			["toanx", "toãn"] // normalize path
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(0, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("VIQR (method 3)", function() {
		var cases = [
			["a^", "â"],
			["a'", "á"],
			["a.", "ạ"],
			["dD", "đ"],
			["u+", "ư"],
			["aw", "aw"],
			["as", "as"],
			["as'", "as'"],
			["a'-", "a"], // tone removal
			["\\'", "'"], // backslash escape
			["q", "q"],
			["o+", "ơ"],
			["a`", "à"], // all 5 tone keys
			["a?", "ả"],
			["a~", "ã"],
			["o+'", "ớ"], // composed ơ + tone
			["o+`", "ờ"],
			["o+.", "ợ"],
			["o+?", "ở"],
			["o+~", "ỡ"],
			["u+.", "ự"],
			["o+-", "o"], // removal from a composed word
			["toan`-", "toan"],
			["toan?-", "toan"],
			["toan'", "toán"], // normalize path
			["toan'.", "toạn"],
			["toan'x", "toánx"],
			["TOAN'", "TOÁN"] // uppercase word
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(3, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("VIQR* (method 4)", function() {
		var cases = [
			["o*", "ơ"],
			["aa", "aa"],
			["dD", "đ"],
			["a*", "a*"],
			["a*-", "a*-"],
			["q", "q"],
			["u*", "ư"],
			["a'", "á"], // all 5 tone keys
			["a`", "à"],
			["a.", "ạ"],
			["a?", "ả"],
			["a~", "ã"],
			["o*'", "ớ"], // composed ơ + tone
			["o*`", "ờ"],
			["o*.", "ợ"],
			["o*?", "ở"],
			["o*~", "ỡ"],
			["toan*", "toan*"],
			["toan'.", "toạn"], // normalize path
			["toan'x", "toánx"],
			["TOAN'", "TOÁN"], // uppercase word
			["\\'", "'"] // backslash escape
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(4, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("Telex tone removal (Z key)", function() {
		var cases = [
			["asz", "a"],
			["zas", "zas"],
			["toansz", "toan"]
		];

		cases.forEach(function(testcase) {
			it('types "' + testcase[0] + '" as "' + testcase[1] + '"', function() {
				expect(typeSequence(1, testcase[0])).toBe(testcase[1]);
			});
		});
	});

	describe("oldAccent 0 vs 1", function() {
		var pairs = [
			[1, "thuys", "thuý", "thúy"],
			[1, "hoas", "hoá", "hóa"],
			[1, "khoes", "khoé", "khóe"],
			[2, "thuy1", "thuý", "thúy"],
			[2, "hoa1", "hoá", "hóa"],
			[2, "khoe1", "khoé", "khóe"]
		];

		pairs.forEach(function(testcase) {
			it('method ' + testcase[0] + ' types "' + testcase[1] + '" as "' + testcase[2] + '" (oldAccent 0) vs "' + testcase[3] + '" (oldAccent 1)', function() {
				expect(typeSequenceConfig(testcase[0], 0, 1, testcase[1])).toBe(testcase[2]);
				expect(typeSequenceConfig(testcase[0], 1, 1, testcase[1])).toBe(testcase[3]);
			});
		});
	});

	describe("checkSpell 0 vs 1", function() {
		it('non-word "azs" gets the tone with checkSpell 0, stays literal with checkSpell 1', function() {
			expect(typeSequenceConfig(1, 1, 0, "azs")).toBe("áz");
			expect(typeSequenceConfig(1, 1, 1, "azs")).toBe("azs");
		});

		it('"hòang" + "t" with checkSpell 0 normalizes to "hoàngt"', function() {
			setConfig(1, 1, 0, 1);
			var editor = makeEditor("hòang", 5);
			typeChar(editor, "t");
			expect(editor.value).toBe("hoàngt");
		});

		it('"hòang" + "t" with checkSpell 1 stays "hòangt"', function() {
			setConfig(1, 1, 1, 1);
			var editor = makeEditor("hòang", 5);
			typeChar(editor, "t");
			expect(editor.value).toBe("hòangt");
		});
	});

});

describe("spell check off (normalize path)", function() {

	it('"hòang" + "t" with checkSpell 0 normalizes to "hoàngt"', function() {
		setConfig(1, 1, 0, 1);
		var editor = makeEditor("hòang", 5);
		typeChar(editor, "t");
		expect(editor.value).toBe("hoàngt");
	});

	it('"hòang" + "t" with checkSpell 1 stays "hòangt"', function() {
		setConfig(1, 1, 1, 1);
		var editor = makeEditor("hòang", 5);
		typeChar(editor, "t");
		expect(editor.value).toBe("hòangt");
	});

	it('"azs" with checkSpell 0 gets the tone "áz"', function() {
		setConfig(1, 1, 0, 1);
		var editor = makeEditor("", 0);
		typeChar(editor, "a");
		typeChar(editor, "z");
		typeChar(editor, "s");
		expect(editor.value).toBe("áz");
	});

});

describe("constant tables (white-box pins)", function() {

	it("getSF() returns one shared array (hoisted constant)", function() {
		expect(getSF()).toBe(getSF());
	});

	it("repSign(null) returns a 120-element fresh array per call", function() {
		setConfig(1, 1, 1, 1);
		typeChar(makeEditor("a", 1), "s");
		expect(repSign(null).length).toBe(120);
		var a = repSign(null);
		a.push(1);
		expect(repSign(null).length).toBe(120);
	});

});
