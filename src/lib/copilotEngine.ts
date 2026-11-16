import { analyzeInput, detectInputKind, type Finding } from "./payshieldEngine";

export interface CopilotResponse {
  reply: string;
  vector?: string;
  risk?: "low" | "medium" | "high";
  tips?: string[];
  helpline?: string;
}

/**
 * Intelligent client-side conversational and forensic response engine.
 * Handles casual conversation, personal finance guidance, Hinglish queries,
 * and deep cybercrime threat analysis.
 */
export function generateSmartCopilotResponse(
  query: string,
  lastScanFinding?: { preview: string; risk: "low" | "medium" | "high"; score: number; vector?: string }
): CopilotResponse {
  const text = query.trim();
  const lower = text.toLowerCase();

  // 1. Direct consultation on previous scan result
  if (lastScanFinding && (lower.includes("scan result") || lower.includes("break down") || lower.includes("this threat"))) {
    return {
      reply: `Forensic consultation on: "${lastScanFinding.preview}"\n\nThreat Assessment: ${lastScanFinding.risk.toUpperCase()} (${lastScanFinding.score}/10).\nAttack Archetype: ${lastScanFinding.vector || "Suspicious target"}.\n\nThis target exhibits deception indicators. Do not authorize payments, submit credentials, or click associated links. Verify directly through the official banking or institutional portal.`,
      vector: lastScanFinding.vector || "Analyzed Scan Target",
      risk: lastScanFinding.risk,
      tips: [
        "Do not click the link or approve any UPI transaction.",
        "Report the target to the Indian National Cybercrime Helpline: 1930.",
        "Block the sender's mobile number or handle in your messaging app.",
      ],
      helpline: "1930",
    };
  }

  // 2. Greetings & Bot Identity
  if (/^(hi|hello|hey|hola|greetings|namaste|morning|evening|wassup|yo|who are you|what can you do|help me)$/i.test(lower)) {
    return {
      reply: `Hello! I am PayShield AI Copilot — FinTrack's cybercrime forensics and personal finance security intelligence assistant.\n\nYou can ask me anything in plain English or casual language:\n• "Is this message a scam?" (paste any SMS or email)\n• "What is a Digital Arrest scam?"\n• "Do I need to enter my UPI PIN to receive cashback?"\n• "How do scammers get my phone number?"\n• "My money got deducted, how do I recover it?"\n• General budgeting and personal finance tips!`,
      tips: [
        "Paste any suspicious SMS, URL, or UPI handle directly here.",
        "Ask about online banking rules or fraud prevention.",
      ],
    };
  }

  // 3. FinTrack Application Questions
  if (/what is fintrack|about fintrack|how does fintrack work|splitwise|ledger|who built|creator|arijit/i.test(lower)) {
    return {
      reply: `FinTrack is a full-featured personal finance and shared expense operating system crafted by **Arijit Kayal**.\n\nKey Capabilities:\n1. **Personal Ledger**: Real-time monthly balance, income/expense tracking, category breakdown, carry-forward liquidity.\n2. **Split & Groups**: Splitwise-grade group bill splitting with zero-loss integer math and debt simplification.\n3. **PayShield**: Multi-layer forensic threat detection for malicious links, deceptive UPI IDs, and cybercrime coercion tactics.\n4. **Private Architecture**: Built on Supabase with zero external logging of private financial entries.`,
      tips: [
        "Use the cup button on the top toolbar to support the creator, Arijit Kayal!",
        "Switch to the 'Forensic Target Radar' tab to run comprehensive URL/UPI scans.",
      ],
    };
  }

  // 4. Personal Finance, Budgeting & Saving Advice
  if (/how to save money|50\/30\/20|how to budget|emergency fund|manage debt|credit score|cibil/i.test(lower)) {
    return {
      reply: `Here are foundational financial security & budgeting principles:\n\n• **50/30/20 Rule**: Allocate 50% of take-home income to Needs (rent, utilities, groceries), 30% to Wants (dining, hobbies), and 20% to Savings & Debt repayment.\n• **Emergency Runway**: Maintain 3 to 6 months of basic living expenses in high-liquidity instruments (liquid mutual funds or high-yield savings) before aggressive investing.\n• **High-Cost Debt Avalanche**: Pay off credit card balances and high-interest personal loans first (often 36–42% APR).\n• **CIBIL Score Optimization**: Keep credit utilization under 30% of total card limits and ensure zero missed repayments.`,
      tips: [
        "Use FinTrack's 'Budgets' tab to set monthly category spending thresholds.",
        "Track shared roommate or trip expenses in 'Split' to prevent unreconciled debts.",
      ],
    };
  }

  // 5. How Scammers Get Phone Numbers / Data Privacy
  if (/how do scammers get my number|is truecaller safe|data leak|dark web|spam calls/i.test(lower)) {
    return {
      reply: `Scammers obtain phone numbers and personal information through several vectors:\n\n1. **Breached Corporate Databases**: Large data leaks from shopping portals, delivery services, and educational platforms are sold on dark web forums.\n2. **Public Data Brokers & Scraping**: Caller ID apps, social media profiles, and resume portals frequently expose names paired with active phone numbers.\n3. **Random Number Generators (Wardialing)**: Automated bots send bulk SMS across sequential number blocks (e.g. +91 98210 XXXXX).\n\n**Protection Protocol**:\n• Never share primary phone numbers at retail billing counters.\n• Register on the National Do Not Disturb (DND) registry via TRAI (SMS 'START 0' to 1909).\n• Use masked or virtual numbers for unverified online portals.`,
      tips: [
        "Send 'START 0' to 1909 to activate Full DND on your Indian SIM.",
        "Never approve apps requesting SMS or Contact permissions without reason.",
      ],
    };
  }

  // 6. Hinglish & Vernacular Scenarios
  if (/kya.*upi.*pin|bhai.*message|bijli.*cut|paise.*kat.*gaye|paisa.*wapas|call.*aaya.*tha|sach.*hai.*ya.*jhooth/i.test(lower)) {
    if (/kya.*upi.*pin|pin.*daalna/i.test(lower)) {
      return {
        reply: `⚠️ **Bhai, bilkul dhyan se samjhein:**\n\n👉 **UPI PIN daalne se humesha aapke account se paise KAT-TE hain (debit hote hain).**\n👉 Kisi bhi cashback, reward, refund, ya OLX payment ko receive karne ke liye **kabhi bhi UPI PIN nahi lagta**.\n\nAgar koi bol raha hai ki "PIN daalo tabhi account me credit hoga", to yeh 100% FRAUD hai! Collect request turant decline karein.`,
        vector: "Inverted UPI PIN Trap (Vernacular)",
        risk: "high",
        tips: [
          "UPI PIN sirf paise bhejne ke liye hota hai, lene ke liye nahi.",
          "Apne UPI app me fraud request ko decline aur block karein.",
        ],
        helpline: "1930",
      };
    }
    if (/bijli.*cut|power.*cut/i.test(lower)) {
      return {
        reply: `⚠️ **Caution: Bijli Cut (Electricity Disconnection) Ek Fake Scam Hai!**\n\nKoi bhi state electricity board (BESCOM, WBSEDCL, TNEB, Tata, Adani) personal mobile number se raat 9:30 baje bijli kaatne ka SMS nahi bhejti.\n\nYeh log aapse fake mobile number par call karwate hain ya AnyDesk/QuickSupport jaisa app download karwa kar bank account khali kar dete hain.`,
        vector: "Utility Cutoff Smishing (Vernacular)",
        risk: "high",
        tips: [
          "SMS me diye gaye number par kabhi call na karein.",
          "Bijli bill ka status sirf official bijli portal ya bill par check karein.",
        ],
        helpline: "1930",
      };
    }
    if (/paise.*kat.*gaye|paisa.*wapas/i.test(lower)) {
      return {
        reply: `🚨 **Aapke Account Se Fraud Ho Gaya Hai? Turant Yeh Kadam Uthayein:**\n\n1. **Turant 1930 par call karein**: National Cybercrime Helpline par pehle 2 ghante ("Golden Hour") me complain karne par fraudster ka bank account freeze kiya ja sakta hai.\n2. **Bank Card & Net Banking Lock Karein**: Apne mobile banking app me jakar debit card aur net banking ko turant off / block karein.\n3. **cybercrime.gov.in** par transaction ID, screenshot aur UTR number ke sath official FIR darj karein.`,
        vector: "Emergency Cyber Financial Fraud (Vernacular)",
        risk: "high",
        tips: [
          "1930 par abhi call karein.",
          "Apne bank ke fraud cell ko notify karein.",
        ],
        helpline: "1930",
      };
    }
  }

  // 7. Digital Arrest & Fake Police/CBI/ED/Court Coercion
  if (/digital\s*arrest|cbi|ed\s*office|narcotics|customs\s*offic|fedex|dhl|skype|video\s*call|warrant|mha|cyber\s*cell|illegal\s*parcel|sim\s*card.*illegal/i.test(lower)) {
    return {
      reply: `⚠️ **CRITICAL ALERT: DIGITAL ARREST EXTORTION SCAM.**\n\nIn India, no law enforcement authority (CBI, ED, State Police, NIA, Narcotics Control Bureau, or the Supreme Court) EVER conducts trials, interrogations, or arrests via Skype, WhatsApp video calls, or Telegram.\n\n**Scammer Playbook**:\n1. Scammers wear fake police uniforms in rooms decorated with official logos.\n2. They accuse you of illegal parcels (drugs, fake passports) or SIM cards used in money laundering.\n3. They place you under "virtual surveillance" and demand that you transfer funds into a "government safe deposit / RBI clearance account" for verification.\n\n**Reality**: There is no legal provision for 'Digital Arrest' anywhere in Indian jurisprudence. Disconnect immediately!`,
      vector: "Digital Arrest Legal Coercion Extortion",
      risk: "high",
      tips: [
        "Disconnect the call immediately. You cannot be arrested on a video call.",
        "Never transfer money to any 'RBI verification' or 'police clearance' account.",
        "Dial 1930 immediately or submit evidence on cybercrime.gov.in.",
      ],
      helpline: "1930",
    };
  }

  // 8. Inverted UPI Collect & QR Scam
  if (/upi\s*pin|collect\s*request|receive.*pin|claim.*cashback|approve.*refund|scratch\s*card|olx.*qr|buyer.*qr/i.test(lower)) {
    return {
      reply: `⚠️ **CRITICAL WARNING: INVERTED UPI COLLECT FRAUD.**\n\nRemember the foundational law of UPI:\n👉 **Entering your UPI PIN ALWAYS DEDUCTS money from your bank account.**\n👉 **You NEVER need to enter your UPI PIN or scan a QR code to RECEIVE money, cashback, or refunds.**\n\n**Scammer Playbook**:\n• A fake buyer on OLX/Marketplace claims: *"I am sending advance payment. Scan this QR code or enter your PIN to accept funds."*\n• Or an SMS claims: *"PhonePe reward of ₹4,999 approved. Click collect to claim."*\n\nThe moment you input your PIN, the amount is debited from your bank account and credited to the scammer.`,
      vector: "Inverted UPI Collect Trap",
      risk: "high",
      tips: [
        "Decline the collect request on your UPI app (GPay / PhonePe / Paytm).",
        "Never enter your UPI PIN unless YOU are intentionally paying for a purchase.",
        "Block and report the sender's VPA handle inside your payment app.",
      ],
      helpline: "1930",
    };
  }

  // 9. Electricity / Power Cutoff Threats
  if (/electricity|power\s*cut|9:30\s*pm|disconnection|light\s*cut|bill\s*officer|urgently\s*pay\s*bill/i.test(lower)) {
    return {
      reply: `⚠️ **HIGH RISK: ELECTRICITY CUTOFF EXTORTION SMS.**\n\nState power distribution companies (BESCOM, WBSEDCL, TNEB, Adani, Tata Power, etc.) NEVER send warning SMS messages from personal 10-digit mobile numbers threatening immediate power disconnection at 9:30 PM.\n\n**Scammer Playbook**:\n1. Sends an SMS claiming your bill is unpaid and electricity will be disconnected tonight at 9:30 PM.\n2. Directs you to call a personal phone number (fake electricity officer).\n3. The fake officer instructs you to download a remote access app (QuickSupport, AnyDesk) to "update your bill status", which allows them to mirror your screen and capture OTPs.`,
      vector: "Utility Cutoff Smishing",
      risk: "high",
      tips: [
        "Do NOT call the mobile number listed in the SMS.",
        "Check your bill status exclusively through your electricity provider's official portal or bill.",
        "Delete the message and report the sending mobile number.",
      ],
      helpline: "1930",
    };
  }

  // 10. India Post / Courier Delivery Smishing
  if (/india\s*post|courier|parcel|delivery\s*failed|update\s*address|speed\s*post|redelivery\s*fee/i.test(lower)) {
    return {
      reply: `⚠️ **HIGH RISK: INDIA POST / COURIER DELIVERY SMISHING.**\n\nIndia Post never sends SMS messages demanding that you click a link within 12 hours to update an address or pay ₹25–₹50 re-delivery fees.\n\n**Scammer Playbook**:\n• Links like \`indiapost-delivery[.]xyz\` or \`indiapost-track[.]info\` lead to pixel-perfect replicas of the India Post website.\n• Victims enter their full address, followed by credit/debit card numbers and CVV for a trivial ₹25 charge.\n• Scammers use the captured card credentials to initiate fraudulent transactions for thousands of rupees.`,
      vector: "Postal Smishing & Credential Theft",
      risk: "high",
      tips: [
        "Never click links from SMS regarding undelivered parcels.",
        "Track packages only on the official government site: indiapost.gov.in.",
        "If you entered card details, freeze the card immediately via your banking app.",
      ],
      helpline: "1930",
    };
  }

  // 11. Telegram Part-Time Task Scams
  if (/telegram|part\s*time\s*job|like\s*youtube|rate\s*hotel|earn\s*3000|earn\s*5000|task\s*scam|daily\s*income/i.test(lower)) {
    return {
      reply: `⚠️ **HIGH RISK: PART-TIME TASK & TELEGRAM INVESTMENT SCAM.**\n\nOffers received on WhatsApp or Telegram paying ₹1,500–₹5,000/day for rating hotels on Google Maps or liking YouTube videos are coordinated Ponzi/pig-butchering scams.\n\n**Scammer Playbook**:\n1. **Bait**: You complete 3 easy tasks and receive an initial ₹150–₹500 to win your trust.\n2. **The Trap**: You are added to a Telegram VIP group where "prepaid tasks" or "crypto arbitrage" require you to deposit ₹5,000 to earn ₹7,500.\n3. **The Loss**: Once you deposit larger sums (₹50,000 to ₹5,00,000), they freeze your withdrawals, claiming "system errors" and demanding more money to unlock your funds.`,
      vector: "Telegram Task & Ponzi Investment Fraud",
      risk: "high",
      tips: [
        "Cease all communication and leave the Telegram group immediately.",
        "Never deposit money to unlock 'earnings' or 'crypto profits'.",
        "Report the bank accounts they provided to 1930 for cyber fraud freezing.",
      ],
      helpline: "1930",
    };
  }

  // 12. Instant Loan App Extortion
  if (/loan\s*app|chinese\s*loan|blackmail.*photo|contacts.*access|harassment.*call|instant\s*loan/i.test(lower)) {
    return {
      reply: `⚠️ **CRITICAL: PREDATORY INSTANT LOAN APP EXTORTION.**\n\nUnregulated lending apps on third-party APK websites lure victims with "instant paperless loans in 2 minutes".\n\n**Scammer Playbook**:\n1. The app requests permissions to access your complete Contact list and Photo Gallery.\n2. They disburse only a fraction (e.g. ₹3,000 out of ₹5,000) with exorbitant 50% weekly interest.\n3. Within 5 days, recovery agents call your contacts, send morph photos to family, and threaten legal action.\n\n**Recovery Steps**:\n• RBI regulations strictly forbid non-NBFC registered apps from accessing contact lists.\n• Do NOT pay further extortion demands.\n• File an immediate complaint on cybercrime.gov.in and report the app to Google Play / CERT-In.`,
      vector: "Predatory Loan App Blackmail Extortion",
      risk: "high",
      tips: [
        "Never install loan APKs outside the official Google Play Store.",
        "Check if the lender is registered on the RBI's official NBFC list.",
        "File an extortion complaint on cybercrime.gov.in.",
      ],
      helpline: "1930",
    };
  }

  // 13. Emergency Recovery Protocol (Money already lost)
  if (/lost\s*money|money\s*deducted|scammed|hacked|stolen|already\s*paid|account\s*debited/i.test(lower)) {
    return {
      reply: `🚨 **IMMEDIATE EMERGENCY FINANCIAL FRAUD PROTOCOL (GOLDEN HOUR):**\n\n1. **Dial 1930 IMMEDIATELY**: The Citizen Financial Cyber Fraud Reporting System operates 24x7. Reporting within the first 2–3 hours ("Golden Hour") enables law enforcement to freeze the fraudster's mule bank accounts before funds are withdrawn.\n2. **Lock Debit/Credit Cards & Net Banking**: Open your mobile banking app or call your bank's 24x7 emergency helpline to freeze your accounts and block active cards.\n3. **Lodge an Official Complaint**: File a complaint on **cybercrime.gov.in** with:\n   • Transaction Reference Number (UTR / Ref ID)\n   • Bank account statement\n   • Screenshots of conversations or fake portals.`,
      vector: "Emergency Cyber Financial Fraud Protocol",
      risk: "high",
      tips: [
        "Call 1930 right now.",
        "Contact your bank's 24x7 fraud cell to request a transaction hold.",
        "Save all SMS, transaction reference numbers (UTR), and call logs as evidence.",
      ],
      helpline: "1930",
    };
  }

  // 14. Direct Link or UPI Handle embedded in the query
  const autoKind = detectInputKind(text);
  if (autoKind === "url" || autoKind === "upi" || /https?:\/\/|www\.|\.pages\.dev|\.web\.app|@invalid|@ok/i.test(text)) {
    const analysis = analyzeInput(text, autoKind);
    const topFinding = analysis.findings[0];
    const isRisky = analysis.risk === "high" || analysis.risk === "medium";

    return {
      reply: `**Forensic Target Analysis (${autoKind === "url" ? "Web Link" : autoKind === "upi" ? "UPI Handle" : "Target"})**:\n\n• **Threat Score**: ${analysis.score}/10 (${analysis.risk.toUpperCase()} RISK)\n• **Primary Finding**: ${topFinding ? `${topFinding.title} — ${topFinding.detail}` : "Standard format structure."}\n\n${
        isRisky
          ? `⚠️ **Verdict: DANGEROUS TARGET.** This target shows signatures of impersonation or fraud infrastructure. Do NOT click, send money, or enter credentials.`
          : `✅ **Verdict: No known high-risk signatures identified.** Always double-check domain authenticity before signing in or paying.`
      }`,
      vector: topFinding?.title || "Target Security Analysis",
      risk: analysis.risk,
      tips: isRisky
        ? [
            "Do not click, pay, or reply to this target.",
            "Report the link or UPI handle to the National Cybercrime Portal: 1930.",
            "Block the sender in your messaging app.",
          ]
        : [
            "Verify destination domain before entering credentials.",
            "Check that HTTPS padlock is valid.",
          ],
      helpline: isRisky ? "1930" : undefined,
    };
  }

  // 15. Fallback Conversational Response
  return {
    reply: `I analyzed your inquiry across our institutional cybercrime, banking, and fraud forensics registries.\n\nTo inspect a potential scam or ask a question:\n• **Paste any suspicious SMS, WhatsApp notice, or email** to analyze its psychological deception techniques.\n• **Paste an unfamiliar website link or UPI ID** to check against brand impersonation and cloud phishing lists.\n• **Ask specific scenarios** like "How does Digital Arrest work?", "Can someone steal money if I give an OTP?", or general personal finance questions!`,
    tips: [
      "Paste any suspicious SMS, URL, or UPI ID directly into the chat.",
      "Ask: 'What is a digital arrest?' or 'Can I receive money without UPI PIN?'",
    ],
  };
}
