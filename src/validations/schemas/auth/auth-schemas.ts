import { z } from "zod";
import { ROLES } from "../../../constants/roles.js";

export const vDevLoginSchema = z.object({
  email: z.string().email().max(254),
  role: z.enum([ROLES.DEVELOPER, ROLES.ADMIN, ROLES.SUPER_ADMIN]).default(ROLES.DEVELOPER),
});
