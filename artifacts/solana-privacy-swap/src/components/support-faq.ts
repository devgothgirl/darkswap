export type SupportFaq = { id: string; question: string; answer: string; category: string };

// Reviewed, static answers. Search only retrieves these entries; it never composes new advice.
export const supportFaq: SupportFaq[] = [
  {
    id: 'wrong-token-network',
    category: 'DEPOSIT SAFETY',
    question: 'I sent the wrong token or used the wrong network. What now?',
    answer: 'A deposit in the wrong currency or on the wrong network may not match your order and may be impossible to recover. Stop and do not resend. Save your order reference and the sending transaction hash, then contact support with the details. Recovery is not guaranteed.'
  },
  {
    id: 'slow-swap',
    category: 'ORDER PROGRESS',
    question: 'Why is my swap taking longer than the estimate?',
    answer: 'Route times are estimates, and processing can outlast them. If a swap appears frozen or stuck, check your order page for the latest provider-reported status; it checks automatically every 15 seconds. Do not send another deposit. If progress appears stalled, send your order reference and sending transaction hash to support.'
  },
  {
    id: 'memo-amount',
    category: 'DEPOSIT SAFETY',
    question: 'I missed the memo or sent the wrong amount. Can it be fixed?',
    answer: 'A missing required memo or an incorrect amount may prevent the deposit from being matched. Stop and do not send a second transfer to correct it. Keep the order reference and sending transaction hash and contact support. Recovery is not guaranteed.'
  },
  {
    id: 'refunds',
    category: 'RECOVERY',
    question: 'Can I get a refund?',
    answer: 'A refund is not guaranteed. Whether one is possible depends on the route, provider, order state, and the deposit that was sent; fees may apply. Do not send another deposit. Share your order reference and sending transaction hash with support so the case can be reviewed.'
  },
  {
    id: 'track-order',
    category: 'ORDER PROGRESS',
    question: 'Where can I find my order status?',
    answer: 'For the private route, use Track order in the header with your saved order ID. For Privacy swap, open its order page using the saved Solana deposit address and any required memo. Both order pages check provider status every 15 seconds. Keep your reference and sending transaction hash for any support inquiry.'
  },
  {
    id: 'privacy',
    category: 'PRIVACY',
    question: 'Is my swap anonymous?',
    answer: 'No anonymity is guaranteed. DarkSwap’s manual-deposit routes do not connect to your wallet, but Solana deposits remain visible on-chain. Timing, amounts, destination activity, provider records, and other data may allow transactions to be associated. Privacy properties differ by route.'
  },
  {
    id: 'contact',
    category: 'SUPPORT',
    question: 'How do I contact support about an order?',
    answer: 'Use the report form below or email support@darkswap.app. Include a reply email, the route if known, your order ID or deposit reference, the sending transaction hash, and a clear description of what happened. Never share a seed phrase or private key.'
  },
  {
    id: 'before-deposit',
    category: 'DEPOSIT SAFETY',
    question: 'What should I check before sending a deposit?',
    answer: 'Use only the active order instructions. Send the exact specified asset and amount on Solana before the deadline, to the shown deposit address, and include any required memo. If anything does not match or the deadline has passed, stop; do not guess or use instructions from another order.'
  }
];

export function findSupportFaq(query: string): SupportFaq[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return supportFaq;
  return supportFaq.filter(item => terms.every(term => `${item.question} ${item.answer} ${item.category}`.toLowerCase().includes(term)));
}