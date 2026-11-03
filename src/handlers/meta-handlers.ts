import { factory } from "../factory.js";
import { getAppMeta } from "../helpers/meta-helper.js";

export const handleGetMeta = factory.createHandlers(async (c) => c.json(await getAppMeta(c.get("deps"))));
