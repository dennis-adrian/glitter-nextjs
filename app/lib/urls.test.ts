// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emailBaseUrlProblem, publicBaseUrl } from "@/app/lib/urls";

const env = process.env as Record<string, string | undefined>;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = {
    NEXT_PUBLIC_BASE_URL: env.NEXT_PUBLIC_BASE_URL,
    VERCEL_URL: env.VERCEL_URL,
    VERCEL_ENV: env.VERCEL_ENV,
    VERCEL_PROJECT_PRODUCTION_URL: env.VERCEL_PROJECT_PRODUCTION_URL,
  };
  for (const name of Object.keys(saved)) delete env[name];
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) delete env[name];
    else env[name] = value;
  }
});

describe("publicBaseUrl", () => {
  it("prefers the configured base URL, without its trailing slashes", () => {
    env.NEXT_PUBLIC_BASE_URL = " https://www.glitter.com.bo// ";
    env.VERCEL_URL = "glitter-git-develop.vercel.app";
    expect(publicBaseUrl()).toBe("https://www.glitter.com.bo");
  });

  it("falls back to the deployment's own host over https", () => {
    env.NEXT_PUBLIC_BASE_URL = "  ";
    env.VERCEL_URL = "glitter-abc123.vercel.app/";
    expect(publicBaseUrl()).toBe("https://glitter-abc123.vercel.app");
  });

  it("uses production's own domain in production, not the deployment's generated host", () => {
    env.VERCEL_ENV = "production";
    env.VERCEL_PROJECT_PRODUCTION_URL = " www.glitter.com.bo/ ";
    env.VERCEL_URL = "glitter-abc123.vercel.app";
    expect(publicBaseUrl()).toBe("https://www.glitter.com.bo");
  });

  it("falls back to the deployment's host in production when its domain is missing", () => {
    env.VERCEL_ENV = "production";
    env.VERCEL_PROJECT_PRODUCTION_URL = " ";
    env.VERCEL_URL = "glitter-abc123.vercel.app";
    expect(publicBaseUrl()).toBe("https://glitter-abc123.vercel.app");
  });

  it("keeps a preview on its own host, even though production's domain is set there too", () => {
    env.VERCEL_ENV = "preview";
    env.VERCEL_PROJECT_PRODUCTION_URL = "www.glitter.com.bo";
    env.VERCEL_URL = "glitter-git-develop.vercel.app";
    expect(publicBaseUrl()).toBe("https://glitter-git-develop.vercel.app");
  });

  it("falls back to localhost when nothing is set", () => {
    env.NEXT_PUBLIC_BASE_URL = "";
    expect(publicBaseUrl()).toBe("http://localhost:3000");
  });
});

describe("emailBaseUrlProblem", () => {
  it("accepts anything in development, which sends no email", () => {
    expect(
      emailBaseUrlProblem("http://localhost:3000", "development"),
    ).toBeNull();
  });

  it.each(["preview", "production"])(
    "accepts a public https host in %s",
    (vercelEnv) => {
      expect(
        emailBaseUrlProblem("https://www.glitter.com.bo", vercelEnv),
      ).toBeNull();
      expect(
        emailBaseUrlProblem("https://glitter-abc123.vercel.app", vercelEnv),
      ).toBeNull();
    },
  );

  it.each([
    "http://www.glitter.com.bo",
    "http://localhost:3000",
    "https://localhost:3000",
    "https://LOCALHOST",
    "https://127.0.0.1:3000",
    "https://[::1]:3000",
    "https://app.localhost",
    "www.glitter.com.bo",
    "",
  ])("refuses %j outside development", (url) => {
    expect(emailBaseUrlProblem(url, "preview")).toEqual(expect.any(String));
    expect(emailBaseUrlProblem(url, "production")).toEqual(expect.any(String));
  });
});
