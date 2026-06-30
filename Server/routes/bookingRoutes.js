import express from 'express';
import {
    holdSeats,
    releaseSeats,
    createBooking,
    getSeatMap,
    cancelBooking,
    joinWaitlist
} from '../controllers/bookingController.js';

const bookingRouter = express.Router();

bookingRouter.post('/hold', holdSeats);
bookingRouter.post('/release', releaseSeats);
bookingRouter.post('/create', createBooking);
bookingRouter.get('/seats/:showId', getSeatMap);
bookingRouter.post('/cancel/:bookingId', cancelBooking);
bookingRouter.post('/waitlist', joinWaitlist);

export default bookingRouter;