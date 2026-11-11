import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256Hex } from "./hash.ts";
import { alignmentPositions, byteCapacity, encodeQr, qrBytes, qrPath } from "./qr.ts";
import type { QrCode } from "./qr.ts";

// Reference codes made with segno 1.6.6 (Python), version, level and mask fixed, byte mode. segno adds a needless
// 0x00 byte when the data already ends on a byte boundary (it pads with 8 - n % 8 bits); the references were made
// with that one line corrected to the standard ((8 - n % 8) % 8). All 40 versions also read back with zxing-cpp.

const rows = (code: QrCode) => code.modules.map((row) => row.map((dark) => (dark ? "1" : "0")).join(""));

// "https://example.org/#/g/42", version 3, level M, mask 5
// prettier-ignore
const SMALL = [
  "11111110011010011110001111111",
  "10000010101011101100101000001",
  "10111010100101010001101011101",
  "10111010101100001111101011101",
  "10111010011000011111001011101",
  "10000010011100010100101000001",
  "11111110101010101010101111111",
  "00000000100100111001000000000",
  "10000010110000001110011001110",
  "00100100000101001001110110110",
  "11010110011011111000110110000",
  "00100101001001000011100101000",
  "11011011011011011010101100001",
  "00010101101110001001001110011",
  "10001010111100000110101111100",
  "00001001100100010011001010101",
  "00101011000110001010000001100",
  "10111100111101100111101110111",
  "11001111101010010001101111001",
  "10011100001001000111010000000",
  "10001011111000110000111110111",
  "00000000110100100011100011000",
  "11111110010110000011101011100",
  "10000010011010111001100010001",
  "10111010011011100111111111010",
  "10111010000111100101100101110",
  "10111010000110011101111111110",
  "10000010011000001110010111101",
  "11111110101011010001011110100",
];

// SHA-256 of the rows ("0" light, "1" dark, joined with newlines) of version 1 to 40, with the level L M Q H by
// version % 4, mask version % 8 and a text of the capacity minus version % 3 bytes (so some end with padding).
// prettier-ignore
const VERSIONS = [
  "ec1aafb46af87a0b51d6c4f1b2477f23dcb0b015b51e4613ca46692a7da08dbf", // 1
  "3897fc71625398690a84ad1314c086aa3a431f4413fefd6646a4e77e33597de7", // 2
  "c0623c480335a8dc4b00b2aa99f6759534ea5fc77873b6ced72c83dc7dd3b8e5", // 3
  "92caa56e86307c7dd84bc45835d257acbde158b3662e287d4e88b4219c482992", // 4
  "08900ab0b907fb9347bf522ab76e401fd44eabc9d616ae50b0dd9e1dce18183d", // 5
  "b6cbdab97273f96af9df944a2211d1b29e6da50abb067a8fbf7f5acd46cb55ff", // 6
  "446311b7979e8f16b2c7785d95a8e0df2dfd077b9816f7b529bfa26f507dbec9", // 7
  "06fb19370dfa74704e1be6f244ae555515694d16993172a2b6df44abbec86669", // 8
  "aeb41a273d32b256f9173727919fe5a84fb0088bbb300cbe386118b76065be52", // 9
  "e62d754c0b05a8561294b1ae694dd0cf7e593e2d10619f154e55503d3faf735f", // 10
  "780785f1fd05008044209f363241b371220b03ede6f1cfeea57e4c4ddbdca6b0", // 11
  "6de9ec6c77f5238b1366081d41461e9ad05e7c918af3bdeaba2883cf4757cd8d", // 12
  "15827424f6627e10a4683d155b64a97616734cbfd352d66e7d19a3915e18f254", // 13
  "571ac5ca9f608e3f5ae478a68bdbd1ca4f70b75d276e8f7d6427e8b350e9bcb4", // 14
  "277daa647903e80d5fc5200efe5d40fb073b843efcecf539c1050df50d865171", // 15
  "5e7fc4a11c476ad1abbf9945af04d36c6fe7c5c258013e823d358939b902b9cf", // 16
  "cd63c02598517baf842df9c898b86047d54b4e858cddb3d0ffc74ccd18d1adbf", // 17
  "f0f0a01d538f3a6031a9d46e3a7b56b27b2e57dd1934ad35275dbeba0b60b53d", // 18
  "ec77ad340429abb4134eb53e1f0910a88e61047d664a148657fe5acbbe4183e6", // 19
  "11639b9867098f943c275a276e5d38ad77cf7abc542b5279c61f81c04a09a6fc", // 20
  "e971376586b6dc21bcae4211ddefd29a4c06507901c4a3a26cf3261ebbdb2218", // 21
  "2216ab033f4f1f53ac020f4ef631f1cdfb47b14014ff973dd4f456fa5bdd4915", // 22
  "28a1dc97423a5d4a6a92276a51e1b92067d767e85e4e78a2f07f3382c361aa47", // 23
  "557fe46b9f2288366fbccbf5ec3de8a78828dbd62783d7bfa6cf86b0b3935fd3", // 24
  "cd36002d628d000a99a97d2b8d49a70fcb7450bc3e73b7fb86b6b353ef5eda3f", // 25
  "eba73225c912e93af5e57bc0d5a32eb5ab49d8423f50caec6904cade6fb2fd9b", // 26
  "8808ca5bb606c812e674fe62125d0aa9745112de591a364d8795e3a42eabe29d", // 27
  "6a5ace126bb133725c57267e993ad0571722f5c81c0c571d48fbc5c25b74b583", // 28
  "c339f00aeba41f343732eddd0f29c42c5a3d1f5439be976fc5e0b6977d4206bc", // 29
  "93eb89b231381ab1fc75d4513e614248ec20055a87f10d6f706b6385b80aced7", // 30
  "2ce5a6f385cbe5dc0add5d87e731b57dbf397cd67d6a071dd0854e3e0b974cd4", // 31
  "815f9135273a43adb018b68ac36f0cb7a951eaa65d374741c6910a14a149d8f0", // 32
  "df357e3924f30cefda2197e558af582ff6a6c8156e29ec86d903efa4362116c7", // 33
  "98b1047c437e1b0fb449999081cc0fd883c9821431bbcbe97eacc6617a5cc5cf", // 34
  "2863bde41b8127a9cbc51a86d9c076806a3d2ed1637beeabc3cd6ed88569921c", // 35
  "b76921ea5a114d664792a8bdc670163c151e7064e4379369bbee2340742a3813", // 36
  "9e33d70d2d878c41efc1d18699505ff6101f28159ab1f56a420a4b986448c640", // 37
  "a9e881a373740ad186d74cb92696c57b481761be7bc522615d8ffcf5e382f809", // 38
  "b7e81e0cd67c39c778d17741ca83e91ca87621758db7afed57b07aa16acf3609", // 39
  "5500a226876e6e58ab493cf265abcf9fc3719086054c31f4915f51abc460d5e0", // 40
];

const LEVELS = ["L", "M", "Q", "H"] as const;
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_./#:";
const text = (n: number) => Array.from({ length: n }, (_, i) => ALPHABET[(i * 31 + 7) % ALPHABET.length]).join("");

test("a small code matches the reference module by module", () => {
  const code = encodeQr(qrBytes("https://example.org/#/g/42"), { minLevel: "M", boostLevel: false, minVersion: 3, mask: 5 })!;
  assert.equal(code.size, 29);
  assert.deepEqual(rows(code), SMALL);
});

test("all 40 versions, four levels and eight masks match the references", () => {
  for (let v = 1; v <= 40; v++) {
    const level = LEVELS[v % 4]!;
    const code = encodeQr(qrBytes(text(byteCapacity(v, level) - (v % 3))), { minLevel: level, boostLevel: false, mask: v % 8 })!;
    assert.equal(code.version, v, `version ${v}`);
    assert.equal(code.size, 17 + 4 * v);
    assert.equal(sha256Hex(rows(code).join("\n")), VERSIONS[v - 1], `version ${v}`);
  }
});

test("byte capacities of the standard (table 7)", () => {
  assert.deepEqual(LEVELS.map((l) => byteCapacity(1, l)), [17, 14, 11, 7]);
  assert.deepEqual(LEVELS.map((l) => byteCapacity(10, l)), [271, 213, 151, 119]);
  assert.deepEqual(LEVELS.map((l) => byteCapacity(27, l)), [1465, 1125, 805, 625]);
  assert.deepEqual(LEVELS.map((l) => byteCapacity(40, l)), [2953, 2331, 1663, 1273]);
});

test("alignment pattern centers", () => {
  assert.deepEqual(alignmentPositions(1), []);
  assert.deepEqual(alignmentPositions(2), [6, 18]);
  assert.deepEqual(alignmentPositions(7), [6, 22, 38]);
  assert.deepEqual(alignmentPositions(32), [6, 34, 60, 86, 112, 138]);
  assert.deepEqual(alignmentPositions(40), [6, 30, 58, 86, 114, 142, 170]);
});

test("the smallest version is chosen, then the level raised while it still fits", () => {
  const code = encodeQr(qrBytes("https://example.org/#/g/42"))!; // 26 bytes
  assert.equal(code.version, 2); // M holds 26 in version 2
  assert.equal(code.level, "M");
  const short = encodeQr(qrBytes("hi"))!;
  assert.equal(short.version, 1);
  assert.equal(short.level, "H");
  assert.equal(encodeQr(qrBytes("hi"), { boostLevel: false })!.level, "M");
  assert.equal(encodeQr(qrBytes("x".repeat(2953)), { minLevel: "L" })!.version, 40);
  assert.equal(encodeQr(qrBytes("x".repeat(2954)), { minLevel: "L" }), null);
  assert.equal(encodeQr(qrBytes("x".repeat(2332))), null);
});

test("the automatic mask is one of the eight and deterministic", () => {
  const a = encodeQr(qrBytes("https://example.org/#/p/1.abcdef"))!;
  const b = encodeQr(qrBytes("https://example.org/#/p/1.abcdef"))!;
  assert.ok(a.mask >= 0 && a.mask <= 7);
  assert.deepEqual(a, b);
  const fixed = encodeQr(qrBytes("https://example.org/#/p/1.abcdef"), { mask: a.mask })!;
  assert.deepEqual(fixed.modules, a.modules);
  assert.throws(() => encodeQr(qrBytes("x"), { mask: 8 }), RangeError);
});

test("the SVG path draws each horizontal run of dark modules once", () => {
  const code: QrCode = { version: 1, level: "L", mask: 0, size: 3, modules: [[true, true, false], [false, false, false], [false, true, true]] };
  assert.equal(qrPath(code), "M0 0h2v1h-2zM1 2h2v1h-2z");
});
