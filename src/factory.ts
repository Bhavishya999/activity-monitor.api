import { createFactory } from "hono/factory";
import type { Handler } from "hono";
import type { AppBindings } from "./types/app.types.js";

export const factory = createFactory<AppBindings>();
export type AppHandler = Handler<AppBindings>;
