import express from "express";
import { protectOrganiser } from "../middleware/auth.js";
import { registerOrganiser, isOrganiser, createOrganiserShow, getOrganiserDashboard } from "../controllers/organiserController.js";

const organiserRouter = express.Router();

organiserRouter.post('/register', registerOrganiser);
organiserRouter.get('/is-organiser', isOrganiser);
organiserRouter.post('/show', protectOrganiser, createOrganiserShow);
organiserRouter.get('/dashboard', protectOrganiser, getOrganiserDashboard);

export default organiserRouter;