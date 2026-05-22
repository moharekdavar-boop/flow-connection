// تغییر نام متغیرهای کلیدی و مبهم‌سازی رفتاری
const TARGET_NODE = (Netlify.env.get("API_REMOTE_SERVER") || "").replace(/\/$/, "");

const STRIP_HEADERS = new Set([
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
  "x-nf-client-connection-ip",
  "x-client-ip"
]);

export default async function handler(req) {
  if (!TARGET_NODE) {
    return new Response("Asset synchronization pending.", { status: 404 });
  }

  try {
    const urlContext = new URL(req.url);
    const path = urlContext.pathname;

    // ۱. شبیه‌سازی رفتار عادی برای درخواست‌های استاندارد وب (مانند favicon یا روبات‌ها)
    if (path === "/favicon.ico" || path === "/robots.txt") {
      return new Response("", { status: 404 });
    }

    const destination = TARGET_NODE + path + urlContext.search;
    const outboundHeaders = new Headers();
    let clientIpSource = null;

    for (const [key, value] of req.headers) {
      const lowerKey = key.toLowerCase();
      
      // حذف هدرهای حساس و هدرهای اختصاصی نتلایف که الگو ایجاد می‌کنند
      if (STRIP_HEADERS.has(lowerKey) || lowerKey.startsWith("x-nf-") || lowerKey.startsWith("x-netlify-")) {
        continue;
      }
      
      if (lowerKey === "x-real-ip" || lowerKey === "x-forwarded-for") {
        clientIpSource = value.split(",")[0].trim();
        continue;
      }
      
      outboundHeaders.set(lowerKey, value);
    }

    // بازسازی هدر آی‌پی به فرمت استاندارد غیراختصاصی
    if (clientIpSource) {
      outboundHeaders.set("forwarded", `for=${clientIpSource}`);
    }

    // تغییر هدر User-Agent به یک مرورگر استاندارد در صورت عدم وجود، برای عادی‌سازی ترافیک
    if (!outboundHeaders.has("user-agent")) {
      outboundHeaders.set("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
    }

    const method = req.method;
    const fetchOptions = {
      method: method,
      headers: outboundHeaders,
      redirect: "manual",
    };

    if (method !== "GET" && method !== "HEAD") {
      fetchOptions.body = req.body;
    }

    const originResponse = await fetch(destination, fetchOptions);

    // پاک‌سازی هدرهای پاسخ سرور مقصد قبل از تحویل به کلاینت
    const cleanResponseHeaders = new Headers();
    for (const [key, value] of originResponse.headers) {
      const lowerKey = key.toLowerCase();
      if (lowerKey === "transfer-encoding" || lowerKey === "server" || lowerKey.startsWith("x-powered-")) {
        continue;
      }
      cleanResponseHeaders.set(key, value);
    }

    return new Response(originResponse.body, {
      status: originResponse.status,
      headers: cleanResponseHeaders,
    });

  } catch (err) {
    // بازگرداندن وضعیت معمولی به جای خطای تند پراکسی
    return new Response("Resource temporarily unavailable", { status: 503 });
  }
}
