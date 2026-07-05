import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = process.env.API_INTERNAL_BASE_URL ?? "http://localhost:3001";

type RouteContext = {
  params: {
    path: string[];
  };
};

export async function GET(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  return proxyRequest(request, context.params.path);
}

async function proxyRequest(request: NextRequest, path: string[]) {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(
      { error: "UNAUTHORIZED", message: "Sign in required." },
      { status: 401 }
    );
  }

  const internalApiKey = process.env.INTERNAL_API_KEY;

  if (!internalApiKey) {
    return NextResponse.json(
      {
        error: "MISSING_INTERNAL_API_KEY",
        message: "Server is missing INTERNAL_API_KEY.",
      },
      { status: 500 }
    );
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(`/api/${path.join("/")}`, API_BASE_URL);
  targetUrl.search = sourceUrl.search;

  const body =
    request.method === "GET" || request.method === "HEAD"
      ? undefined
      : await request.text();

  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      "Content-Type": request.headers.get("Content-Type") ?? "application/json",
      "x-api-key": internalApiKey,
    },
    body,
    cache: "no-store",
  });
  const responseBody = await response.text();

  return new NextResponse(responseBody, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ?? "application/json",
    },
  });
}
