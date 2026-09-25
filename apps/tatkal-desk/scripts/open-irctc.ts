/**
 * Headed IRCTC window for one saved booking.
 *
 * Types only public journey fields (from, to, date, class, quota) and, after
 * Tatkal opens, Search plus passenger name/age/gender if the user already
 * logged in themselves.
 *
 * Never types a password, CAPTCHA, or OTP, and never confirms payment.
 * If Chromium or the live page is unavailable, writes simulate/failed status
 * and leaves Desk's simulate timeline in charge.
 */

import { readFile, writeFile } from "node:fs/promises";
import type { Locator, Page } from "playwright";
import {
  GATE_MESSAGES,
  JOURNEY_SELECTORS,
  accessDeniedMessage,
  clickAllowed,
  detectGate,
  detectLoggedIn,
  fieldIsProtected,
  filledJourneyMessage,
  nextBrowserAction,
  simulateInstallMessage,
  optionMatches,
  publicJobHasNoSecrets,
  type BrowserAction,
  type IrctcGate,
  type IrctcJob,
  type PageSignals,
} from "../src/lib/irctc-plan";

interface StatusFile {
  bookingId: string;
  mode: "playwright" | "simulate";
  phase: string;
  gate: IrctcGate | null;
  message: string;
  updatedAt: string;
}

function arg(flag: string): string {
  const idx = process.argv.indexOf(flag);
  const value = idx >= 0 ? process.argv[idx + 1] : "";
  if (!value) {
    throw new Error(`Missing ${flag}`);
  }
  return value;
}

async function writeStatus(statusPath: string, status: StatusFile): Promise<void> {
  const body = JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2);
  await writeFile(statusPath, body + "\n", "utf8");
}

async function loadJob(jobPath: string): Promise<IrctcJob> {
  const raw = await readFile(jobPath, "utf8");
  const job = JSON.parse(raw) as IrctcJob;
  if (!publicJobHasNoSecrets(job)) {
    throw new Error("Job file contains secret field names — refusing to run");
  }
  if (!job.from || !job.to || !job.dateDisplay) {
    throw new Error("Job is missing public journey fields");
  }
  return job;
}

async function isProtected(locator: Locator): Promise<boolean> {
  return fieldIsProtected({
    type: await locator.getAttribute("type"),
    name: await locator.getAttribute("name"),
    id: await locator.getAttribute("id"),
    placeholder: await locator.getAttribute("placeholder"),
    ariaLabel: await locator.getAttribute("aria-label"),
    autocomplete: await locator.getAttribute("autocomplete"),
  });
}

async function firstVisible(page: Page, selectors: readonly string[]): Promise<Locator | null> {
  for (const sel of selectors) {
    const locator = page.locator(sel).first();
    const visible = await locator.isVisible().catch(() => false);
    if (visible) return locator;
  }
  return null;
}

async function collectSignals(page: Page): Promise<PageSignals> {
  const password = await page
    .locator('input[type="password"]:visible')
    .count()
    .catch(() => 0);
  const captcha = await page
    .locator(
      'img[alt*="captcha" i]:visible, img[src*="captcha" i]:visible, input[placeholder*="captcha" i]:visible, input[id*="captcha" i]:visible, #captcha:visible',
    )
    .count()
    .catch(() => 0);
  const otp = await page
    .locator(
      'input[placeholder*="otp" i]:visible, input[name*="otp" i]:visible, input[id*="otp" i]:visible',
    )
    .count()
    .catch(() => 0);
  const payment = await page
    .getByRole("button", { name: /^(pay|make payment|pay & book|proceed to pay)$/i })
    .count()
    .catch(() => 0);
  const txn = await page
    .getByText(/transaction password/i)
    .count()
    .catch(() => 0);
  const logout = await page
    .getByRole("link", { name: /logout|sign out/i })
    .count()
    .catch(() => 0);
  const logoutBtn = await page
    .getByRole("button", { name: /logout|sign out/i })
    .count()
    .catch(() => 0);
  return {
    hasVisiblePassword: password > 0,
    hasVisibleCaptcha: captcha > 0,
    hasVisibleOtp: otp > 0,
    hasVisiblePayment: payment > 0 || txn > 0,
    hasLogout: logout + logoutBtn > 0,
  };
}

async function chooseDropdown(
  page: Page,
  selectors: readonly string[],
  matchers: string[],
): Promise<boolean> {
  const dropdown = await firstVisible(page, selectors);
  if (!dropdown) return false;
  await dropdown.click();
  const options = page.locator(
    '[role="option"], li.ui-dropdown-item, li.p-dropdown-item, .p-select-option',
  );
  await options
    .first()
    .waitFor({ state: "visible", timeout: 4000 })
    .catch(() => undefined);
  const count = await options.count();
  for (let i = 0; i < count; i += 1) {
    const option = options.nth(i);
    const text = ((await option.innerText().catch(() => "")) || "").trim();
    if (!text || !optionMatches(text, matchers)) continue;
    if (!clickAllowed(text, "option")) return false;
    await option.click();
    return true;
  }
  await page.keyboard.press("Escape").catch(() => undefined);
  return false;
}

async function fillStation(
  page: Page,
  selectors: readonly string[],
  code: string,
): Promise<boolean> {
  const input = await firstVisible(page, selectors);
  if (!input) return false;
  if (await isProtected(input)) return false;
  await input.click();
  await input.fill("");
  await input.pressSequentially(code, { delay: 40 });
  const option = page.locator('[role="option"]').filter({ hasText: code }).first();
  const appeared = await option
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!appeared) return false;
  const text = ((await option.innerText().catch(() => "")) || "").trim();
  if (text && !clickAllowed(text, "option")) return false;
  await option.click();
  return true;
}

async function fillDate(page: Page, dateDisplay: string): Promise<boolean> {
  const input = await firstVisible(page, JOURNEY_SELECTORS.date);
  if (!input) return false;
  if (await isProtected(input)) return false;
  await input.click();
  await input.press("Control+A").catch(() => undefined);
  await input.fill("").catch(() => undefined);
  await input.pressSequentially(dateDisplay, { delay: 30 });
  await input.press("Tab").catch(() => undefined);
  return true;
}

async function fillJourney(
  page: Page,
  job: IrctcJob,
): Promise<{ from: boolean; to: boolean; date: boolean; klass: boolean; quota: boolean }> {
  const from = await fillStation(page, JOURNEY_SELECTORS.from, job.from);
  const to = await fillStation(page, JOURNEY_SELECTORS.to, job.to);
  const date = await fillDate(page, job.dateDisplay);
  const klass = await chooseDropdown(page, JOURNEY_SELECTORS.classDropdown, job.classMatchers);
  const quota = await chooseDropdown(page, JOURNEY_SELECTORS.quotaDropdown, [
    job.quotaLabel,
    job.quota,
  ]);
  return { from, to, date, klass, quota };
}

async function clickNamed(
  page: Page,
  role: "button" | "link",
  pattern: RegExp,
  kind: "search" | "book" | "continue",
): Promise<boolean> {
  const target = page.getByRole(role, { name: pattern }).first();
  const visible = await target.isVisible().catch(() => false);
  if (!visible) return false;
  const text = ((await target.innerText().catch(() => "")) || "").trim();
  if (!clickAllowed(text, kind)) return false;
  await target.click();
  return true;
}

async function clickSearch(page: Page): Promise<boolean> {
  return clickNamed(page, "button", /^(search|find trains)$/i, "search");
}

async function clickBookNow(page: Page, job: IrctcJob): Promise<boolean> {
  if (!job.trainNumber) return false;
  const train = page.getByText(job.trainNumber, { exact: true }).first();
  const found = await train.isVisible().catch(() => false);
  if (!found) return false;
  const card = train.locator(
    "xpath=ancestor::*[contains(@class,'train') or contains(@class,'ng-star')][1]",
  );
  const book = card.getByRole("button", { name: /^book now$/i }).first();
  const visible = await book.isVisible().catch(() => false);
  if (!visible) return false;
  const text = ((await book.innerText().catch(() => "")) || "").trim();
  if (!clickAllowed(text, "book")) return false;
  await book.click();
  return true;
}

async function checkCnfOnly(page: Page): Promise<void> {
  const box = page
    .getByRole("checkbox", { name: /confirm berth|cnf/i })
    .first();
  const visible = await box.isVisible().catch(() => false);
  if (!visible) return;
  const name = ((await box.getAttribute("aria-label")) || "confirm berths").trim();
  if (!clickAllowed(name, "checkbox")) return;
  const checked = await box.isChecked().catch(() => false);
  if (!checked) await box.check().catch(() => undefined);
}

async function prefillPassengers(
  page: Page,
  job: IrctcJob,
  state: { bookAttempted: boolean; continueAttempted: boolean },
): Promise<"filled" | "waiting"> {
  const names = page.locator(
    'input[formcontrolname="passengerName"]:visible, input[placeholder*="Passenger Name" i]:visible',
  );
  const count = await names.count();
  if (count === 0) {
    if (!state.bookAttempted) {
      state.bookAttempted = true;
      await clickBookNow(page, job);
    }
    return "waiting";
  }

  const ages = page.locator(
    'input[formcontrolname="passengerAge"]:visible, input[placeholder*="Age" i]:visible',
  );
  const limit = Math.min(count, job.passengers.length, 6);
  for (let i = 0; i < limit; i += 1) {
    const person = job.passengers[i];
    if (!person) continue;
    const nameInput = names.nth(i);
    if (await isProtected(nameInput)) return "waiting";
    await nameInput.fill(person.name);
    const ageInput = ages.nth(i);
    const ageVisible = await ageInput.isVisible().catch(() => false);
    if (ageVisible && !(await isProtected(ageInput))) {
      await ageInput.fill(String(person.age));
    }
    const row = nameInput.locator("xpath=ancestor::*[self::tr or contains(@class,'passenger')][1]");
    const gender = row.locator('p-dropdown[formcontrolname="passengerGender"], p-dropdown').first();
    if (await gender.isVisible().catch(() => false)) {
      await gender.click().catch(() => undefined);
      const option = page
        .locator('[role="option"], li.ui-dropdown-item, li.p-dropdown-item')
        .filter({ hasText: person.genderLabel })
        .first();
      const text = ((await option.innerText().catch(() => "")) || "").trim();
      if (text && clickAllowed(text, "option")) {
        await option.click().catch(() => undefined);
      } else {
        await page.keyboard.press("Escape").catch(() => undefined);
      }
    }
  }
  await checkCnfOnly(page);

  if (!state.continueAttempted) {
    state.continueAttempted = true;
    const continueBtn = page.getByRole("button", { name: /^continue$/i }).first();
    if (await continueBtn.isVisible().catch(() => false)) {
      const label = ((await continueBtn.innerText().catch(() => "")) || "").trim();
      if (clickAllowed(label, "continue")) {
        await continueBtn.click();
      }
    }
  }
  return "filled";
}

async function readBlocked(page: Page): Promise<string | null> {
  const title = (await page.title().catch(() => "")) || "";
  const body = (
    (await page.locator("body").innerText({ timeout: 2000 }).catch(() => "")) || ""
  ).slice(0, 2500);
  return accessDeniedMessage(title, body);
}

async function openSearchForm(page: Page, job: IrctcJob): Promise<void> {
  await page.goto(job.originUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  const ready = await firstVisible(page, JOURNEY_SELECTORS.from);
  if (!ready) {
    await page.goto(job.searchUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
  }
}

function phaseFor(action: BrowserAction): { phase: string; gate: IrctcGate | null } {
  switch (action) {
    case "pause_login":
      return { phase: "paused_gate", gate: "login" };
    case "pause_captcha":
      return { phase: "paused_gate", gate: "captcha" };
    case "pause_otp":
      return { phase: "paused_gate", gate: "otp" };
    case "pause_payment":
      return { phase: "paused_gate", gate: "payment" };
    case "wait_open":
      return { phase: "waiting_open", gate: null };
    case "search":
      return { phase: "searched", gate: null };
    case "prefill_passengers":
      return { phase: "passengers_prefilled", gate: null };
    case "fill_journey":
      return { phase: "journey_filled", gate: null };
    default:
      return { phase: "hold", gate: null };
  }
}

async function main(): Promise<void> {
  const jobPath = arg("--job");
  const statusPath = arg("--status");
  const job = await loadJob(jobPath);

  const publish = (status: Omit<StatusFile, "bookingId" | "updatedAt">) =>
    writeStatus(statusPath, {
      bookingId: job.bookingId,
      updatedAt: new Date().toISOString(),
      ...status,
    });

  let chromium: typeof import("playwright").chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    await publish({
      mode: "simulate",
      phase: "simulate",
      gate: null,
      message: simulateInstallMessage(),
    });
    return;
  }

  let browser: Awaited<ReturnType<typeof chromium.launch>>;
  try {
    browser = await chromium.launch({
      headless: false,
      args: ["--start-maximized"],
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await publish({
      mode: "simulate",
      phase: "simulate",
      gate: null,
      message: `${simulateInstallMessage()} (${detail})`,
    });
    return;
  }

  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);

  let journeyFilled = false;
  let searchClicked = false;
  let searchAttempts = 0;
  let passengersFilled = false;
  let fillAttempts = 0;
  let partial = false;
  let closed = false;
  const passengerState = { bookAttempted: false, continueAttempted: false };

  page.on("close", () => {
    closed = true;
  });

  try {
    await openSearchForm(page, job);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await publish({
      mode: "playwright",
      phase: "failed",
      gate: null,
      message: `IRCTC did not load (${detail}). If a window is open, type the journey yourself. Login, CAPTCHA, OTP, and payment stay manual.`,
    });
  }

  const deadline = Date.now() + 18 * 60 * 60 * 1000;
  while (!closed && Date.now() < deadline) {
    let signals: PageSignals = {
      hasVisiblePassword: false,
      hasVisibleCaptcha: false,
      hasVisibleOtp: false,
      hasVisiblePayment: false,
      hasLogout: false,
    };
    try {
      if (page.isClosed()) break;
      const blocked = await readBlocked(page);
      if (blocked && !journeyFilled) {
        await publish({
          mode: "playwright",
          phase: "blocked",
          gate: null,
          message: blocked,
        });
        await new Promise((resolve) => setTimeout(resolve, 2500));
        continue;
      }
      signals = await collectSignals(page);
    } catch {
      break;
    }

    const gate = detectGate(signals);
    const loggedIn = detectLoggedIn(signals);
    const action = nextBrowserAction({
      nowMs: Date.now(),
      opensAt: job.tatkalOpensAt,
      gate,
      loggedIn,
      journeyFilled,
      searchClicked,
      passengersFilled,
      fillAttempts,
    });

    let message = "";
    if (action === "fill_journey") {
      try {
        const filled = await fillJourney(page, job);
        fillAttempts += 1;
        if (filled.from && filled.to) {
          journeyFilled = true;
          partial = !filled.date || !filled.klass || !filled.quota;
          message = filledJourneyMessage(job, partial);
        } else {
          message =
            "IRCTC search form was not filled (selectors missed or the site blocked the script). The window stays open — type From, To, Date, Class, and TQ yourself. Login, CAPTCHA, OTP, and payment stay manual.";
        }
      } catch (err) {
        fillAttempts += 1;
        const detail = err instanceof Error ? err.message : String(err);
        message = `Journey fill stopped (${detail}). Type the public fields in the IRCTC window. Desk will not type login, CAPTCHA, OTP, or payment.`;
      }
    } else if (action === "search") {
      const clicked = await clickSearch(page).catch(() => false);
      searchAttempts += 1;
      if (clicked || searchAttempts >= 4) searchClicked = true;
      message = clicked
        ? `Tatkal is open and you are logged in. Clicked Search for ${job.trainNumber}. Passenger prefill is next. CAPTCHA, OTP, and payment stay paused.`
        : "Tatkal is open. Search button was not clicked (selector miss). Click Search in the IRCTC window yourself. Desk still pauses at CAPTCHA, OTP, and payment.";
    } else if (action === "prefill_passengers") {
      const result = await prefillPassengers(page, job, passengerState).catch(
        () => "waiting" as const,
      );
      if (result === "filled") {
        passengersFilled = true;
        const names = job.passengers.map((p) => p.name).join(", ");
        message = `Passenger names filled for ${names}. If CAPTCHA, OTP, or payment appears, type it in the IRCTC window. Desk will not.`;
      } else {
        message = `Search is done. Select train ${job.trainNumber} ${job.classLabel} in the IRCTC window if Book Now was not clicked. Desk pauses at CAPTCHA, OTP, and payment.`;
      }
    } else if (action === "pause_login") {
      message = `${GATE_MESSAGES.login} If you are already logged in and Search does not start, click Search yourself.`;
    } else if (action === "pause_captcha") {
      message = GATE_MESSAGES.captcha;
    } else if (action === "pause_otp") {
      message = GATE_MESSAGES.otp;
    } else if (action === "pause_payment") {
      message = GATE_MESSAGES.payment;
    } else if (action === "wait_open") {
      message = filledJourneyMessage(job, partial);
    } else if (!journeyFilled && fillAttempts >= 3) {
      message =
        "IRCTC search form was not filled (selectors missed or the site blocked the script). The window stays open — type From, To, Date, Class, and TQ yourself. Login, CAPTCHA, OTP, and payment stay manual.";
    } else {
      message = partial
        ? "IRCTC window is open. Some journey fields still need you. Login, CAPTCHA, OTP, and payment stay manual."
        : "IRCTC window is holding. Type CAPTCHA, OTP, or payment in that window when they appear. Desk will not.";
    }

    const mapped = phaseFor(action);
    const phase =
      !journeyFilled && fillAttempts >= 3 && action !== "pause_login"
        ? "selectors_failed"
        : action === "fill_journey" && !journeyFilled
          ? "starting"
          : mapped.phase;
    await publish({
      mode: "playwright",
      phase,
      gate: mapped.gate,
      message,
    });

    await new Promise((resolve) => setTimeout(resolve, 2500));
  }

  await publish({
    mode: "playwright",
    phase: "closed",
    gate: null,
    message: "IRCTC window closed. Click Open IRCTC to launch it again. Login, CAPTCHA, OTP, and payment stay manual.",
  }).catch(() => undefined);
}

main().catch(async (err) => {
  const statusPath = process.argv.includes("--status")
    ? process.argv[process.argv.indexOf("--status") + 1]
    : "";
  const message = err instanceof Error ? err.message : String(err);
  if (statusPath) {
    await writeFile(
      statusPath,
      JSON.stringify(
        {
          bookingId: "",
          mode: "simulate",
          phase: "failed",
          gate: null,
          message: `Open IRCTC stopped (${message}). Simulate mode still runs.`,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      "utf8",
    ).catch(() => undefined);
  }
  process.exitCode = 1;
});
