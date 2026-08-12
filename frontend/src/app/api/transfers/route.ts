const UPSTREAM_PATH = "/api/transfers/";

function unavailable() {
  return Response.json(
    {
      detail:
        "The transfer service is unavailable. Check the local setup and try again.",
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  const apiBaseUrl = process.env.DJANGO_API_BASE_URL;
  if (!apiBaseUrl) return unavailable();

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, "")}${UPSTREAM_PATH}${new URL(request.url).search}`,
      { cache: "no-store" },
    );
    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      { detail: "The transfer service could not be reached. Try again." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const apiBaseUrl = process.env.DJANGO_API_BASE_URL;
  if (!apiBaseUrl) return unavailable();

  const idempotencyKey = request.headers.get("Idempotency-Key") ?? "";

  try {
    const response = await fetch(
      `${apiBaseUrl.replace(/\/$/, "")}${UPSTREAM_PATH}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: await request.text(),
        cache: "no-store",
      },
    );

    return new Response(await response.arrayBuffer(), {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") ?? "application/json",
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return Response.json(
      {
        detail:
          "The transfer service could not be reached. Retry safely with the same request.",
      },
      { status: 502 },
    );
  }
}
