import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import applicationsRouter from "./applications.js";
import profileRouter from "./profile.js";
import aiRouter from "./ai.js";
import jobsRouter from "./jobs.js";
import { requireAuth } from "../middlewares/auth.js";

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
