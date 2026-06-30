import express from "express";
import { protectAdmin } from "../middleware/auth.js";
import { createVenue, getAllVenues } from "../controllers/venueController.js";

const venueRouter = express.Router();

venueRouter.post('/create', protectAdmin, createVenue);
venueRouter.get('/all', getAllVenues);

export default venueRouter;