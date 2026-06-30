import { Router, type IRouter } from "express";
import healthRouter from "./health";
import applicationsRouter from "./applications";
import profileRouter from "./profile";
import aiRouter from "./ai";
import jobsRouter from "./jobs";

const router: IRouter = Router();

router.use(healthRouter);
router.use(applicationsRouter);
router.use(profileRouter);
router.use(aiRouter);
router.use(jobsRouter);

export default router;
