import { num } from "./format";
import { ins, rollup } from "./metrics";

const TOLERANCE = 0.02;

export function reconcileSpend(parent, children) {
  const parentSpend = num(ins(parent).spend);
  const childSpend = rollup(children).spend;
  const diff = parentSpend - childSpend;
  const ratio = parentSpend > 0 ? Math.abs(diff) / parentSpend : 0;
  const matches = parentSpend === 0 ? childSpend === 0 : ratio <= TOLERANCE;
  return { parentSpend, childSpend, diff, ratio, matches };
}
