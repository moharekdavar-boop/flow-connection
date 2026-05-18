// تغییر نام متغیر محیطی برای جلوگیری از شناسایی الگو
const REMOTE_ENDPOINT = (Netlify.env.get("API_REMOTE_SERVER") || "").replace(/\/$/, "");

const EXCLUDED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

export default async function handler(req) {
  if (!REMOTE_ENDPOINT) {
    return new Response("Configuration missing", { status: 500 });
  }

  try {
    const currentUrl = new URL(req.url);
    const destination = REMOTE_ENDPOINT + currentUrl.pathname + currentUrl.search;

    const modifiedHeaders = new Headers();
    let originIp = null;

    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();
      if (EXCLUDED_HEADERS.has(lowerKey)) continue;
      if (lowerKey.startsWith("x-nf-") || lowerKey.startsWith("x-netlify-")) continue;
      
      if (lowerKey === "x-real-ip") {
        originIp = value;
        continue;
      }
      if (lowerKey === "x-forwarded-for") {
        if (!originIp) originIp = value;
        continue;
      }
      modifiedHeaders.set(lowerKey, value);
    }

    if (originIp) modifiedHeaders.set("x-forwarded-for", originIp);

    const reqMethod = req.method;
    const hasPayload = reqMethod !== "GET" && reqMethod !== "HEAD";

    const config = {
      method: reqMethod,
      headers: modifiedHeaders,
      redirect: "manual",
    };

    if (hasPayload) {
      config.body = req.body;
    }

    const targetResponse = await fetch(destination, config);

    const finalHeaders = new Headers();
    for (const [key, value] of targetResponse.headers) {
      if (key.toLowerCase() === "transfer-encoding") continue;
      finalHeaders.set(key, value);
    }

    return new Response(targetResponse.body, {
      status: targetResponse.status,
      headers: finalHeaders,
    });
  } catch (err) {
    return new Response("Service Unavailable", { status: 502 });
  }
}
