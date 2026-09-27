import { Router, type IRouter } from "express";
import healthRouter from "./health";
import swapRouter from "./swap";
import discoveryRouter from "./discovery";
import okxRouter from "./okx";

const router: IRouter = Router();

router.use(healthRouter);
router.use(swapRouter);
router.use(["/explore", "/swap/okx"], (_req, res) => {
  res.status(403).json({
    error: "This feature is closed for beta testing. Private swap and bridge routes remain available.",
  });
});
router.use(discoveryRouter);
router.use(okxRouter);

export default router;
