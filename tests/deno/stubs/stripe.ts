// Offline stand-in for the Stripe SDK used by stripe-webhook. Signature
// verification accepts exactly one test signature so the invalid-signature
// path can be exercised.
export const TEST_SIGNATURE = 'test-valid-signature';
export default class Stripe {
  static createFetchHttpClient() { return {}; }
  webhooks = {
    constructEventAsync: async (body: string, sig: string) => {
      if (sig !== TEST_SIGNATURE) throw new Error('No signatures found matching the expected signature for payload');
      return JSON.parse(body);
    },
  };
  subscriptions = {
    retrieve: async (id: string) => (globalThis as any).__stripeSubscriptions?.[id],
    deleteDiscount: async (id: string) => { ((globalThis as any).__stripeCalls ??= []).push(['subscriptions.deleteDiscount', id]); const s = (globalThis as any).__stripeSubscriptions?.[id]; if (s) s.discount = null; return { deleted: true }; },
  };
  invoices = { update: async (id: string, params: unknown) => { ((globalThis as any).__stripeCalls ??= []).push(['invoices.update', id, params]); return { id }; } };
  customers = { retrieve: async (id: string) => (globalThis as any).__stripeCustomers?.[id] ?? { email: null } };
  constructor(_key: string, _opts: unknown) {}
}
