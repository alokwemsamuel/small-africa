import { buildState } from './build';
import { db } from './db';
import snapshot from './snapshot.json';
import { addDays, freezeClock, parse, sql, ymd } from './time';

/** Dish names by quantity sold in the last `days` days, best first. */
function ranking(at, days) {
  const from = sql(addDays(parse(ymd(at)), -(days - 1)));
  const sold = new Map();
  for (const o of db.where(
    'orders',
    (x) => x.payment_status === 'paid' && x.status !== 'cancelled' && x.placed_at >= from,
  )) {
    for (const i of db.where('order_items', (x) => x.order_id === o.id)) {
      sold.set(i.dish_name, (sold.get(i.dish_name) ?? 0) + i.quantity);
    }
  }
  return [...sold.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
}

afterAll(() => freezeClock(null));

// Whatever day the presentation falls on, the dashboard tells the same story.
it('keeps Jollof and Pierogi at the top and the front desk busy, every day', async () => {
  for (let day = 0; day < 14; day++) {
    const at = addDays(parse('2026-11-02 19:30:00'), day);
    freezeClock(sql(at));
    await buildState(snapshot, at);
    const label = ymd(at);
    expect(ranking(at, 30).slice(0, 2).sort(), label).toEqual(['Pierogi Ruskie', 'Smoky Party Jollof']);
    expect(ranking(at, 7).slice(0, 3), label).toEqual(
      expect.arrayContaining(['Pierogi Ruskie', 'Smoky Party Jollof']),
    );
    const today = db.where('reservations', (r) => r.service_date === label && r.status !== 'cancelled');
    expect(today.length, label).toBeGreaterThan(0);
  }
}, 60_000);
