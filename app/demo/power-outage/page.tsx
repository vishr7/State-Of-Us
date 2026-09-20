import Link from 'next/link';
import PowerOutageAnimation from '@/components/animations/PowerOutageAnimation';

export default function PowerOutagePreview() {
  return <main className="h-screen overflow-y-auto bg-navy-900 px-5 py-12 text-text-primary">
    <div className="mx-auto max-w-3xl">
      <Link href="/" className="text-sm text-pgh-gold underline underline-offset-4">Back to State of Us</Link>
      <p className="mt-10 text-xs uppercase tracking-[0.2em] text-pgh-gold">Pittsburgh · Infrastructure</p>
      <h1 className="mt-4 text-xl font-pixel leading-relaxed">When the lights go out.</h1>
      <p className="mt-3 mb-8 text-text-secondary">An evening block loses power, one circuit at a time. A small backup light remains.</p>
      <PowerOutageAnimation />
      <section className="mt-12">
        <h2 className="text-lg font-semibold">In-game result preview</h2>
        <p className="mt-2 mb-4 text-sm text-text-secondary">A 360px panel matching the neighborhood drawer. Start the outage to compare the lit and dark states.</p>
        <article className="w-full max-w-[360px] min-w-0 border border-border bg-navy-900 p-4">
          <p className="text-xs uppercase tracking-wider text-pgh-gold">Infrastructure update · Preview</p>
          <h3 className="my-2 text-lg font-bold">Neighborhood power outage</h3>
          <p className="mb-4 text-xs leading-relaxed text-text-secondary">Windows and streetlights go dark across the block.</p>
          <PowerOutageAnimation autoPlay={false} />
          <p className="mt-4 border-t border-border pt-3 text-xs text-text-secondary">Visual preview only. No city outcomes are changed.</p>
        </article>
      </section>
    </div>
  </main>;
}
