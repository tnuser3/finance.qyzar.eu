import MarketTicker from "@/components/overview/market-ticker";
import { motionEnterDelay } from "@/lib/motion";

export default function MarketPage() {
  return (
    <main className="flex min-h-full flex-col">
      <MarketTicker className={motionEnterDelay(0)} />
    </main>
  );
}
