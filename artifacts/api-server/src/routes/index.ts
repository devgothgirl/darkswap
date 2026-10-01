import { Router, type IRouter } from "express";
import healthRouter from "./health";
import swapRouter from "./swap";
import discoveryRouter from "./discovery";
import okxRouter from "./okx";
import nearRouter from "./near";
import nearTrendsRouter from "./near-trends";
import marketingRouter from "./marketing";
import supportRouter from "./support";
import rewardsRouter from "./rewards";
import launchRouter from "./launch";

const router: IRouter = Router();

router.use(launchRouter);
router.use(healthRouter);
router.use(swapRouter);
router.use(nearRouter);
router.use(nearTrendsRouter);
router.use(marketingRouter);
router.use(supportRouter);
router.use(rewardsRouter);
router.use(["/explore", "/swap/okx"], (_req, res) => {
  res.status(403).json({
    error: "This feature is closed for beta testing. Private swap and bridge routes remain available.",
  });
});
router.use(discoveryRouter);
router.use(okxRouter);

export default router;
