import Link from 'next/link';
import WreckingBallDemolition from '@/components/animations/WreckingBallDemolition';

export default function DemolitionPreview() {
  return (
    <main className="h-screen overflow-y-auto bg-navy-900 px-5 py-12 text-text-primary">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm text-pgh-gold underline underline-offset-4">Back to State of Us</Link>
        <p className="mt-10 text-xs uppercase tracking-[0.2em] text-pgh-gold">Pittsburgh · Site works</p>
        <h1 className="mt-4 text-xl font-pixel leading-relaxed">Making room for what’s next.</h1>
        <p className="mt-3 mb-8 text-text-secondary">A heavy wrecking ball drops onto the building. Watch the impact and settling dust, then replay when you’re ready.</p>
        <WreckingBallDemolition width="100%" />
        <section className="mt-12">
          <h2 className="text-lg font-semibold">In-game panel preview</h2>
          <p className="mt-2 mb-4 text-sm text-text-secondary">A 360px panel, matching the neighborhood drawer. Each preview has its own replay control.</p>
          <article className="w-full max-w-[360px] min-w-0 border border-border bg-navy-900 p-4">
            <p className="text-xs uppercase tracking-wider text-pgh-gold">Site update · Preview</p>
            <h3 className="my-2 text-lg font-bold">Demolition works</h3>
            <p className="mb-4 text-xs leading-relaxed text-text-secondary">Crews are clearing the building. This visual preview does not change the city.</p>
            <WreckingBallDemolition autoPlay={false} />
            <p className="mt-4 border-t border-border pt-3 text-xs text-text-secondary">Neighborhood updates and result details can appear here.</p>
          </article>
        </section>
      </div>
    </main>
  );
}
