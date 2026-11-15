import { handler } from "@/server/api";
import { requireUser } from "@/server/session";

export const GET = handler(async () => requireUser());
