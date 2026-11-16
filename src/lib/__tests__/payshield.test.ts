import test from "node:test";
import assert from "node:assert/strict";
import { analyzeInput } from "../payshieldEngine";

test("PayShield: detects fraudulent / phishing URLs", () => {
  const phishingUrls = [
    "https://phonepe-cashback[.]invalid/claim",
    "https://paytm-reward-center[.]invalid/winner",
    "https://irctc-ticket-refund[.]invalid/status",
    "https://uidai-aadhaar-update[.]invalid/verify",
    "https://rbi-account-alert[.]invalid/login",
    "https://electricity-bill-waiver[.]invalid/pay",
  ];

  for (const url of phishingUrls) {
    const result = analyzeInput(url, "url");
    assert.strictEqual(
      result.risk,
      "high",
      `Expected high risk for URL: ${url}, got ${result.risk} (score ${result.score})`
    );
    assert.ok(
      result.findings.length >= 2,
      `Expected multiple findings for ${url}, got ${result.findings.length}`
    );
  }
});

test("PayShield: detects suspicious & impersonation UPI handles", () => {
  const fraudulentUpis = [
    "sbi.helpdesk@invalid",
    "paytm.refund@invalid",
    "phonepe.support@invalid",
    "npci.claim@invalid",
    "amazon.reward@invalid",
    "customer.care@invalid",
    "govt.subsidy@invalid",
    "quickrefund2026@invalid",
  ];

  for (const upi of fraudulentUpis) {
    const result = analyzeInput(upi, "upi");
    assert.strictEqual(
      result.risk,
      "high",
      `Expected high risk for UPI: ${upi}, got ${result.risk} (score ${result.score})`
    );
    assert.ok(
      result.findings.some((f) => f.severity === "high"),
      `Expected high-severity finding for ${upi}`
    );
  }
});

test("PayShield: does not flag standard legitimate payment handles as high risk", () => {
  const legitimateUpis = [
    "john.doe@okhdfcbank",
    "shoppartner@ybl",
    "rahul92@oksbi",
  ];

  for (const upi of legitimateUpis) {
    const result = analyzeInput(upi, "upi");
    assert.notStrictEqual(
      result.risk,
      "high",
      `Legitimate UPI ${upi} should not be flagged high risk`
    );
  }
});

test("PayShield: detects well-planned sophisticated social engineering messages", () => {
  const sophisticatedScams = [
    {
      text: "CBI Investigation Notice: An illegal consignment under your name containing narcotics was intercepted at Mumbai Customs. A Digital Arrest order is issued. Remain on video call verification immediately for asset verification or face non-bailable warrant.",
      expectedFinding: "Digital Arrest",
    },
    {
      text: "India Post alert: Your parcel #IN8492041 cannot be delivered due to incomplete street address. Please update details and reschedule delivery within 12 hours at https://indiapost-parcel-tracking.com/reschedule",
      expectedFinding: "Courier",
    },
    {
      text: "OLX Buyer: I have transferred ₹12,000 for your furniture. Please scan this QR code and enter PIN to receive money into your bank account immediately.",
      expectedFinding: "UPI",
    },
    {
      text: "Electricity Board Notice: Dear consumer, your power supply will be disconnected tonight at 09:30 PM due to unpaid electricity bill. Contact nodal officer at 9821049210 or install electricity-support.apk.",
      expectedFinding: "App",
    },
    {
      text: "Global Media Ratings: Earn daily income of ₹2,500 to ₹5,000 working from home part-time. Just like YouTube videos and submit screenshots. Join our official Telegram job channel.",
      expectedFinding: "Part-time",
    },
  ];

  for (const item of sophisticatedScams) {
    const result = analyzeInput(item.text, "message");
    assert.strictEqual(
      result.risk,
      "high",
      `Expected high risk for message: "${item.text.slice(0, 50)}...", got ${result.risk} (score ${result.score})`
    );
    assert.ok(
      result.findings.some((f) => f.title.toLowerCase().includes(item.expectedFinding.toLowerCase())),
      `Expected finding matching '${item.expectedFinding}' in ${JSON.stringify(result.findings.map(f => f.title))}`
    );
  }
});

test("PayShield: detects phishing sites hosted on free cloud services and deceptive subdomains", () => {
  const cloudPhishingUrls = [
    "https://sbi-kyc-verification.pages.dev/login",
    "https://hdfc-reward-points.firebaseapp.com/claim",
    "https://paytm-refund-desk.web.app/status",
  ];

  for (const url of cloudPhishingUrls) {
    const result = analyzeInput(url, "url");
    assert.strictEqual(
      result.risk,
      "high",
      `Expected high risk for cloud phishing URL: ${url}, got ${result.risk} (score ${result.score})`
    );
    assert.ok(
      result.findings.some((f) => f.title.includes("free cloud hosting")),
      `Expected free cloud hosting finding for ${url}`
    );
  }
});

test("PayShield: detects deceptive nodal, dispute, and autopay UPI handles", () => {
  const trickyUpis = [
    "axis.nodal.officer@okhdfcbank",
    "fraud.dispute.reversal@paytm",
    "netflix.autopay.mandate@ybl",
  ];

  for (const upi of trickyUpis) {
    const result = analyzeInput(upi, "upi");
    assert.strictEqual(
      result.risk,
      "high",
      `Expected high risk for tricky UPI: ${upi}, got ${result.risk} (score ${result.score})`
    );
  }
});
