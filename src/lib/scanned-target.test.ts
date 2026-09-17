// Reading a scanned QR.
//
// ⚠ THE REGRESSION THIS FILE EXISTS FOR
//   extractScanned used to be "take the last path segment". The moment rides could share one
//   link (server: sql/037), a scanned `/share/19092026A-19092026B` came back as the single
//   code "19092026A-19092026B" — which no ride has — so the rider was shown "No ride has that
//   code". At the start line. With both groups standing there and a printed QR on a sign.
//
//   The phone's native camera app was never affected: it just opens the URL, and the router
//   handles /share. Only the in-app scanner was blind, which is also the scanner the organizer
//   tests with, so it looked fine right up to the moment it mattered.
//
// Pure string handling, so it is tested without a camera.

import { describe, expect, it } from "vitest";
import { extractScanned } from "./scanned-target";

describe("extractScanned — one ride", () => {
  it("reads a /join/<code> URL", () => {
    expect(extractScanned("https://el-nino.site/join/19092026A")).toEqual({
      kind: "code",
      code: "19092026A",
    });
  });

  it("ignores the ?via=qr the share sheet adds", () => {
    expect(extractScanned("https://el-nino.site/join/19092026A?via=qr")).toEqual({
      kind: "code",
      code: "19092026A",
    });
  });

  it("accepts a bare code — a homemade QR, or a code typed by hand", () => {
    expect(extractScanned("19092026A")).toEqual({ kind: "code", code: "19092026A" });
  });

  it("trims whitespace around a bare code", () => {
    expect(extractScanned("  19092026A \n")).toEqual({ kind: "code", code: "19092026A" });
  });

  it("URL-decodes the segment", () => {
    expect(extractScanned("https://el-nino.site/join/19092026%41")).toEqual({
      kind: "code",
      code: "19092026A",
    });
  });

  it("falls back to the raw text for anything that is not a URL", () => {
    expect(extractScanned("not a url at all")).toEqual({
      kind: "code",
      code: "not a url at all",
    });
  });
});

describe("extractScanned — several rides under one link", () => {
  it("⚠ reads a /share/<a>-<b> URL as a group, not as one impossible code", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A-19092026B")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B"],
    });
  });

  it("reads it with ?via=qr, which is how it is actually printed", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A-19092026B?via=qr")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B"],
    });
  });

  it("reads three codes", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A-19092026B-19092026C")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B", "19092026C"],
    });
  });

  it("accepts the comma and plus separators the server also accepts", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A,19092026B")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B"],
    });
    expect(extractScanned("https://el-nino.site/share/19092026A+19092026B")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B"],
    });
  });

  it("degrades a one-code /share link to a plain code — a group that shrank to one ride", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A")).toEqual({
      kind: "code",
      code: "19092026A",
    });
  });

  it("survives a trailing separator", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A-19092026B-")).toEqual({
      kind: "share",
      codes: ["19092026A", "19092026B"],
    });
  });

  it("only treats it as a group when the segment before really is 'share'", () => {
    // A ride whose code somehow contained a dash must not be split into two.
    expect(extractScanned("https://el-nino.site/join/19092026A-B")).toEqual({
      kind: "code",
      code: "19092026A-B",
    });
  });

  it("is not fooled by a path that merely mentions share deeper down", () => {
    expect(extractScanned("https://el-nino.site/share/19092026A/extra")).toEqual({
      kind: "code",
      code: "extra",
    });
  });
});
