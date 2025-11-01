import { Router } from "express";
const router = Router();
import userRouter from "./user.route";
import opportunityRouter from "./opportunity.route";

router.use("/user", userRouter);
router.use("/opportunity", opportunityRouter);

export default router;
