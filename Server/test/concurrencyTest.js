/**
 * Concurrency Test: Simultaneous Seat Hold
 * ==========================================
 * Fires two concurrent POST /api/booking/hold requests for the same seat.
 * Exactly ONE must succeed and ONE must fail — proving the atomic
 * findOneAndUpdate filter prevents double-booking.
 *
 * Usage:
 *   node test/concurrencyTest.js <baseUrl> <showId> <seatId> <token1> <token2>
 *
 * Example:
 *   node test/concurrencyTest.js http://localhost:3000 <showId> A1 <clerkToken1> <clerkToken2>
 *
 * NOTE: token1 and token2 must be valid Clerk session tokens for different users.
 */

const [, , baseUrl, showId, seatId, token1, token2] = process.argv;

if (!baseUrl || !showId || !seatId || !token1 || !token2) {
    console.error('Usage: node test/concurrencyTest.js <baseUrl> <showId> <seatId> <token1> <token2>');
    process.exit(1);
}

async function holdSeat(token, label) {
    const res = await fetch(`${baseUrl}/api/booking/hold`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ showId, selectedSeats: [seatId] })
    });
    const json = await res.json();
    return { label, ...json };
}

console.log(`\n🧪 Concurrency Test`);
console.log(`   Show:  ${showId}`);
console.log(`   Seat:  ${seatId}`);
console.log(`   Firing two simultaneous hold requests...\n`);

// Fire both at exactly the same time
const [r1, r2] = await Promise.all([
    holdSeat(token1, 'Request-1'),
    holdSeat(token2, 'Request-2')
]);

console.log('Request-1 result:', r1);
console.log('Request-2 result:', r2);

const wins  = [r1, r2].filter(r => r.success === true);
const loses = [r1, r2].filter(r => r.success === false);

console.log(`\n📊 Results:`);
console.log(`   ✅ Succeeded: ${wins.length}  (expected: 1)`);
console.log(`   ❌ Failed:    ${loses.length}  (expected: 1)`);

if (wins.length === 1 && loses.length === 1) {
    console.log('\n✅ PASS — Concurrency protection is working correctly.');
    console.log(`   Winner: ${wins[0].label}`);
    console.log(`   Loser:  ${loses[0].label} (message: "${loses[0].message}")`);
    process.exit(0);
} else if (wins.length === 2) {
    console.log('\n❌ FAIL — Both requests succeeded! Double-booking detected. Concurrency protection is BROKEN.');
    process.exit(1);
} else {
    console.log('\n❌ FAIL — Both requests failed. Check if the seat was already held/booked before running the test.');
    process.exit(1);
}
