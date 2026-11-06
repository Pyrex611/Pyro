export class BudgetExceeded extends Error {
  constructor(public key: string, public requested: number, public remaining: number) {
    super(`Budget exceeded for "${key}": requested ${requested}, remaining ${remaining}`);
  }
}
/** Hard-stop budget guard. Strict by default: a cost unit with no cap has zero allowance. */
export class Budget {
  private used = new Map<string, number>();
  constructor(private caps: Record<string, number> = {}, private strict = true) {}
  remaining(key: string): number {
    const cap = this.caps[key];
    if (cap === undefined) return this.strict ? 0 : Infinity;
    return cap - (this.used.get(key) ?? 0);
  }
  canAfford(units: Record<string, number>): boolean {
    return Object.entries(units).every(([k, n]) => n <= 0 || n <= this.remaining(k));
  }
  spend(key: string, n: number): void {
    if (n <= 0) return;
    const rem = this.remaining(key);
    if (n > rem) throw new BudgetExceeded(key, n, rem);
    this.used.set(key, (this.used.get(key) ?? 0) + n);
  }
  snapshot(): Record<string, number> { return Object.fromEntries(this.used); }
}
