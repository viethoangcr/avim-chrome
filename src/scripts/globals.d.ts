declare var AVIMObj: any;
declare var method: number;
declare var onOff: number;
declare var checkSpell: number;
declare var oldAccent: number;
declare var exclude: string[];
declare class AVIM {
  changed: boolean;
  sk: string;
}
declare function start(editor: any, event: any): any;
declare function checkCode(code: number): boolean;
declare function upperCase(word: string): string;
declare function fromCharCode(code: number): string;
declare function ifMoz(e: any): void;
declare var AVIMTransport: any;
