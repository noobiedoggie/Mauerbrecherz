import type { ProductDef } from '../config/store';

/**
 * Billing - real-money purchases.
 *
 * NOT CONNECTED YET. Selling digital items in an Android app must go
 * through Google Play Billing. To go live:
 *   1. Create the in-app products in the Google Play Console with the ids
 *      in config/store.ts (Monetize > Products > In-app products).
 *   2. Add a billing plugin, e.g. `npm i @capgo/native-purchases` (or
 *      `cordova-plugin-purchase`), then `npx cap sync`.
 *   3. Replace `purchase()` below with the plugin's purchase call, grant
 *      the item only when Google confirms the payment, and acknowledge it.
 *   4. Set TEST_MODE to false.
 *
 * Until then TEST_MODE is on: buying shows a clear "test purchase, no money
 * is charged" confirmation and then grants the item, so every store item
 * can be tried in the debug build.
 */
export const TEST_MODE = true;

export class Billing {
  /** Asks the player to confirm (UI); resolves true when they accept. */
  constructor(private confirm: (title: string, text: string, ok: string) => Promise<boolean>) {}

  /** Resolves true when the purchase went through. */
  async purchase(product: ProductDef): Promise<boolean> {
    if (TEST_MODE) {
      return this.confirm(
        'TEST PURCHASE',
        `${product.name} (${product.price}). This is a test build: no money will be charged. Real payments need Google Play Billing, which is not connected yet.`,
        'GET IT FREE (TEST)',
      );
    }
    // Real billing goes here (see the steps above).
    return false;
  }
}
