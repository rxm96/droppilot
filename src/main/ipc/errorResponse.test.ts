import { describe, expect, it } from "vitest";
import { TwitchAuthError, TwitchServiceError } from "../twitch/errors";
import { TWITCH_ERROR_CODES } from "../../shared/errorCodes";
import { toIpcErrorResponse } from "./errorResponse";

describe("toIpcErrorResponse", () => {
  it("maps auth errors with their HTTP status", () => {
    expect(toIpcErrorResponse(new TwitchAuthError("token expired", 401))).toEqual({
      error: "auth",
      message: "token expired",
      status: 401,
    });
  });

  it("maps auth errors without a status", () => {
    expect(toIpcErrorResponse(new TwitchAuthError("no session"))).toEqual({
      error: "auth",
      message: "no session",
      status: undefined,
    });
  });

  it("maps Twitch service errors with their code", () => {
    const err = new TwitchServiceError(TWITCH_ERROR_CODES.GQL_FAILED, "GQL failed");
    expect(toIpcErrorResponse(err)).toEqual({
      error: "twitch",
      code: TWITCH_ERROR_CODES.GQL_FAILED,
      message: "GQL failed",
    });
  });

  it("maps any other Error to unknown", () => {
    expect(toIpcErrorResponse(new Error("boom"))).toEqual({ error: "unknown", message: "boom" });
  });

  it("stringifies non-Error throwables", () => {
    expect(toIpcErrorResponse("raw string")).toEqual({ error: "unknown", message: "raw string" });
  });
});
