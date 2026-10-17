import { Router, type IRouter } from "express";
import healthRouter from "./health";
import plantIdentificationRouter from "./plant-identification";

const router: IRouter = Router();

router.use(healthRouter);
router.use(plantIdentificationRouter);

export default router;
