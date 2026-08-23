import { z } from "zod";
import { route } from "@/lib/api/response";
import { claimParticipantAccess } from "@/lib/security/participant-access";
const schema=z.object({token:z.string().trim().min(32).max(512)});
export async function POST(request:Request){return route(async()=>claimParticipantAccess(request,schema.parse(await request.json()).token));}
