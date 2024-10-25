#!/usr/bin/env -S deno run -A
/**
 * Author: Gerald <i@gera2ld.space>
 */

import { parseArgs } from "jsr:@std/cli/parse-args";
import { load } from "jsr:@std/dotenv";

const USAGE = `
Usage:

$ ./publish-edge-addon.ts <zip-file-to-publish>

Options:

--accessTokenUrl <accessTokenUrl>  Defaults to \`$ACCESS_TOKEN_URL\`.
--clientId <clientId>              Defaults to \`$CLIENT_ID\`.
--clientSecret <clientSecret>      Defaults to \`$CLIENT_SECRET\`.
--productId <productId>            Defaults to \`$PRODUCT_ID\`.
--notes <notes>                    Set notes for reviewers. Defaults to \`$NOTES\`.
`;

await load({ export: true });

const args = parseArgs(Deno.args);

const accessTokenUrl = args.accessTokenUrl || Deno.env.get("ACCESS_TOKEN_URL");
const clientId = args.clientId || Deno.env.get("CLIENT_ID");
const clientSecret = args.clientSecret || Deno.env.get("CLIENT_SECRET");
const productId = args.productId || Deno.env.get("PRODUCT_ID");
const notes = args.notes || Deno.env.get("NOTES") || "";
const distFile = args._[0] as string;

let error = false;
if (!accessTokenUrl) {
  console.error("ACCESS_TOKEN_URL is required!");
  error = true;
}
if (!clientId) {
  console.error("CLIENT_ID is required!");
  error = true;
}
if (!clientSecret) {
  console.error("CLIENT_SECRET is required!");
  error = true;
}
if (!productId) {
  console.error("PRODUCT_ID is required!");
  error = true;
}
if (!distFile) {
  error = true;
}

if (error) {
  console.error(USAGE);
  Deno.exit(1);
}

const endpoint = "https://api.addons.microsoftedge.microsoft.com";

interface Operation {
  id: string;
  createdTime: string;
  lastUpdatedTime: string;
  status: string;
  message: string;
  errorCode: string;
}

async function getToken() {
  const body = new URLSearchParams([
    ["scope", `${endpoint}/.default`],
    ["grant_type", "client_credentials"],
    ["client_id", clientId],
    ["client_secret", clientSecret],
  ]);
  const res = await fetch(accessTokenUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data: {
    token_type: "Bearer";
    expires_in: number;
    access_token: string;
  } = await res.json();
  return data;
}

async function poll<T>(fn: (i: number) => Promise<T>, maxRetry = 10) {
  for (let i = 0; i < maxRetry; i += 1) {
    await delay(1000 + i * 2000);
    const result = await fn(i);
    if (result) return result;
  }
}

class Publisher {
  private token = "";

  constructor(private productId: string) {}

  private async request(path: string, opts?: RequestInit) {
    if (!this.token) this.token = (await getToken()).access_token;
    const res = await fetch(`${endpoint}${path}`, {
      ...opts,
      headers: {
        ...opts?.headers,
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!res.ok) throw res;
    return res;
  }

  async upload(zipFile: string | Blob) {
    let body: Blob | Uint8Array;
    if (typeof zipFile === "string") body = await Deno.readFile(zipFile);
    else body = zipFile;
    const res = await this.request(
      `/v1/products/${this.productId}/submissions/draft/package`,
      {
        method: "POST",
        headers: {
          "content-type": "application/zip",
        },
        body,
      },
    );
    if (res.status !== 202) throw res;
    const operationId = res.headers.get("location");
    if (!operationId) throw res;
    return operationId;
  }

  async checkUpload(operationId: string) {
    const res = await this.request(
      `/v1/products/${this.productId}/submissions/draft/package/operations/${operationId}`,
    );
    const data: Operation = await res.json();
    if (data.status === "InProgress") return false;
    if (data.status === "Succeeded") return true;
    throw data;
  }

  async uploadResult(zipFile: string | Blob) {
    const operationId = await this.upload(zipFile);
    if (
      !(await poll((i) => {
        console.log("Check upload:", operationId, i || "");
        return this.checkUpload(operationId);
      }))
    ) {
      throw new Error("Upload failed");
    }
  }

  async publish() {
    const res = await this.request(
      `/v1/products/${this.productId}/submissions`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          notes,
        }),
      },
    );
    if (res.status !== 202) throw res;
    const operationId = res.headers.get("location");
    if (!operationId) throw res;
    return operationId;
  }

  async checkPublish(operationId: string) {
    const res = await this.request(
      `/v1/products/${this.productId}/submissions/operations/${operationId}`,
    );
    const data: Operation = await res.json();
    if (data.status === "InProgress") return false;
    if (data.status === "Succeeded") return true;
    throw data;
  }

  async publishResult() {
    const operationId = await this.publish();
    if (
      !(await poll((i) => {
        console.log("Check publish:", operationId, i || "");
        return this.checkPublish(operationId);
      }))
    ) {
      throw new Error("Publish failed");
    }
  }
}

function delay(time: number) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

async function main() {
  const publisher = new Publisher(productId);
  await publisher.uploadResult(distFile);
  await publisher.publishResult();
}

main().catch((err) => {
  console.error(err);
  Deno.exit(1);
});
