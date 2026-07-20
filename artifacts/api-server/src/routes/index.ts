import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import applicationsRouter from "./applications";
import profileRouter from "./profile";
import aiRouter from "./ai";
import jobsRouter from "./jobs";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

// Public
router.use(healthRouter);
router.use(authRouter);

// Protected — everything below requires a valid Bearer token
router.use(requireAuth);
router.use(applicationsRouter);
router.use(profileRouter);
router.use(aiRouter);
router.use(jobsRouter);

export default router;
