/**
 * End-to-end tests of the PRD flows, against a fresh seeded DB (see global-setup.ts).
 * Seed data (scripts/seed.ts): every customer's PIN is 1234, the owner code is 9999.
 *   דנה כהן 115.90 ₪ (limit 1,000) · יוסי לוי 32.20 ₪ · מרים אבו-חמד 310 ₪ (limit 500)
 *   אברהם מזרחי 0 ₪ (limit 300) · רונית ביטון 0 ₪ · דוד פרץ 64 ₪ (limit 200)
 * Each test uses its own customer so the tests don't depend on each other's balances.
 */
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Client } from "pg";
import { E2E_DB } from "../../playwright.config";

const EMPLOYEE = { username: "employee", password: "employee1234" };
const OWNER = { username: "owner", password: "owner1234" };

async function session(browser: Browser, who: { username: string; password: string }) {
  const ctx = await browser.newContext();
  const res = await ctx.request.post("/api/auth/login", { data: who });
  expect(res.ok()).toBeTruthy();
  return ctx.newPage();
}

/** Taps digits on the customer-facing keypad, like a customer would. */
async function tapPin(page: Page, digits: string) {
  const dialog = page.getByRole("dialog");
  for (const d of digits) await dialog.getByRole("button", { name: d, exact: true }).click();
}

async function openCustomer(page: Page, search: string, name: string) {
  await page.goto("/");
  await page.getByPlaceholder(/חיפוש לקוח/).fill(search);
  // wait until the filtered results arrive, so Enter opens the top match
  await expect(page.locator("main ul li a").first()).toContainText(name);
  await expect(page.locator("main ul li a")).toHaveCount(1);
  await page.getByPlaceholder(/חיפוש לקוח/).press("Enter");
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

async function balanceOf(page: Page, name: string): Promise<number> {
  const res = await page.request.get(`/api/customers?q=${encodeURIComponent(name)}`);
  const rows = (await res.json()) as { name: string; balance: number }[];
  return rows.find((r) => r.name === name)!.balance;
}

async function sql(query: string, params: unknown[] = []) {
  const c = new Client({ connectionString: E2E_DB });
  await c.connect();
  try {
    return (await c.query(query, params)).rows;
  } finally {
    await c.end();
  }
}

test("debt: wrong PIN is refused, the 4th right digit approves and returns to the register", async ({ browser }) => {
  const page = await session(browser, EMPLOYEE);
  const started = Date.now();
  await openCustomer(page, "דנ", "דנה כהן");
  await page.getByPlaceholder("0").fill("50");
  await page.getByRole("button", { name: "רישום חוב" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("יתרה קודמת");
  await expect(dialog).toContainText("115.90");
  await expect(dialog).toContainText("165.90");

  await tapPin(page, "0000");
  await expect(dialog.getByRole("alert")).toContainText("קוד שגוי. נותרו 4 ניסיונות");
  expect(await balanceOf(page, "דנה כהן")).toBe(11590); // nothing saved (BR-01)

  await tapPin(page, "1234"); // no confirm button: the 4th digit submits
  await expect(page.getByRole("status")).toContainText("החוב נרשם");
  await expect(page).toHaveURL("/");
  console.log(`  core flow (search → amount → PIN → done) with one wrong PIN: ${Date.now() - started} ms`);
  expect(await balanceOf(page, "דנה כהן")).toBe(16590);
});

test("partial payment needs a PIN; a payment above the balance is blocked", async ({ browser }) => {
  const page = await session(browser, EMPLOYEE);
  await openCustomer(page, "יוס", "יוסי לוי");
  await page.getByPlaceholder("0").fill("40");
  await page.getByRole("button", { name: "רישום תשלום" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("התשלום גבוה מיתרת החוב");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByPlaceholder("0").fill("20");
  await page.getByRole("button", { name: "רישום תשלום" }).click();
  await tapPin(page, "1234");
  await expect(page.getByRole("status")).toContainText("התשלום נרשם");
  await expect(page).toHaveURL("/");
  expect(await balanceOf(page, "יוסי לוי")).toBe(1220);
});

test("cancel within 15 minutes with the customer's PIN keeps the row as cancelled", async ({ browser }) => {
  const page = await session(browser, EMPLOYEE);
  // the 20 ₪ payment from the previous test may not exist if run alone, so make a fresh one
  await openCustomer(page, "יוס", "יוסי לוי");
  const before = await balanceOf(page, "יוסי לוי");
  await page.getByPlaceholder("0").fill("5");
  await page.getByRole("button", { name: "רישום חוב" }).click();
  await tapPin(page, "1234");
  await expect(page).toHaveURL("/");
  expect(await balanceOf(page, "יוסי לוי")).toBe(before + 500);

  await page.goto("/recent");
  const row = page.getByRole("listitem").filter({ hasText: "יוסי לוי" }).filter({ hasText: "חוב" }).first();
  await row.getByRole("button", { name: /ביטול \(\d+ ד׳\)/ }).click();
  await expect(page.getByRole("dialog")).toContainText("ביטול חוב");
  await tapPin(page, "1234");
  await expect(page.getByRole("status")).toContainText("העסקה בוטלה");
  await expect(row).toContainText("בוטל");
  expect(await balanceOf(page, "יוסי לוי")).toBe(before);
});

test("over the credit limit: employee needs the owner code", async ({ browser }) => {
  const page = await session(browser, EMPLOYEE);
  await openCustomer(page, "דוד", "דוד פרץ");
  await page.getByPlaceholder("0").fill("150");
  await page.getByRole("button", { name: "רישום חוב" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("חריגה מתקרת האשראי");
  await expect(dialog).toContainText("קוד בעלים");

  await tapPin(page, "1111");
  await expect(dialog.getByRole("alert")).toContainText("קוד בעלים שגוי");
  await tapPin(page, "9999");
  await expect(page.getByRole("status")).toContainText("החוב נרשם");
  expect(await balanceOf(page, "דוד פרץ")).toBe(21400);

  const [log] = await sql(
    "select a.action from audit_log a join customers c on c.id = a.customer_id where c.name = $1 order by a.created_at desc limit 1",
    ["דוד פרץ"],
  );
  expect(log.action).toBe("tx_override");
});

test("5 wrong PINs lock the customer; owner approves without PIN and resets the PIN", async ({ browser }) => {
  const emp = await session(browser, EMPLOYEE);
  await openCustomer(emp, "מרי", "מרים אבו-חמד");
  await emp.getByPlaceholder("0").fill("10");
  await emp.getByRole("button", { name: "רישום חוב" }).click();
  const dialog = emp.getByRole("dialog");
  for (let i = 4; i >= 1; i--) {
    await tapPin(emp, "0000");
    await expect(dialog.getByRole("alert")).toContainText(`נותרו ${i} ניסיונות`);
  }
  await tapPin(emp, "0000");
  await expect(dialog.getByRole("alert")).toContainText("הקוד ננעל");
  expect(await balanceOf(emp, "מרים אבו-חמד")).toBe(31000);

  const owner = await session(browser, OWNER);
  await openCustomer(owner, "מרי", "מרים אבו-חמד");
  await expect(owner.getByText("הקוד נעול זמנית")).toBeVisible();
  await owner.getByPlaceholder("0").fill("10");
  await owner.getByRole("button", { name: "רישום חוב" }).click();
  await owner.getByRole("button", { name: "אישור בעלים ללא קוד לקוח" }).click();
  await expect(owner.getByRole("status")).toContainText("החוב נרשם");
  expect(await balanceOf(owner, "מרים אבו-חמד")).toBe(32000);

  await openCustomer(owner, "מרי", "מרים אבו-חמד");
  await owner.getByRole("button", { name: "איפוס קוד לקוח" }).click();
  await tapPin(owner, "5555");
  await expect(owner.getByRole("dialog")).toContainText("הקישו שוב");
  await tapPin(owner, "5555");
  await expect(owner.getByRole("status")).toContainText("הקוד עודכן");

  // the new PIN works for the employee
  await openCustomer(emp, "מרי", "מרים אבו-חמד");
  await emp.getByPlaceholder("0").fill("1");
  await emp.getByRole("button", { name: "רישום חוב" }).click();
  await tapPin(emp, "5555");
  await expect(emp.getByRole("status")).toContainText("החוב נרשם");
});

test("after 15 minutes only the owner can cancel", async ({ browser }) => {
  const emp = await session(browser, EMPLOYEE);
  await openCustomer(emp, "אבר", "אברהם מזרחי");
  await emp.getByPlaceholder("0").fill("12");
  await emp.getByRole("button", { name: "רישום חוב" }).click();
  await tapPin(emp, "1234");
  await expect(emp).toHaveURL("/");
  await sql(
    "update transactions set created_at = now() - interval '20 minutes' where customer_id = (select id from customers where name = $1)",
    ["אברהם מזרחי"],
  );

  // the API refuses the customer-PIN path too, not just the UI
  const [tx] = await sql(
    "select t.id from transactions t join customers c on c.id = t.customer_id where c.name = $1",
    ["אברהם מזרחי"],
  );
  const res = await emp.request.post(`/api/transactions/${tx.id}/cancel`, { data: { pin: "1234" } });
  expect(res.status()).toBe(403);

  await emp.goto("/recent");
  const empRow = emp.getByRole("listitem").filter({ hasText: "אברהם מזרחי" });
  await expect(empRow).toBeVisible();
  await expect(empRow.getByRole("button")).toHaveCount(0);

  const owner = await session(browser, OWNER);
  await owner.goto("/recent");
  const row = owner.getByRole("listitem").filter({ hasText: "אברהם מזרחי" });
  await row.getByRole("button", { name: "ביטול בעלים" }).click();
  await owner.getByRole("button", { name: "אישור בעלים ללא קוד לקוח" }).click();
  await expect(owner.getByRole("status")).toContainText("העסקה בוטלה");
  await expect(row).toContainText("בוטל");
  expect(await balanceOf(owner, "אברהם מזרחי")).toBe(0);
});

test("owner opens a customer: PIN chosen twice, hashed, one account per phone", async ({ browser }) => {
  const owner = await session(browser, OWNER);
  const fillForm = async () => {
    await owner.goto("/c/new");
    await owner.getByLabel("שם מלא").fill("נועה בדיקה");
    await owner.getByLabel("טלפון").fill("050-777-8899");
    await owner.getByLabel(/תקרת אשראי/).fill("300");
    await owner.getByRole("button", { name: /המשך/ }).click();
  };

  const dialog = owner.getByRole("dialog");
  await fillForm();
  await tapPin(owner, "2468");
  await expect(dialog).toContainText("הקישו שוב");
  await tapPin(owner, "2460");
  await expect(dialog.getByRole("alert")).toContainText("הקודים לא תואמים");
  await tapPin(owner, "2468");
  await expect(dialog).toContainText("הקישו שוב");
  await tapPin(owner, "2468");
  await expect(owner.getByRole("status")).toContainText("הלקוח נפתח");
  await expect(owner.getByRole("heading", { name: "נועה בדיקה" })).toBeVisible();

  const [row] = await sql("select pin_hash, phone from customers where name = $1", ["נועה בדיקה"]);
  expect(row.phone).toBe("0507778899");
  expect(row.pin_hash).toMatch(/^\$argon2id\$/); // BR-03

  await fillForm();
  await tapPin(owner, "1111");
  await expect(dialog).toContainText("הקישו שוב");
  await tapPin(owner, "1111");
  await expect(owner.getByRole("main").getByRole("alert")).toContainText("כבר קיים לקוח עם מספר הטלפון הזה"); // BR-05
});

test("two registers stay in sync", async ({ browser }) => {
  const a = await session(browser, EMPLOYEE);
  const b = await session(browser, OWNER);
  await openCustomer(a, "רונ", "רונית ביטון");
  await openCustomer(b, "רונ", "רונית ביטון");
  await expect(b.getByTestId("balance")).toHaveText(/^\D*0\D*$/);

  await a.getByPlaceholder("0").fill("7");
  await a.getByRole("button", { name: "רישום חוב" }).click();
  await tapPin(a, "1234");
  await expect(a.getByRole("status")).toBeVisible();

  // register B polls every 5 s
  await expect(b.getByTestId("balance")).toHaveText(/^\D*7\D*$/, { timeout: 8000 });
});

test("employees can't reach owner screens or APIs, and no API exposes a hash", async ({ browser }) => {
  const emp = await session(browser, EMPLOYEE);
  await emp.goto("/");
  await expect(emp.getByRole("link", { name: "ניהול" })).toHaveCount(0);
  await expect(emp.getByRole("link", { name: /לקוח חדש/ })).toHaveCount(0);

  const create = await emp.request.post("/api/customers", {
    data: { name: "x", phone: "0521231234", creditLimit: null, pin: "1234" },
  });
  expect(create.status()).toBe(403);
  expect((await emp.request.get("/api/audit")).status()).toBe(403);
  expect((await emp.request.get("/api/staff")).status()).toBe(403);

  const bodies = await Promise.all(
    ["/api/me", "/api/customers", "/api/transactions/recent"].map(async (u) => (await emp.request.get(u)).text()),
  );
  for (const b of bodies) expect(b).not.toMatch(/argon2|pinHash|passwordHash|pin_hash/i);

  const anon = await browser.newContext();
  expect((await anon.request.get("/api/customers")).status()).toBe(401);
});
