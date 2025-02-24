import { defineMiddlewares } from "@medusajs/framework";
import { storeMiddlewares } from "./store/middlewares";

export default defineMiddlewares({
    routes: [
        ...storeMiddlewares
    ],
})