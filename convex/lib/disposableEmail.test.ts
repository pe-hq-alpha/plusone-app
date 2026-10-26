import { expect, test } from "vitest";
import { isDisposableEmail } from "./disposableEmail";

test("isDisposableEmail", () => {
  expect(isDisposableEmail("a@mailinator.com")).toBe(true);
  expect(isDisposableEmail("A@YOPMAIL.COM")).toBe(true);
  expect(isDisposableEmail("a@sub.guerrillamail.com")).toBe(true);
  expect(isDisposableEmail("a@gmail.com")).toBe(false);
  expect(isDisposableEmail("a@notmailinator.com")).toBe(false);
  expect(isDisposableEmail("a@com")).toBe(false);
  expect(isDisposableEmail(undefined)).toBe(false);
  expect(isDisposableEmail("no-at-sign")).toBe(false);
});
