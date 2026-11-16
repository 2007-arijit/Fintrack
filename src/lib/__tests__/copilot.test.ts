import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSmartCopilotResponse } from "../copilotEngine";

test("Copilot: answers greetings and introduces capabilities", () => {
  const res = generateSmartCopilotResponse("hello");
  assert.ok(res.reply.toLowerCase().includes("payshield ai copilot"));
  assert.ok(Array.isArray(res.tips));
});

test("Copilot: explains FinTrack platform and creator attribution", () => {
  const res = generateSmartCopilotResponse("what is fintrack and who created it?");
  assert.ok(res.reply.includes("Arijit Koyal"));
  assert.ok(res.reply.includes("Personal Ledger"));
  assert.ok(res.reply.includes("PayShield"));
});

test("Copilot: answers generic personal finance and budgeting questions", () => {
  const res = generateSmartCopilotResponse("how to save money using the 50/30/20 rule?");
  assert.ok(res.reply.includes("50/30/20"));
  assert.ok(res.reply.includes("Needs"));
  assert.ok(res.reply.includes("Emergency Runway"));
});

test("Copilot: detects and explains Digital Arrest scam", () => {
  const res = generateSmartCopilotResponse("I got a Skype call from CBI saying I am under digital arrest for a FedEx parcel with drugs");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("DIGITAL ARREST"));
  assert.ok(res.reply.includes("Skype"));
  assert.equal(res.helpline, "1930");
  assert.ok(res.tips && res.tips.length > 0);
});

test("Copilot: detects Inverted UPI PIN collect fraud", () => {
  const res = generateSmartCopilotResponse("Someone on OLX says scan QR code and enter UPI PIN to receive money");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("ALWAYS DEDUCTS"));
  assert.ok(res.reply.includes("NEVER need to enter your UPI PIN"));
  assert.equal(res.helpline, "1930");
});

test("Copilot: detects 9:30 PM electricity power cut threat", () => {
  const res = generateSmartCopilotResponse("Urgent notice electricity will be disconnected tonight at 9:30 PM because bill is unpaid");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("ELECTRICITY CUTOFF"));
  assert.equal(res.helpline, "1930");
});

test("Copilot: detects India Post parcel delivery smishing", () => {
  const res = generateSmartCopilotResponse("India Post: Your package could not be delivered due to wrong address. Update at link within 12h");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("INDIA POST"));
  assert.ok(res.tips?.some((tip) => tip.includes("indiapost.gov.in")));
});

test("Copilot: responds to Hinglish / vernacular queries intelligently", () => {
  const resUpi = generateSmartCopilotResponse("kya upi pin daalne se paise aate hain ya kat te hain?");
  assert.equal(resUpi.risk, "high");
  assert.ok(resUpi.reply.includes("debit hote hain"));

  const resBijli = generateSmartCopilotResponse("bhai bijli cut hone ka message aaya hai kya karu?");
  assert.equal(resBijli.risk, "high");
  assert.ok(resBijli.reply.includes("Fake Scam"));

  const resRecovery = generateSmartCopilotResponse("mere bank se fraud me paise kat gaye kaise wapas laye?");
  assert.equal(resRecovery.risk, "high");
  assert.ok(resRecovery.reply.includes("1930"));
});

test("Copilot: parses standalone fraudulent URLs pasted in chat", () => {
  const res = generateSmartCopilotResponse("check this link: https://phonepe-cashback[.]invalid/claim");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("Forensic Target Analysis"));
  assert.ok(res.reply.includes("DANGEROUS TARGET"));
});

test("Copilot: parses standalone fraudulent UPI handles pasted in chat", () => {
  const res = generateSmartCopilotResponse("sbi.helpdesk@invalid");
  assert.equal(res.risk, "high");
  assert.ok(res.reply.includes("Forensic Target Analysis"));
});
