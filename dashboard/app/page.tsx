import Header from "@/components/Header";
import StatsCards from "@/components/StatsCards";
import FindingsBlock from "@/components/FindingsBlock";
import ShocksTable from "@/components/ShocksTable";
import Histogram from "@/components/Histogram";
import CategoryBreakdown from "@/components/CategoryBreakdown";
import Footer from "@/components/Footer";
import { DUMMY_SHOCKS, DUMMY_STATS } from "@/lib/dummyData";

export default function Home() {
  // Using dummy data until real MongoDB data flows in (Hours 16-20)
  const stats = DUMMY_STATS;
  const shocks = DUMMY_SHOCKS;

  return (
    <>
      <Header />
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <StatsCards stats={stats} />
        <FindingsBlock stats={stats} />
        <ShocksTable shocks={shocks} />
        <Histogram shocks={shocks} />
        <CategoryBreakdown stats={stats} />
      </main>
      <Footer />
    </>
  );
}
