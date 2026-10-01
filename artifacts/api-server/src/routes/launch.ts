import { Router, type IRouter } from "express";
import discovery from "./stonkfun";
import privateRoutes from "./launch-private";
import execution from "./launch-execution";

/** Launch-only ingress. Never exposes swap, marketing or rewards aliases. */
const router: IRouter = Router();
router.use(execution);
router.use(discovery);
router.use(privateRoutes);
export default router;