import puppeteer from "puppeteer";
import keycode from "keycode";
import ffi from "ffi-napi";
import ref from "ref-napi";
import os from "os";
import import_Struct from "ref-struct-di";
import robotjs from "robotjs";

var arch = os.arch();
const Struct = import_Struct(ref);

var Input = Struct({
  type: "int",

  // For some reason, the wScan value is only recognized as the wScan value when we add this filler slot.
  // It might be because it's expecting the values after this to be inside a "wrapper" substructure, as seen here:
  //     https://msdn.microsoft.com/en-us/library/windows/desktop/ms646270(v=vs.85).aspx
  "???": "int",

  wVK: "short",
  wScan: "short",
  dwFlags: "int",
  time: "int",
  dwExtraInfo: "int64",
});

var user32 = ffi.Library("user32", {
  SendInput: ["int", ["int", Input, "int"]],
  MapVirtualKeyExA: ["uint", ["uint", "uint", "int"]],
});

const extendedKeyPrefix = 0xe000;
const INPUT_KEYBOARD = 1;
const KEYEVENTF_EXTENDEDKEY = 0x0001;
const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_SCANCODE = 0x0008;

export class KeyToggle_Options {
  asScanCode = true;
  keyCodeIsScanCode = false;
  flags = null;
  async = false; // async can reduce stutter in your app, if frequently sending key-events
}

let entry = new Input(); // having one persistent native object, and just changing its fields, is apparently faster (from testing)
entry.type = INPUT_KEYBOARD;
entry.time = 0;
entry.dwExtraInfo = 0;

(async () => {
  // Launch the browser and open a new blank page
  const browser = await puppeteer.launch({
    headless: false,
  });
  const page = await browser.newPage();

  await page.goto("https://humanbenchmark.com/tests/typing/");

  await page.setViewport({ width: 1080, height: 1024 });

  await page.waitForSelector("div[class='letters notranslate']");

  const letters = await page.$$("span.incomplete");

  let text = "";

  for (let i = 0; i < letters.length; i++) {
    text += await page.evaluate((el) => el.textContent, letters[i]);
  }

  await page.click(".letters");

  robotjs.moveMouse(270, 530);
  robotjs.mouseClick("left");

  await Delay(1000);

  const keyCodes = text.split("").map((letter) => keycode(letter));

  for (let i = 0; i < keyCodes.length; i++) {
    KeyTap(keyCodes[i]);
  }
})();

async function Delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function KeyToggle(keyCode, type = "down", options) {
  const opt = Object.assign({}, new KeyToggle_Options(), options);

  // scan-code approach (default)
  if (opt.asScanCode) {
    let scanCode = opt.keyCodeIsScanCode
      ? keyCode
      : ConvertKeyCodeToScanCode(keyCode);
    let isExtendedKey = (scanCode & extendedKeyPrefix) == extendedKeyPrefix;

    entry.dwFlags = KEYEVENTF_SCANCODE;
    if (isExtendedKey) {
      entry.dwFlags |= KEYEVENTF_EXTENDEDKEY;
    }

    entry.wVK = 0;
    entry.wScan = isExtendedKey ? scanCode - extendedKeyPrefix : scanCode;
  }
  // (virtual) key-code approach
  else {
    entry.dwFlags = 0;
    entry.wVK = keyCode;
    //info.wScan = 0x0200;
    entry.wScan = 0;
  }

  if (opt.flags != null) {
    entry.dwFlags = opt.flags;
  }
  if (type == "up") {
    entry.dwFlags |= KEYEVENTF_KEYUP;
  }

  if (opt.async) {
    return new Promise((resolve, reject) => {
      user32.SendInput.async(
        1,
        entry,
        arch === "x64" ? 40 : 28,
        (error, result) => {
          if (error) reject(error);
          resolve(result);
        }
      );
    });
  }
  return user32.SendInput(1, entry, arch === "x64" ? 40 : 28);
}

export function KeyTap(keyCode, opt) {
  KeyToggle(keyCode, "down", opt);
  KeyToggle(keyCode, "up", opt);
}

export function ConvertKeyCodeToScanCode(keyCode) {
  //return user32.MapVirtualKeyExA(keyCode, MAPVK_VK_TO_VSC, 0);
  return user32.MapVirtualKeyExA(keyCode, 0, 0);
}
