/**
 * Generates a flat seats array for a Show from a Venue's layout and per-category pricing.
 * @param {Array} layout      - Venue.layout: [{ row, seatsInRow, category }]
 * @param {Array} categoryPricing - Show.categoryPricing: [{ category, price }]
 * @returns {Array} seats array ready to be stored on Show.seats
 */
export function buildSeatsFromLayout(layout, categoryPricing) {
    const priceMap = {};
    for (const cp of categoryPricing) {
        priceMap[cp.category] = cp.price;
    }

    const seats = [];
    for (const row of layout) {
        const price = priceMap[row.category] ?? 0;
        for (let i = 1; i <= row.seatsInRow; i++) {
            seats.push({
                seatId:       `${row.row}${i}`,
                row:          row.row,
                category:     row.category,
                price,
                status:       'available',
                heldBy:       null,
                holdExpiresAt: null,
                bookedBy:     null
            });
        }
    }
    return seats;
}
