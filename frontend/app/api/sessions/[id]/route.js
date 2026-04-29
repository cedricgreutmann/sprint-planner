import { NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";

export async function GET(_request, { params }) {
  const id = String(params?.id || "");
  console.log("Fetching session with id:", id);
  if (!id) {
    return NextResponse.json({ error: "Session id is required." }, { status: 400 });
  }

  const session = await prisma.sprintSession.findUnique({
    where: { id },
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
