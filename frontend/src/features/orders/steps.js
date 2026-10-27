/** The customer-facing progress steps for an order, by fulfilment type. */
export function steps(order) {
  return [
    { status: 'received', label: 'Order received', hint: 'Payment confirmed. The kitchen has your ticket.' },
    { status: 'preparing', label: 'Preparing', hint: 'Cooked to order by our chefs.' },
    {
      status: 'ready',
      label: order.fulfilment === 'pickup' ? 'Ready for pickup' : 'Packed and ready',
      hint:
        order.fulfilment === 'pickup' ? 'Come to the pass at Victoria Island.' : 'Waiting for your rider.',
    },
    ...(order.fulfilment === 'delivery'
      ? [
          {
            status: 'out_for_delivery',
            label: 'Out for delivery',
            hint: 'Your rider is on the way.',
          },
          { status: 'delivered', label: 'Delivered', hint: 'Enjoy your meal.' },
        ]
      : [{ status: 'completed', label: 'Collected', hint: 'Enjoy your meal.' }]),
  ];
}
