function upstreamUrl(path: string[], request: Request) {
  const apiBaseUrl = process.env.DJANGO_API_BASE_URL;
  if (!apiBaseUrl) return null;
  const query = new URL(request.url).search;
  return `${apiBaseUrl.replace(/\/$/, "")}/api/transfers/${path.join("/")}/${query}`;
}

async function proxy(request: Request, path: string[], method: "GET" | "POST") {
  const url = upstreamUrl(path, request);
  if (!url) {
    return Response.json(
      {
        detail:
          "The transfer service is unavailable. Check the local setup and try again.",
      },
      { status: 500 },
    );
  }
  try {
    const upstream = await fetch(url, {
      method,
      cache: "no-store",
      headers: { Accept: request.headers.get("Accept") ?? "application/json" },
    });
    const headers = new Headers();
    headers.set(
      "Content-Type",
      upstream.headers.get("Content-Type") ?? "application/json",
    );
    headers.set(
      "Cache-Control",
      upstream.headers.get("Cache-Control") ?? "no-store",
    );
    const buffering = upstream.headers.get("X-Accel-Buffering");
    if (buffering) headers.set("X-Accel-Buffering", buffering);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json(
      { detail: "The transfer service could not be reached." },
      { status: 502 },
    );
  }
}

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, context: Context) {
  return proxy(request, (await context.params).path, "GET");
}

export async function POST(request: Request, context: Context) {
  return proxy(request, (await context.params).path, "POST");
}
