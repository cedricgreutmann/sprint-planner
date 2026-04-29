import { NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";

function normalizeName(value) {
  return String(value || "").trim();
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const name = normalizeName(searchParams.get("name"));

  if (name) {
    const session = await prisma.sprintSession.findUnique({
      where: { name },
      select: {
        id: true,
        name: true,
        state: true,
        updatedAt: true
      }
    });

    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json({ session });
  }

  const sessions = await prisma.sprintSession.findMany({
    select: {
      id: true,
      name: true,
      updatedAt: true
    },
    orderBy: {
      updatedAt: "desc"
    }
  });

  return NextResponse.json({ sessions });
}

export async function POST(request) {
  const body = await request.json();
  const name = normalizeName(body?.name);
  const state = body?.state;

  if (!name) {
    return NextResponse.json({ error: "Session name is required." }, { status: 400 });
  }

  if (!state || typeof state !== "object") {
    return NextResponse.json({ error: "Session state is required." }, { status: 400 });
  }

  const saved = await prisma.sprintSession.upsert({
    where: { name },
    update: { state },
    create: { name, state },
    select: {
      id: true,
      name: true,
      updatedAt: true
    }
  });

  return NextResponse.json({ session: saved });
}
