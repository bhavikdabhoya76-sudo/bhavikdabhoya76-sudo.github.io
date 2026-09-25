import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  JOURNEY_SELECTORS,
  accessDeniedMessage,
  buildIrctcJob,
  clickAllowed,
  detectGate,
  detectLoggedIn,
  fieldIsProtected,
  journeyDateDisplay,
  nextBrowserAction,
  optionMatches,
  publicJobHasNoSecrets,
  quotaLabel,
  selectorsArePublic,
} from "./irctc-plan";
import type { BookingRequest } from "./types";

function sampleBooking(overrides: Partial<BookingRequest> = {}): BookingRequest {
  return {
    id: "bk1",
    createdAt: "2026-09-25T00:00:00.000Z",
    updatedAt: "2026-09-25T00:00:00.000Z",
    trainNumber: "12957",
    fromStation: "adi",
    toStation: "ndls",
    journeyDate: "2026-09-26",
    trainClass: "3A",
    quota: "TQ",
    passengers: [
      {
        id: "p1",
        name: "Rina Shah",
        age: 34,
        gender: "F",
        berthPreference: "LOWER",
      },
    ],
    fareCap: 2500,
    cnfOnly: true,
    paymentMethod: "ewallet",
    checklist: {
      aadhaarVerified: true,
      masterListSaved: true,
      ewalletFunded: true,
      journeyDetailsReady: true,
      antiDoubleBookAck: true,
    },
    status: "armed",
    timelinePhase: "t15_start",
    tatkalOpensAt: "2026-09-25T04:30:00.000Z",
    armedAt: "2026-09-25T00:00:00.000Z",
    runLog: [],
    pendingHumanStep: null,
    enginePhase: 1,
    ...overrides,
  };
}

const beforeOpen = new Date("2026-09-25T04:00:00.000Z").getTime();
const afterOpen = new Date("2026-09-25T04:30:01.000Z").getTime();

describe("public journey plan", () => {
  it("formats the journey date and Tatkal quota", () => {
    assert.equal(journeyDateDisplay("2026-09-26"), "26/09/2026");
    assert.equal(quotaLabel("TQ"), "TATKAL");
  });

  it("builds a job from saved stations without secret keys", () => {
    const job = buildIrctcJob(sampleBooking());
    assert.equal(job.from, "ADI");
    assert.equal(job.to, "NDLS");
    assert.equal(job.dateDisplay, "26/09/2026");
    assert.equal(job.classLabel, "AC 3 Tier (3A)");
    assert.equal(job.quotaLabel, "TATKAL");
    assert.equal(job.passengers[0]?.genderLabel, "Female");
    assert.equal(job.passengers[0]?.berthLabel, "Lower");
    assert.equal(publicJobHasNoSecrets(job), true);
    assert.equal(JSON.stringify(job).toLowerCase().includes("password"), false);
  });

  it("keeps journey selectors off password, captcha, and otp fields", () => {
    const all = [
      ...JOURNEY_SELECTORS.from,
      ...JOURNEY_SELECTORS.to,
      ...JOURNEY_SELECTORS.date,
      ...JOURNEY_SELECTORS.classDropdown,
      ...JOURNEY_SELECTORS.quotaDropdown,
    ];
    assert.equal(selectorsArePublic(all), true);
  });
});

describe("protected fields and clicks", () => {
  it("refuses password, captcha, and otp inputs", () => {
    assert.equal(fieldIsProtected({ type: "password" }), true);
    assert.equal(fieldIsProtected({ name: "otp" }), true);
    assert.equal(fieldIsProtected({ placeholder: "Enter Captcha" }), true);
    assert.equal(
      fieldIsProtected({ ariaLabel: "Enter From station. Input is Mandatory." }),
      false,
    );
  });

  it("allows Search and blocks login, pay, and captcha clicks", () => {
    assert.equal(clickAllowed("Search", "search"), true);
    assert.equal(clickAllowed("Login", "search"), false);
    assert.equal(clickAllowed("Make Payment", "continue"), false);
    assert.equal(clickAllowed("Book Now", "book"), true);
    assert.equal(clickAllowed("Continue", "continue"), true);
    assert.equal(clickAllowed("Continue to Pay", "continue"), false);
    assert.equal(clickAllowed("TATKAL", "option"), true);
  });

  it("matches class labels without treating short codes as substrings of other words", () => {
    assert.equal(optionMatches("AC 3 Tier (3A)", ["AC 3 Tier (3A)", "3A"]), true);
    assert.equal(optionMatches("Sleeper (SL)", ["SL"]), true);
    assert.equal(optionMatches("Vistadome AC (EV)", ["SL"]), false);
  });
});

describe("attended gates", () => {
  it("detects captcha, otp, payment, and login ahead of search", () => {
    assert.equal(
      detectGate({
        hasVisiblePassword: true,
        hasVisibleCaptcha: false,
        hasVisibleOtp: false,
        hasVisiblePayment: false,
        hasLogout: false,
      }),
      "login",
    );
    assert.equal(
      detectGate({
        hasVisiblePassword: true,
        hasVisibleCaptcha: true,
        hasVisibleOtp: false,
        hasVisiblePayment: false,
        hasLogout: false,
      }),
      "captcha",
    );
    assert.equal(
      detectGate({
        hasVisiblePassword: false,
        hasVisibleCaptcha: false,
        hasVisibleOtp: true,
        hasVisiblePayment: true,
        hasLogout: true,
      }),
      "payment",
    );
    assert.equal(
      detectLoggedIn({
        hasVisiblePassword: false,
        hasVisibleCaptcha: false,
        hasVisibleOtp: false,
        hasVisiblePayment: false,
        hasLogout: true,
      }),
      true,
    );
  });

  it("fills journey fields before open and does not search yet", () => {
    assert.equal(
      nextBrowserAction({
        nowMs: beforeOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: false,
        journeyFilled: false,
        searchClicked: false,
        passengersFilled: false,
        fillAttempts: 0,
      }),
      "fill_journey",
    );
    assert.equal(
      nextBrowserAction({
        nowMs: beforeOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: true,
        journeyFilled: true,
        searchClicked: false,
        passengersFilled: false,
        fillAttempts: 1,
      }),
      "wait_open",
    );
  });

  it("pauses on a login form instead of typing", () => {
    assert.equal(
      nextBrowserAction({
        nowMs: beforeOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: "login",
        loggedIn: false,
        journeyFilled: false,
        searchClicked: false,
        passengersFilled: false,
        fillAttempts: 0,
      }),
      "pause_login",
    );
  });

  it("searches only after open when the user is already logged in", () => {
    assert.equal(
      nextBrowserAction({
        nowMs: afterOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: false,
        journeyFilled: true,
        searchClicked: false,
        passengersFilled: false,
        fillAttempts: 1,
      }),
      "pause_login",
    );
    assert.equal(
      nextBrowserAction({
        nowMs: afterOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: true,
        journeyFilled: true,
        searchClicked: false,
        passengersFilled: false,
        fillAttempts: 1,
      }),
      "search",
    );
  });

  it("stops at captcha, otp, and payment even after login", () => {
    const base = {
      nowMs: afterOpen,
      opensAt: "2026-09-25T04:30:00.000Z",
      loggedIn: true,
      journeyFilled: true,
      searchClicked: true,
      passengersFilled: false,
      fillAttempts: 1,
    };
    assert.equal(nextBrowserAction({ ...base, gate: "captcha" }), "pause_captcha");
    assert.equal(nextBrowserAction({ ...base, gate: "otp" }), "pause_otp");
    assert.equal(nextBrowserAction({ ...base, gate: "payment" }), "pause_payment");
  });

  it("names an Access Denied block without treating it as a field to type", () => {
    const message = accessDeniedMessage(
      "Access Denied",
      "You don't have permission to access \"http://www.irctc.co.in/\" on this server. Reference #18 https://errors.edgesuite.net/18.abc",
    );
    assert.ok(message);
    assert.match(message || "", /npx playwright install chromium/);
    assert.match(message || "", /password|Login/);
    assert.equal(accessDeniedMessage("IRCTC Next Generation eTicketing", "Book Ticket"), null);
  });

  it("prefills passengers after search, then holds", () => {
    assert.equal(
      nextBrowserAction({
        nowMs: afterOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: true,
        journeyFilled: true,
        searchClicked: true,
        passengersFilled: false,
        fillAttempts: 1,
      }),
      "prefill_passengers",
    );
    assert.equal(
      nextBrowserAction({
        nowMs: afterOpen,
        opensAt: "2026-09-25T04:30:00.000Z",
        gate: null,
        loggedIn: true,
        journeyFilled: true,
        searchClicked: true,
        passengersFilled: true,
        fillAttempts: 1,
      }),
      "hold",
    );
  });
});
